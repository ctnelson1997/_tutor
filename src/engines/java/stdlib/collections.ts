/**
 * The collection classes (#21): lists, queues, deques and stacks, sets and
 * maps, their views, Map.Entry and Iterator. Scanner and Random live in
 * scanner.ts and random.ts.
 *
 * Contents are fields, so they can be drawn: a list, set or queue keeps its
 * elements in a `__data__` array, a map its keys and values in parallel
 * `__keys__` / `__values__` arrays. Both are always in the order Java
 * iterates them, so printing, drawing and for-each just read them:
 *   ArrayList, LinkedList, Vector, Stack   by index
 *   ArrayDeque                             from head to tail
 *   PriorityQueue                          its binary heap, as java.util.PriorityQueue keeps it
 *   HashSet, HashMap                       bucket by bucket (hashing.ts)
 *   LinkedHashSet, LinkedHashMap           in insertion order (or access order)
 *   TreeSet, TreeMap                       sorted by their comparator, or naturally
 * What isn't drawn is the object's `state` (LibraryState in types.ts): the
 * modification count that makes iterators fail fast, the hash table, and a
 * restriction (List.of is immutable, Arrays.asList fixed-size).
 *
 * Views show another collection, their `__target__`: keySet() and values()
 * share the map's arrays, entrySet() holds Map.Entry objects that write
 * through to the map, and subList() is a range of its parent list. An
 * unmodifiable view (Collections.unmodifiableList, …) refers to its
 * collection as `__unmodifiable__` and refuses every change.
 * headSet()/tailSet()/subSet(), headMap()/tailMap()/subMap() and the
 * descending views are copies, which refuse changes (as an error) rather
 * than not writing them through.
 *
 * `newBuiltin` handles `new X(...)`. `callInstanceMethod` dispatches `x.m(...)`.
 * Both return `undefined` when the class or method isn't one they handle, so
 * the interpreter reports it.
 */

import {
  type JavaValue,
  type JavaObject,
  type JavaObjectRef,
  type IterationState,
  type HashTable,
  isJavaArray,
  collectionElements,
  mapContents,
  javaValueToNumber,
  javaValueToBoolean,
  javaValueToString,
  javaInt,
  javaBool,
  javaString,
  javaNull,
} from '../types';
import { type StdlibContext, StdlibError } from './context';
import {
  LIST_LIKE, SET_LIKE, MAP_LIKE,
  compareWith, comparatorOf, isComparator, libraryComparator,
  valuesEqual, backingArray, mapArrays, allocCollection, allocMap, builtinObject,
} from './util';
import { hashCodeOf, spreadHash, newTable, hashFind, hashInsert, hashRemove, presize } from './hashing';
import { isExceptionClass, newException, exceptionMethod } from './exceptions';
import { newScanner, scannerMethod } from './scanner';
import { newRandom, randomMethod } from './random';

export { scannerRemaining } from './scanner';

const ALL_BUILTIN = new Set<string>([
  ...LIST_LIKE, ...SET_LIKE, ...MAP_LIKE, 'Scanner', 'Random',
]);

export function isBuiltinCollection(className: string): boolean {
  return ALL_BUILTIN.has(className);
}

/** Methods that change a collection: an immutable one (List.of, an unmodifiable view, …) throws UnsupportedOperationException for each. */
const MUTATORS = new Set([
  'add', 'addAll', 'addFirst', 'addLast', 'offer', 'offerFirst', 'offerLast', 'push', 'pop',
  'poll', 'pollFirst', 'pollLast', 'remove', 'removeAll', 'retainAll', 'removeIf', 'removeFirst', 'removeLast',
  'removeFirstOccurrence', 'removeLastOccurrence', 'clear', 'set', 'sort', 'replaceAll',
  'put', 'putAll', 'putIfAbsent', 'replace', 'merge', 'compute', 'computeIfAbsent', 'computeIfPresent',
  'pollFirstEntry', 'pollLastEntry', 'setValue',
]);

// ── Errors ──

const failure = (cls: string, message?: string) => new StdlibError(message === undefined ? cls : `${cls}: ${message}`);
const unsupported = (message?: string) => failure('UnsupportedOperationException', message);
const noSuchElement = () => failure('NoSuchElementException');
const nullPointer = () => failure('NullPointerException');
const concurrentModification = () => failure('ConcurrentModificationException');

// ── Collections, their state and their views ──

/** A library collection (or view) being operated on. */
interface Coll {
  ref: JavaObjectRef;
  obj: JavaObject;
  cls: string;
  ctx: StdlibContext;
}

function collOf(value: JavaValue | undefined, ctx: StdlibContext): Coll | undefined {
  const obj = builtinObject(value, ctx);
  return obj ? { ref: value as JavaObjectRef, obj, cls: obj.className, ctx } : undefined;
}

/** A collection passed as an argument: null is a NullPointerException, as in Java. */
function collArg(value: JavaValue | undefined, ctx: StdlibContext): Coll {
  const c = collOf(value, ctx);
  if (!c) throw nullPointer();
  return c;
}

const stateOf = (obj: JavaObject) => (obj.state ??= {});

/** Count a structural change (Java's modCount++), so iterators over the collection fail fast. */
function modified(obj: JavaObject): void {
  const state = stateOf(obj);
  state.modCount = (state.modCount ?? 0) + 1;
}

const viewTarget = (obj: JavaObject, ctx: StdlibContext) => builtinObject(obj.fields.get('__target__') ?? obj.fields.get('__unmodifiable__'), ctx);

/** The collection a view shows, through views of views; the collection itself if it isn't a view. */
function rootOf(obj: JavaObject, ctx: StdlibContext): JavaObject {
  for (let next = viewTarget(obj, ctx); next; next = viewTarget(obj, ctx)) obj = next;
  return obj;
}

/** The modification count that iterators over a collection or view check: its root collection's. */
const modCountOf = (obj: JavaObject, ctx: StdlibContext) => rootOf(obj, ctx).state?.modCount ?? 0;

/** The elements of a collection or view in iteration order: live, except a subList's (a copy). */
function elements(c: Coll): JavaValue[] {
  if (c.cls === 'SubList') checkSubList(c);
  return collectionElements(c.obj, c.ctx.heap) ?? [];
}

/** The `__data__` array of a collection that has one, to change it. */
const data = (c: Coll) => backingArray(c.ref, c.ctx)!.elements;

const sizeOf = (c: Coll) => (c.cls === 'SubList' ? listSize(c) : elements(c).length);

/** A value as String.valueOf prints it, with the elements' own toString(). */
const text = (value: JavaValue, ctx: StdlibContext) => (ctx.stringify ? ctx.stringify(value) : javaValueToString(value, ctx.heap));

/** `o.equals(e)` for each element, as contains() and indexOf() ask (null matches null). */
const indexOfValue = (els: JavaValue[], o: JavaValue, ctx: StdlibContext) =>
  els.findIndex(e => (o.kind === 'null' ? e.kind === 'null' : valuesEqual(o, e, ctx)));

/** Objects.equals(expected, actual), with expected's equals(). */
const sameValue = (actual: JavaValue, expected: JavaValue, ctx: StdlibContext) =>
  expected.kind === 'null' ? actual.kind === 'null' : valuesEqual(expected, actual, ctx);

/**
 * Refuse a change the collection doesn't allow: none for an immutable one
 * (List.of, Collections.emptyList, …), and none that changes its size for a
 * fixed-size one (Arrays.asList).
 */
function requireChangeable(c: Coll, changesSize: boolean, message?: string): void {
  const restriction = c.obj.state?.restriction;
  if (restriction === 'immutable' || (restriction === 'fixedSize' && changesSize)) throw unsupported(message);
}

function setComparator(c: Coll, cmp: JavaValue | undefined): void {
  if (cmp && cmp.kind !== 'null') c.obj.fields.set('__cmp__', cmp);
}

/** A copy standing in for a view (headSet(), descendingMap(), …), which refuses changes since they wouldn't reach the original. */
function copyForView(value: JavaValue, view: string, ctx: StdlibContext): JavaValue {
  stateOf(collOf(value, ctx)!.obj).snapshotOf = view;
  return value;
}

// ── Construction ──

export function newBuiltin(className: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  if (className === 'PriorityQueue') return newPriorityQueue(args, ctx);
  if (LIST_LIKE.has(className)) {
    if (args[0]?.kind === 'null') throw nullPointer();
    if (args[0]?.kind === 'primitive' && javaValueToNumber(args[0]) < 0 && className !== 'ArrayDeque') {
      throw failure('IllegalArgumentException', `Illegal Capacity: ${javaValueToNumber(args[0])}`);
    }
    const source = collOf(args[0], ctx);
    const items = source ? elements(source).slice() : [];
    if (className === 'ArrayDeque' && items.some(e => e.kind === 'null')) throw nullPointer();
    return allocCollection(className, items, 'Object', ctx);
  }
  if (SET_LIKE.has(className)) {
    if (args[0]?.kind === 'null') throw nullPointer();
    const source = collOf(args[0], ctx);
    const set = collOf(allocCollection(className, [], 'Object', ctx), ctx)!;
    if (className === 'TreeSet') {
      // new TreeSet<>(sortedSet) keeps its comparator.
      setComparator(set, args.find(a => isComparator(a, ctx)) ?? (source?.cls === 'TreeSet' ? comparatorOf(source.ref, ctx) : undefined));
    } else {
      // HashSet(Collection c) sizes its table for max(c.size(), 12) elements (JDK 19+).
      const requested = args[0]?.kind === 'primitive' ? javaValueToNumber(args[0])
        : source ? Math.ceil(Math.max(elements(source).length, 12) / 0.75) : undefined;
      if (requested !== undefined && requested < 0) throw failure('IllegalArgumentException', `Illegal initial capacity: ${requested}`);
      stateOf(set.obj).table = newTable(requested);
    }
    if (source) for (const e of elements(source).slice()) setAdd(set, e);
    return set.ref;
  }
  if (MAP_LIKE.has(className)) {
    if (args[0]?.kind === 'null') throw nullPointer();
    const source = collOf(args[0], ctx);
    const map = collOf(allocMap(className, [], [], ctx), ctx)!;
    if (className === 'TreeMap') {
      setComparator(map, args.find(a => isComparator(a, ctx)) ?? (source?.cls === 'TreeMap' ? comparatorOf(source.ref, ctx) : undefined));
    } else {
      const requested = args[0]?.kind === 'primitive' ? javaValueToNumber(args[0]) : undefined;
      if (requested !== undefined && requested < 0) throw failure('IllegalArgumentException', `Illegal initial capacity: ${requested}`);
      stateOf(map.obj).table = newTable(requested);
      if (className === 'LinkedHashMap' && args[2] && javaValueToBoolean(args[2])) stateOf(map.obj).accessOrder = true;
    }
    // A copy constructor, new HashMap<>(other), sizes the table for the other map, then puts its entries.
    const contents = source ? mapContents(source.obj, ctx.heap) : undefined;
    if (contents) putAll(map, contents.keys.slice(), contents.values.slice());
    return map.ref;
  }
  if (className === 'Scanner') return newScanner(args, ctx);
  if (className === 'Random') return newRandom(args, ctx);
  if (isExceptionClass(className)) return newException(className, args, ctx);
  return undefined;
}

/** An immutable list (List.of, List.copyOf, Collections.emptyList, nCopies, singletonList). */
export function immutableList(items: JavaValue[], ctx: StdlibContext): JavaValue {
  const list = allocCollection('ArrayList', items, 'Object', ctx);
  stateOf(collOf(list, ctx)!.obj).restriction = 'immutable';
  return list;
}

/** An immutable set (Set.of, Set.copyOf, Collections.emptySet, singleton). Set.of rejects duplicates. */
export function immutableSet(items: JavaValue[], rejectDuplicates: boolean, ctx: StdlibContext): JavaValue {
  const set = collOf(allocCollection('LinkedHashSet', [], 'Object', ctx), ctx)!;
  stateOf(set.obj).table = newTable();
  for (const e of items) {
    if (!setAdd(set, e) && rejectDuplicates) throw failure('IllegalArgumentException', `duplicate element: ${text(e, ctx)}`);
  }
  stateOf(set.obj).restriction = 'immutable';
  return set.ref;
}

/** An immutable map (Map.of, Map.copyOf, Collections.emptyMap, singletonMap). Map.of rejects duplicate keys. */
export function immutableMap(keys: JavaValue[], values: JavaValue[], rejectDuplicates: boolean, ctx: StdlibContext): JavaValue {
  const map = collOf(allocMap('LinkedHashMap', [], [], ctx), ctx)!;
  stateOf(map.obj).table = newTable();
  keys.forEach((k, i) => {
    if (rejectDuplicates && mapFind(map, k) >= 0) throw failure('IllegalArgumentException', `duplicate key: ${text(k, ctx)}`);
    mapPut(map, k, values[i]);
  });
  stateOf(map.obj).restriction = 'immutable';
  return map.ref;
}

/**
 * Arrays.asList: a fixed-size list. Given an array of objects it is a view of
 * that array: both are the same storage, so a change to either shows in the other.
 */
export function fixedSizeList(array: JavaValue, ctx: StdlibContext): JavaValue {
  const heapId = ctx.allocObject('ArrayList', new Map<string, JavaValue>([['__data__', array]]));
  const list: JavaValue = { kind: 'objectRef', heapId, className: 'ArrayList' };
  stateOf(collOf(list, ctx)!.obj).restriction = 'fixedSize';
  return list;
}

/** An unmodifiable view (Collections.unmodifiableList, …): reads go to the collection, changes are refused. */
export function unmodifiableView(value: JavaValue, ctx: StdlibContext): JavaValue {
  const target = collArg(value, ctx);
  const heapId = ctx.allocObject(target.cls, new Map<string, JavaValue>([['__unmodifiable__', target.ref]]));
  const view: JavaValue = { kind: 'objectRef', heapId, className: target.cls };
  stateOf(collOf(view, ctx)!.obj).restriction = 'immutable';
  return view;
}

// ── Dispatch ──

export function callInstanceMethod(
  ref: JavaValue,
  method: string,
  args: JavaValue[],
  ctx: StdlibContext,
): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const cls = ref.className;
  if (cls === 'Scanner') return scannerMethod(ref, method, ctx);
  if (cls === 'Random') return randomMethod(ref, method, args, ctx);
  if (cls === 'Comparator') return comparatorMethod(ref, method, args, ctx);
  if (isExceptionClass(cls)) return exceptionMethod(ref, method, ctx);
  const c = collOf(ref, ctx);
  if (!c) return undefined;
  if (cls === 'Iterator') return iteratorMethod(c, method);
  const state = c.obj.state;
  if (MUTATORS.has(method)) {
    if (state?.restriction === 'immutable') throw unsupported();
    if (state?.snapshotOf) throw new StdlibError(`Changing the result of ${state.snapshotOf} isn't supported in JavaTutor yet, since it is a copy here, not a view`);
  }
  if (cls === 'MapEntry') return entryMethod(c, method, args);
  if (c.obj.fields.has('__unmodifiable__')) return unmodifiableMethod(c, method, args);
  switch (cls) {
    case 'KeySet': case 'Values': case 'EntrySet': return mapViewMethod(c, method, args);
    case 'SubList': return listMethod(c, method, args);
    case 'PriorityQueue': return priorityQueueMethod(c, method, args);
    case 'ArrayDeque': return dequeMethod(c, method, args) ?? collectionMethod(c, method, args);
    case 'LinkedList': return dequeMethod(c, method, args) ?? listMethod(c, method, args);
    case 'Stack': return stackMethod(c, method, args) ?? listMethod(c, method, args);
  }
  if (LIST_LIKE.has(cls)) return listMethod(c, method, args);
  if (SET_LIKE.has(cls)) return setMethod(c, method, args);
  if (MAP_LIKE.has(cls)) return mapMethod(c, method, args);
  return undefined;
}

/** Methods of a library comparator such as Collections.reverseOrder(). */
function comparatorMethod(ref: JavaValue, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  if (method === 'compare') return javaInt(compareWith(ref, args[0], args[1], ctx));
  if (method === 'reversed') return libraryComparator('reverse', ref, ctx);
  return undefined;
}

// ── What every collection has ──

/** Whether a collection contains a value, as its contains() decides: a hash or tree lookup for sets (and a map's keys), equals() for the rest. */
function containsValue(c: Coll, v: JavaValue): boolean {
  if (c.obj.fields.has('__unmodifiable__')) return containsValue(collOf(c.obj.fields.get('__unmodifiable__'), c.ctx)!, v);
  if (SET_LIKE.has(c.cls)) return setFind(c, v) >= 0;
  if (c.cls === 'KeySet') return mapFind(parentOf(c), v) >= 0;
  if (c.cls === 'EntrySet') return entryIndex(parentOf(c), v) >= 0;
  return indexOfValue(elements(c), v, c.ctx) >= 0;
}

/** Add to any collection, for addAll(): true if it changed. */
function addValue(c: Coll, v: JavaValue): boolean {
  if (SET_LIKE.has(c.cls)) return setAdd(c, v);
  if (c.cls === 'PriorityQueue') { priorityQueueOffer(c, v); return true; }
  if (c.cls === 'ArrayDeque') { if (v.kind === 'null') throw nullPointer(); data(c).push(v); modified(c.obj); return true; }
  if (c.cls === 'KeySet' || c.cls === 'Values' || c.cls === 'EntrySet') throw unsupported();
  requireChangeable(c, true);
  listInsert(c, listSize(c), v);
  return true;
}

/**
 * Remove the element at an iteration index, for Iterator.remove(),
 * removeAll() and retainAll(). A PriorityQueue returns an element it had to
 * move before that index (see its iterator).
 */
function removeAtIndex(c: Coll, i: number): JavaValue | undefined {
  if (c.obj.fields.has('__unmodifiable__')) throw unsupported();
  switch (c.cls) {
    case 'PriorityQueue': return priorityQueueRemoveAt(c, i);
    case 'ArrayDeque': data(c).splice(i, 1); modified(c.obj); return undefined;
    case 'KeySet': case 'Values': mapRemoveAt(parentOf(c), i); return undefined;
    case 'EntrySet': {
      const map = parentOf(c);
      const j = mapFind(map, entryField(data(c)[i], 'key', c.ctx));
      if (j >= 0) mapRemoveAt(map, j);
      data(c).splice(i, 1);
      return undefined;
    }
  }
  if (SET_LIKE.has(c.cls)) { setRemoveAt(c, i); return undefined; }
  requireChangeable(c, true, 'remove');
  listRemoveAt(c, i);
  return undefined;
}

function clearAll(c: Coll): void {
  if (c.obj.fields.has('__unmodifiable__')) throw unsupported();
  if (c.cls === 'KeySet' || c.cls === 'Values' || c.cls === 'EntrySet') {
    mapClear(parentOf(c));
    if (c.cls === 'EntrySet') data(c).length = 0;
    return;
  }
  if (c.cls === 'SubList') {
    requireChangeable(c, listSize(c) > 0);
    for (let i = listSize(c) - 1; i >= 0; i--) listRemoveAt(c, i);
    return;
  }
  requireChangeable(c, data(c).length > 0);
  data(c).length = 0;
  if (c.obj.state?.table) c.obj.state.table.hashes.length = 0; // a HashSet keeps its capacity
  modified(c.obj);
}

/** Remove the elements a test picks (removeAll, retainAll): true if any were. */
function removeWhere(c: Coll, test: (e: JavaValue) => boolean): boolean {
  const els = elements(c).slice();
  const doomed = els.map(test);
  if (!doomed.includes(true)) return false;
  if (c.cls === 'PriorityQueue') {
    // PriorityQueue.removeAll keeps the others in their order, then heapifies.
    data(c).splice(0, els.length, ...els.filter((_, i) => !doomed[i]));
    heapify(c);
    modified(c.obj);
    return true;
  }
  for (let i = els.length - 1; i >= 0; i--) if (doomed[i]) removeAtIndex(c, i);
  return true;
}

/** toArray() is an Object[]; toArray(T[] a) fills a if it is big enough (a null after the last), else a new T[]. */
function toArray(c: Coll, target: JavaValue | undefined): JavaValue {
  const els = elements(c).slice();
  const arr = target?.kind === 'arrayRef' ? c.ctx.heap.get(target.heapId) : undefined;
  if (target && arr && isJavaArray(arr)) {
    if (arr.elements.length < els.length) return { kind: 'arrayRef', heapId: c.ctx.allocArray(arr.elementType, els) };
    els.forEach((e, i) => { arr.elements[i] = e; });
    if (arr.elements.length > els.length) arr.elements[els.length] = javaNull();
    return target;
  }
  return { kind: 'arrayRef', heapId: c.ctx.allocArray('Object', els) };
}

/** Methods every collection has (java.util.Collection's), for what a class's own methods don't cover. */
function collectionMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  const { ctx } = c;
  switch (method) {
    case 'size': return javaInt(sizeOf(c));
    case 'isEmpty': return javaBool(sizeOf(c) === 0);
    case 'contains': return javaBool(containsValue(c, args[0]));
    case 'containsAll': return javaBool(elements(collArg(args[0], ctx)).every(e => containsValue(c, e)));
    case 'addAll': {
      let changed = false;
      for (const e of elements(collArg(args[0], ctx)).slice()) changed = addValue(c, e) || changed;
      return javaBool(changed);
    }
    case 'removeAll': { const other = collArg(args[0], ctx); return javaBool(removeWhere(c, e => containsValue(other, e))); }
    case 'retainAll': { const other = collArg(args[0], ctx); return javaBool(removeWhere(c, e => !containsValue(other, e))); }
    case 'clear': clearAll(c); return javaNull();
    case 'iterator': return makeIterator(c);
    case 'toArray': return toArray(c, args[0]);
    case 'toString': return javaString(text(c.ref, ctx));
    case 'equals': return javaBool(valuesEqual(c.ref, args[0], ctx));
    case 'hashCode': return javaInt(hashCodeOf(c.ref, ctx));
  }
  return undefined;
}

// ── Lists: ArrayList, LinkedList, Vector, Stack, and subList() ──

const fieldInt = (obj: JavaObject, name: string) => javaValueToNumber(obj.fields.get(name)!);
const parentOf = (c: Coll) => collOf(c.obj.fields.get('__target__'), c.ctx)!;

/** A subList is invalid once its parent changed size other than through it (ConcurrentModificationException). */
function checkSubList(c: Coll): void {
  if ((c.obj.state?.modCount ?? 0) !== modCountOf(c.obj, c.ctx)) throw concurrentModification();
}

/** After a change made through a subList: its new size, and the parent's count it expects now. */
function subListChanged(c: Coll, delta: number): void {
  c.obj.fields.set('__size__', javaInt(fieldInt(c.obj, '__size__') + delta));
  stateOf(c.obj).modCount = modCountOf(c.obj, c.ctx);
}

function listSize(c: Coll): number {
  if (c.cls !== 'SubList') return data(c).length;
  checkSubList(c);
  return fieldInt(c.obj, '__size__');
}

function listGet(c: Coll, i: number): JavaValue {
  if (c.cls !== 'SubList') return data(c)[i];
  checkSubList(c);
  return listGet(parentOf(c), fieldInt(c.obj, '__offset__') + i);
}

function listSet(c: Coll, i: number, v: JavaValue): void {
  if (c.cls !== 'SubList') { data(c)[i] = v; return; }
  checkSubList(c);
  listSet(parentOf(c), fieldInt(c.obj, '__offset__') + i, v);
}

function listInsert(c: Coll, i: number, v: JavaValue): void {
  if (c.cls !== 'SubList') { data(c).splice(i, 0, v); modified(c.obj); return; }
  checkSubList(c);
  listInsert(parentOf(c), fieldInt(c.obj, '__offset__') + i, v);
  subListChanged(c, 1);
}

function listRemoveAt(c: Coll, i: number): JavaValue {
  if (c.cls !== 'SubList') { const [removed] = data(c).splice(i, 1); modified(c.obj); return removed; }
  checkSubList(c);
  const removed = listRemoveAt(parentOf(c), fieldInt(c.obj, '__offset__') + i);
  subListChanged(c, -1);
  return removed;
}

/** The exception for a bad index, with the message each class gives. */
function indexError(c: Coll, i: number, n: number, adding: boolean): StdlibError {
  if (c.cls === 'LinkedList') return failure('IndexOutOfBoundsException', `Index: ${i}, Size: ${n}`);
  if (c.cls === 'Vector' || c.cls === 'Stack') {
    return failure('ArrayIndexOutOfBoundsException', adding ? `${i} > ${n}` : i >= 0 ? `Array index out of range: ${i}` : `Index ${i} out of bounds for length ${n}`);
  }
  if (adding) return failure('IndexOutOfBoundsException', `Index: ${i}, Size: ${n}`);
  // Arrays.asList and List.of index their array directly.
  const direct = c.obj.state?.restriction !== undefined && c.cls !== 'SubList';
  return failure(direct ? 'ArrayIndexOutOfBoundsException' : 'IndexOutOfBoundsException', `Index ${i} out of bounds for length ${n}`);
}

/**
 * remove(int) or remove(Object)? An int, short, byte or char argument is an
 * index (char widens to int); a boxed value (remove(Integer.valueOf(40))) or
 * anything else, an element.
 */
const isIndexArgument = (v: JavaValue | undefined) =>
  v?.kind === 'primitive' && !v.boxed && (v.javaType === 'int' || v.javaType === 'short' || v.javaType === 'byte' || v.javaType === 'char');

function newSubList(parent: Coll, from: number, to: number): JavaValue {
  const { ctx } = parent;
  const heapId = ctx.allocObject('SubList', new Map<string, JavaValue>([
    ['__target__', parent.ref],
    ['__offset__', javaInt(from)],
    ['__size__', javaInt(to - from)],
  ]));
  const sub = collOf({ kind: 'objectRef', heapId, className: 'SubList' }, ctx)!;
  sub.obj.state = { modCount: modCountOf(parent.obj, ctx), restriction: parent.obj.state?.restriction };
  return sub.ref;
}

/** Sort a list (List.sort, Collections.sort). ArrayList and Vector count it as a change. */
function sortList(c: Coll, cmp: JavaValue | undefined): void {
  const sorted = elements(c).slice().sort((a, b) => compareWith(cmp, a, b, c.ctx));
  sorted.forEach((e, i) => listSet(c, i, e));
  if (c.cls === 'ArrayList' || c.cls === 'Vector' || c.cls === 'Stack') modified(c.obj);
}

function listMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  const { ctx } = c;
  const index = (v: JavaValue) => javaValueToNumber(v) | 0;
  const checkIndex = (i: number) => { const n = listSize(c); if (i < 0 || i >= n) throw indexError(c, i, n, false); return i; };
  const checkPosition = (i: number) => { const n = listSize(c); if (i < 0 || i > n) throw indexError(c, i, n, true); return i; };
  switch (method) {
    case 'get': case 'elementAt': return listGet(c, checkIndex(index(args[0])));
    case 'set': {
      requireChangeable(c, false);
      const i = checkIndex(index(args[0]));
      const old = listGet(c, i);
      listSet(c, i, args[1]);
      return old;
    }
    case 'setElementAt': requireChangeable(c, false); listSet(c, checkIndex(index(args[1])), args[0]); return javaNull();
    case 'add': case 'addElement':
      requireChangeable(c, true);
      if (args.length === 2) { listInsert(c, checkPosition(index(args[0])), args[1]); return javaNull(); }
      listInsert(c, listSize(c), args[0]);
      return method === 'add' ? javaBool(true) : javaNull();
    case 'insertElementAt': requireChangeable(c, true); listInsert(c, checkPosition(index(args[1])), args[0]); return javaNull();
    case 'addFirst': requireChangeable(c, true); listInsert(c, 0, args[0]); return javaNull();
    case 'addLast': requireChangeable(c, true); listInsert(c, listSize(c), args[0]); return javaNull();
    case 'addAll': {
      requireChangeable(c, true);
      const at = args.length === 2 ? checkPosition(index(args[0])) : listSize(c);
      const items = elements(collArg(args[args.length - 1], ctx)).slice();
      items.forEach((e, k) => listInsert(c, at + k, e));
      return javaBool(items.length > 0);
    }
    case 'remove': case 'removeElementAt': case 'removeElement':
      if (method === 'removeElementAt' || (method === 'remove' && isIndexArgument(args[0]))) {
        requireChangeable(c, true);
        const removed = listRemoveAt(c, checkIndex(index(args[0])));
        return method === 'remove' ? removed : javaNull();
      } else {
        const i = indexOfValue(elements(c), args[0], ctx);
        if (i < 0) return javaBool(false);
        requireChangeable(c, true, 'remove');
        listRemoveAt(c, i);
        return javaBool(true);
      }
    case 'removeFirst': case 'removeLast': {
      requireChangeable(c, true);
      const n = listSize(c);
      if (n === 0) throw noSuchElement();
      return listRemoveAt(c, method === 'removeFirst' ? 0 : n - 1);
    }
    case 'getFirst': case 'getLast': case 'firstElement': case 'lastElement': {
      const n = listSize(c);
      if (n === 0) throw noSuchElement();
      return listGet(c, method === 'getFirst' || method === 'firstElement' ? 0 : n - 1);
    }
    case 'indexOf': return javaInt(indexOfValue(elements(c), args[0], ctx));
    case 'lastIndexOf': {
      const els = elements(c);
      for (let i = els.length - 1; i >= 0; i--) if (sameValue(els[i], args[0], ctx)) return javaInt(i);
      return javaInt(-1);
    }
    case 'removeAllElements': clearAll(c); return javaNull();
    case 'subList': {
      const from = index(args[0]), to = index(args[1]), n = listSize(c);
      if (from < 0) throw failure('IndexOutOfBoundsException', `fromIndex = ${from}`);
      if (to > n) throw failure('IndexOutOfBoundsException', `toIndex = ${to}`);
      if (from > to) throw failure('IllegalArgumentException', `fromIndex(${from}) > toIndex(${to})`);
      return newSubList(c, from, to);
    }
    case 'sort': requireChangeable(c, false); sortList(c, args[0]); return javaNull();
    case 'ensureCapacity': case 'trimToSize': return javaNull();
  }
  return collectionMethod(c, method, args);
}

// ── Stack, and the deque methods of ArrayDeque and LinkedList ──

function stackMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  const el = data(c);
  switch (method) {
    case 'push': el.push(args[0]); modified(c.obj); return args[0];
    case 'pop': case 'peek': {
      if (!el.length) throw failure('EmptyStackException');
      if (method === 'peek') return el[el.length - 1];
      const top = el.pop()!;
      modified(c.obj);
      return top;
    }
    case 'empty': return javaBool(el.length === 0);
    case 'search': {
      // 1-based distance from the top, or -1.
      for (let i = el.length - 1; i >= 0; i--) if (sameValue(el[i], args[0], c.ctx)) return javaInt(el.length - i);
      return javaInt(-1);
    }
  }
  return undefined;
}

/** Deque and Queue methods (ArrayDeque and LinkedList). ArrayDeque refuses null elements. */
function dequeMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  const el = data(c);
  const isArrayDeque = c.cls === 'ArrayDeque';
  const element = (v: JavaValue) => { if (isArrayDeque && v.kind === 'null') throw nullPointer(); return v; };
  const take = (front: boolean, required: boolean): JavaValue => {
    if (!el.length) { if (required) throw noSuchElement(); return javaNull(); }
    const v = front ? el.shift()! : el.pop()!;
    modified(c.obj);
    return v;
  };
  const look = (front: boolean, required: boolean): JavaValue => {
    if (!el.length) { if (required) throw noSuchElement(); return javaNull(); }
    return front ? el[0] : el[el.length - 1];
  };
  const removeOccurrence = (last: boolean): JavaValue => {
    let i = -1;
    if (last) { for (let k = el.length - 1; k >= 0 && i < 0; k--) if (sameValue(el[k], args[0], c.ctx)) i = k; }
    else i = indexOfValue(el, args[0], c.ctx);
    if (i < 0) return javaBool(false);
    el.splice(i, 1);
    modified(c.obj);
    return javaBool(true);
  };
  switch (method) {
    case 'addFirst': case 'offerFirst': case 'push':
      el.unshift(element(args[0])); modified(c.obj);
      return method === 'offerFirst' ? javaBool(true) : javaNull();
    case 'addLast': case 'offerLast': case 'offer':
      el.push(element(args[0])); modified(c.obj);
      return method === 'addLast' ? javaNull() : javaBool(true);
    case 'add':
      if (!isArrayDeque) return undefined; // LinkedList.add(i, x) is the List's
      el.push(element(args[0])); modified(c.obj);
      return javaBool(true);
    case 'remove':
      if (args.length === 0) return take(true, true);
      return isArrayDeque ? removeOccurrence(false) : undefined; // LinkedList.remove(i) / remove(o) are the List's
    case 'pop': case 'removeFirst': return take(true, true);
    case 'removeLast': return take(false, true);
    case 'poll': case 'pollFirst': return take(true, false);
    case 'pollLast': return take(false, false);
    case 'peek': case 'peekFirst': return look(true, false);
    case 'peekLast': return look(false, false);
    case 'element': case 'getFirst': return look(true, true);
    case 'getLast': return look(false, true);
    case 'removeFirstOccurrence': return removeOccurrence(false);
    case 'removeLastOccurrence': return removeOccurrence(true);
    case 'descendingIterator': return makeIterator(c, true);
  }
  return undefined;
}

// ── PriorityQueue: a binary heap, as java.util.PriorityQueue keeps it ──

function newPriorityQueue(args: JavaValue[], ctx: StdlibContext): JavaValue {
  if (args[0]?.kind === 'null') throw nullPointer();
  const cmp = args.find(a => isComparator(a, ctx));
  const source = cmp ? undefined : collOf(args[0], ctx);
  const pq = collOf(allocCollection('PriorityQueue', [], 'Object', ctx), ctx)!;
  setComparator(pq, cmp);
  if (source) {
    const items = elements(source).slice();
    if (items.some(e => e.kind === 'null')) throw nullPointer();
    data(pq).push(...items);
    // Another PriorityQueue's heap, or a TreeSet's sorted order, is already a heap; anything else is heapified.
    if (source.cls === 'PriorityQueue' || source.cls === 'TreeSet') setComparator(pq, comparatorOf(source.ref, ctx));
    else heapify(pq);
  }
  return pq.ref;
}

function siftUp(c: Coll, k: number, x: JavaValue): void {
  const es = data(c), cmp = comparatorOf(c.ref, c.ctx);
  while (k > 0) {
    const parent = (k - 1) >>> 1;
    const e = es[parent];
    if (compareWith(cmp, x, e, c.ctx) >= 0) break;
    es[k] = e;
    k = parent;
  }
  es[k] = x;
}

function siftDown(c: Coll, k: number, x: JavaValue, n: number): void {
  const es = data(c), cmp = comparatorOf(c.ref, c.ctx);
  const half = n >>> 1;
  while (k < half) {
    let child = 2 * k + 1;
    let smaller = es[child];
    const right = child + 1;
    if (right < n && compareWith(cmp, smaller, es[right], c.ctx) > 0) smaller = es[(child = right)];
    if (compareWith(cmp, x, smaller, c.ctx) <= 0) break;
    es[k] = smaller;
    k = child;
  }
  es[k] = x;
}

function heapify(c: Coll): void {
  const es = data(c), n = es.length;
  for (let i = (n >>> 1) - 1; i >= 0; i--) siftDown(c, i, es[i], n);
}

function priorityQueueOffer(c: Coll, v: JavaValue): void {
  if (v.kind === 'null') throw nullPointer();
  modified(c.obj);
  const es = data(c);
  es.push(v);
  siftUp(c, es.length - 1, v);
}

function priorityQueuePoll(c: Coll): JavaValue | undefined {
  const es = data(c);
  if (!es.length) return undefined;
  modified(c.obj);
  const result = es[0];
  const last = es.pop()!;
  if (es.length > 0) siftDown(c, 0, last, es.length);
  return result;
}

/** PriorityQueue.removeAt: returns the last element if it had to move up, before index i. */
function priorityQueueRemoveAt(c: Coll, i: number): JavaValue | undefined {
  const es = data(c);
  modified(c.obj);
  const s = es.length - 1;
  if (s === i) { es.pop(); return undefined; }
  const moved = es.pop()!;
  siftDown(c, i, moved, s);
  if (es[i] === moved) {
    siftUp(c, i, moved);
    if (es[i] !== moved) return moved;
  }
  return undefined;
}

function priorityQueueMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  const es = data(c);
  switch (method) {
    case 'add': case 'offer': priorityQueueOffer(c, args[0]); return javaBool(true);
    case 'poll': return priorityQueuePoll(c) ?? javaNull();
    case 'remove': {
      if (args.length === 0) { const head = priorityQueuePoll(c); if (!head) throw noSuchElement(); return head; }
      const i = args[0].kind === 'null' ? -1 : indexOfValue(es, args[0], c.ctx);
      if (i < 0) return javaBool(false);
      priorityQueueRemoveAt(c, i);
      return javaBool(true);
    }
    case 'peek': return es[0] ?? javaNull();
    case 'element': if (!es.length) throw noSuchElement(); return es[0];
    case 'comparator': return comparatorOf(c.ref, c.ctx) ?? javaNull();
  }
  return collectionMethod(c, method, args);
}

// ── Sets: HashSet, LinkedHashSet (hashing.ts) and TreeSet ──

const isTree = (cls: string) => cls === 'TreeSet' || cls === 'TreeMap';
const bucketOrdered = (cls: string) => cls === 'HashSet' || cls === 'HashMap';
/** A hash set's or map's table. Contents that came without one (none should) are hashed where they are. */
function tableOf(c: Coll): HashTable {
  const state = stateOf(c.obj);
  const keys = MAP_LIKE.has(c.cls) ? keysOf(c) : data(c);
  if (state.table?.hashes.length !== keys.length) {
    state.table = newTable(Math.max(16, Math.ceil(keys.length / 0.75)));
    state.table.capacity = state.table.initialCapacity;
    state.table.hashes = keys.map(k => spreadHash(k, c.ctx));
  }
  return state.table;
}

/** Natural ordering has no place for null (NullPointerException); a comparator decides for itself. */
function requireOrderable(cmp: JavaValue | undefined, key: JavaValue): void {
  if (!cmp && key.kind === 'null') throw nullPointer();
}

/**
 * A tree's binary search for a key: its index, or -(insertion point) - 1.
 * The key is compared with each element (key first), as TreeMap does.
 */
function treeSearch(c: Coll, keys: JavaValue[], key: JavaValue): number {
  const cmp = comparatorOf(c.ref, c.ctx);
  requireOrderable(cmp, key);
  let lo = 0, hi = keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const r = compareWith(cmp, key, keys[mid], c.ctx);
    if (r > 0) lo = mid + 1;
    else if (r < 0) hi = mid - 1;
    else return mid;
  }
  return -(lo + 1);
}

/** Before a tree's first key, TreeMap.put compares the key with itself, so a key that can't be ordered fails at once. */
function checkFirstTreeKey(c: Coll, key: JavaValue): void {
  const cmp = comparatorOf(c.ref, c.ctx);
  requireOrderable(cmp, key);
  compareWith(cmp, key, key, c.ctx);
}

function setFind(c: Coll, v: JavaValue): number {
  const els = data(c);
  if (isTree(c.cls)) { const i = treeSearch(c, els, v); return i >= 0 ? i : -1; }
  return hashFind(tableOf(c), els, v, spreadHash(v, c.ctx), c.ctx);
}

function setAdd(c: Coll, v: JavaValue): boolean {
  const els = data(c);
  if (isTree(c.cls)) {
    if (els.length === 0) checkFirstTreeKey(c, v);
    const i = treeSearch(c, els, v);
    if (i >= 0) return false;
    els.splice(-i - 1, 0, v);
  } else {
    const hash = spreadHash(v, c.ctx);
    if (hashFind(tableOf(c), els, v, hash, c.ctx) >= 0) return false;
    hashInsert(tableOf(c), [els], [v], hash, bucketOrdered(c.cls));
  }
  modified(c.obj);
  return true;
}

function setRemoveAt(c: Coll, i: number): void {
  const els = data(c);
  if (isTree(c.cls)) els.splice(i, 1);
  else hashRemove(tableOf(c), [els], i);
  modified(c.obj);
}

function setMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  switch (method) {
    case 'add': return javaBool(setAdd(c, args[0]));
    case 'remove': {
      const i = setFind(c, args[0]);
      if (i < 0) return javaBool(false);
      setRemoveAt(c, i);
      return javaBool(true);
    }
  }
  if (c.cls === 'TreeSet') {
    const result = navigableSetMethod(c, c, data(c), method, args, i => setRemoveAt(c, i));
    if (result !== undefined) return result;
  }
  return collectionMethod(c, method, args);
}

/**
 * Where a key falls among sorted keys: the index of the least key ≥ it
 * (ceiling), > it (higher), or the greatest ≤ it (floor), < it (lower); -1
 * if there is none.
 */
function neighbor(tree: Coll, keys: JavaValue[], key: JavaValue, which: string): number {
  const cmp = comparatorOf(tree.ref, tree.ctx);
  requireOrderable(cmp, key);
  // The first index whose key is greater than (strict) or at least the given one.
  const bound = (strict: boolean) => {
    let lo = 0, hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const r = compareWith(cmp, key, keys[mid], tree.ctx);
      if (strict ? r >= 0 : r > 0) lo = mid + 1; else hi = mid;
    }
    return lo;
  };
  switch (which) {
    case 'ceiling': { const i = bound(false); return i < keys.length ? i : -1; }
    case 'higher': { const i = bound(true); return i < keys.length ? i : -1; }
    case 'floor': return bound(true) - 1;
    default: return bound(false) - 1; // lower
  }
}

/**
 * The range of sorted keys a headSet/tailSet/subSet (or headMap/tailMap/
 * subMap) call asks for, as [start, end) indices: head(to[, inclusive=false]),
 * tail(from[, inclusive=true]), sub(from, to) or sub(from, fromInclusive, to, toInclusive).
 */
function keyRange(tree: Coll, keys: JavaValue[], kind: 'head' | 'tail' | 'sub', args: JavaValue[]): [number, number] {
  const flag = (v: JavaValue | undefined, dflt: boolean) => (v ? javaValueToBoolean(v) : dflt);
  let from: [JavaValue, boolean] | undefined, to: [JavaValue, boolean] | undefined;
  if (kind === 'head') to = [args[0], flag(args[1], false)];
  else if (kind === 'tail') from = [args[0], flag(args[1], true)];
  else if (args.length === 4) { from = [args[0], flag(args[1], true)]; to = [args[2], flag(args[3], false)]; }
  else { from = [args[0], true]; to = [args[1], false]; }
  if (from && to && compareWith(comparatorOf(tree.ref, tree.ctx), from[0], to[0], tree.ctx) > 0) throw failure('IllegalArgumentException', 'fromKey > toKey');
  const at = (key: JavaValue, after: boolean) => {
    const i = neighbor(tree, keys, key, after ? 'higher' : 'ceiling');
    return i < 0 ? keys.length : i;
  };
  return [from ? at(from[0], !from[1]) : 0, to ? at(to[0], to[1]) : keys.length];
}

/** The reverse of a tree's ordering, for the descending views. */
const reversedOrder = (tree: Coll) => libraryComparator('reverse', comparatorOf(tree.ref, tree.ctx), tree.ctx);

/** A new TreeSet with a comparator and keys, which are already in its order. */
function newTreeSet(cmp: JavaValue | undefined, keys: JavaValue[], ctx: StdlibContext): JavaValue {
  const set = collOf(allocCollection('TreeSet', keys, 'Object', ctx), ctx)!;
  setComparator(set, cmp);
  return set.ref;
}

/**
 * NavigableSet's methods, on the sorted keys of a TreeSet or of a TreeMap's
 * keySet(). `tree` holds the comparator, `owner` is the set the call was on.
 */
function navigableSetMethod(tree: Coll, owner: Coll, keys: JavaValue[], method: string, args: JavaValue[], removeAt: (i: number) => void): JavaValue | undefined {
  const { ctx } = tree;
  switch (method) {
    case 'first': if (!keys.length) throw noSuchElement(); return keys[0];
    case 'last': if (!keys.length) throw noSuchElement(); return keys[keys.length - 1];
    case 'pollFirst': case 'pollLast': {
      if (!keys.length) return javaNull();
      const i = method === 'pollFirst' ? 0 : keys.length - 1;
      const v = keys[i];
      removeAt(i);
      return v;
    }
    case 'floor': case 'lower': case 'ceiling': case 'higher': {
      const i = neighbor(tree, keys, args[0], method);
      return i >= 0 ? keys[i] : javaNull();
    }
    case 'headSet': case 'tailSet': case 'subSet': {
      const [start, end] = keyRange(tree, keys, method === 'headSet' ? 'head' : method === 'tailSet' ? 'tail' : 'sub', args);
      return copyForView(newTreeSet(comparatorOf(tree.ref, ctx), keys.slice(start, end), ctx), `${method}()`, ctx);
    }
    case 'descendingSet': return copyForView(newTreeSet(reversedOrder(tree), keys.slice().reverse(), ctx), 'descendingSet()', ctx);
    case 'descendingIterator': return makeIterator(owner, true);
    case 'comparator': return comparatorOf(tree.ref, ctx) ?? javaNull();
  }
  return undefined;
}

// ── Maps: HashMap, LinkedHashMap (hashing.ts) and TreeMap ──

const keysOf = (c: Coll) => mapArrays(c.ref, c.ctx)!.keys.elements;
const valuesOf = (c: Coll) => mapArrays(c.ref, c.ctx)!.values.elements;

function mapFind(c: Coll, key: JavaValue): number {
  if (isTree(c.cls)) { const i = treeSearch(c, keysOf(c), key); return i >= 0 ? i : -1; }
  return hashFind(tableOf(c), keysOf(c), key, spreadHash(key, c.ctx), c.ctx);
}

/** put(key, value): the old value, or null. */
function mapPut(c: Coll, key: JavaValue, value: JavaValue): JavaValue {
  const ks = keysOf(c), vs = valuesOf(c);
  if (isTree(c.cls)) {
    if (ks.length === 0) checkFirstTreeKey(c, key);
    const i = treeSearch(c, ks, key);
    if (i >= 0) { const old = vs[i]; vs[i] = value; return old; }
    ks.splice(-i - 1, 0, key);
    vs.splice(-i - 1, 0, value);
  } else {
    const hash = spreadHash(key, c.ctx);
    const i = hashFind(tableOf(c), ks, key, hash, c.ctx);
    if (i >= 0) { const old = vs[i]; vs[i] = value; accessed(c, i); return old; }
    hashInsert(tableOf(c), [ks, vs], [key, value], hash, bucketOrdered(c.cls));
  }
  modified(c.obj);
  return javaNull();
}

/** In an access-ordered LinkedHashMap, using an entry moves it to the end (and counts as a change). */
function accessed(c: Coll, i: number): void {
  if (!c.obj.state?.accessOrder) return;
  const ks = keysOf(c), vs = valuesOf(c), hashes = tableOf(c).hashes;
  if (i === ks.length - 1) return;
  ks.push(ks.splice(i, 1)[0]);
  vs.push(vs.splice(i, 1)[0]);
  hashes.push(hashes.splice(i, 1)[0]);
  modified(c.obj);
}

/** Remove the entry at an index: its value. */
function mapRemoveAt(c: Coll, i: number): JavaValue {
  const ks = keysOf(c), vs = valuesOf(c);
  const old = vs[i];
  if (isTree(c.cls)) { ks.splice(i, 1); vs.splice(i, 1); }
  else hashRemove(tableOf(c), [ks, vs], i);
  modified(c.obj);
  return old;
}

function mapClear(c: Coll): void {
  keysOf(c).length = 0;
  valuesOf(c).length = 0;
  if (!isTree(c.cls)) tableOf(c).hashes.length = 0; // the table keeps its capacity
  modified(c.obj);
}

/** putAll, and the copy constructors: a hash table is sized for the new entries first, as HashMap.putMapEntries does. */
function putAll(c: Coll, keys: JavaValue[], values: JavaValue[]): void {
  if (!isTree(c.cls)) presize(tableOf(c), [keysOf(c), valuesOf(c)], keys.length, bucketOrdered(c.cls));
  keys.forEach((k, i) => mapPut(c, k, values[i]));
}

function mapMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  const { ctx } = c;
  const vs = valuesOf(c);
  switch (method) {
    case 'put': return mapPut(c, args[0], args[1]);
    case 'get': case 'getOrDefault': {
      const i = mapFind(c, args[0]);
      if (i < 0) return method === 'get' ? javaNull() : args[1];
      const v = vs[i];
      accessed(c, i);
      return v;
    }
    case 'containsKey': return javaBool(mapFind(c, args[0]) >= 0);
    case 'containsValue': return javaBool(indexOfValue(vs, args[0], ctx) >= 0);
    case 'remove': {
      const i = mapFind(c, args[0]);
      if (args.length === 2) {
        if (i < 0 || !sameValue(vs[i], args[1], ctx)) return javaBool(false);
        mapRemoveAt(c, i);
        return javaBool(true);
      }
      return i < 0 ? javaNull() : mapRemoveAt(c, i);
    }
    case 'putIfAbsent': {
      const i = mapFind(c, args[0]);
      if (i < 0 || vs[i].kind === 'null') return mapPut(c, args[0], args[1]);
      const v = vs[i];
      accessed(c, i);
      return v;
    }
    case 'replace': {
      const i = mapFind(c, args[0]);
      if (args.length === 3) {
        if (i < 0 || !sameValue(vs[i], args[1], ctx)) return javaBool(false);
        vs[i] = args[2];
        accessed(c, i);
        return javaBool(true);
      }
      if (i < 0) return javaNull();
      const old = vs[i];
      vs[i] = args[1];
      accessed(c, i);
      return old;
    }
    case 'putAll': {
      const source = mapContents(collArg(args[0], ctx).obj, ctx.heap);
      if (source) putAll(c, source.keys.slice(), source.values.slice());
      return javaNull();
    }
    case 'size': return javaInt(vs.length);
    case 'isEmpty': return javaBool(vs.length === 0);
    case 'clear': mapClear(c); return javaNull();
    case 'keySet': case 'navigableKeySet': return mapView(c, 'KeySet');
    case 'values': return mapView(c, 'Values');
    case 'entrySet': return mapView(c, 'EntrySet');
    case 'toString': return javaString(text(c.ref, ctx));
    case 'equals': return javaBool(valuesEqual(c.ref, args[0], ctx));
    case 'hashCode': return javaInt(hashCodeOf(c.ref, ctx));
  }
  return c.cls === 'TreeMap' ? treeMapMethod(c, method, args) : undefined;
}

/** NavigableMap's methods (TreeMap). Entries it returns are snapshots, whose setValue() is refused. */
function treeMapMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  const { ctx } = c;
  const ks = keysOf(c), vs = valuesOf(c);
  const entryAt = (i: number) => (i >= 0 && i < ks.length ? immutableEntry(ks[i], vs[i], ctx) : javaNull());
  switch (method) {
    case 'firstKey': if (!ks.length) throw noSuchElement(); return ks[0];
    case 'lastKey': if (!ks.length) throw noSuchElement(); return ks[ks.length - 1];
    case 'firstEntry': return entryAt(0);
    case 'lastEntry': return entryAt(ks.length - 1);
    case 'pollFirstEntry': case 'pollLastEntry': {
      if (!ks.length) return javaNull();
      const i = method === 'pollFirstEntry' ? 0 : ks.length - 1;
      const entry = entryAt(i);
      mapRemoveAt(c, i);
      return entry;
    }
    case 'floorKey': case 'lowerKey': case 'ceilingKey': case 'higherKey': {
      const i = neighbor(c, ks, args[0], method.slice(0, -3));
      return i >= 0 ? ks[i] : javaNull();
    }
    case 'floorEntry': case 'lowerEntry': case 'ceilingEntry': case 'higherEntry':
      return entryAt(neighbor(c, ks, args[0], method.slice(0, -5)));
    case 'headMap': case 'tailMap': case 'subMap': {
      const [start, end] = keyRange(c, ks, method === 'headMap' ? 'head' : method === 'tailMap' ? 'tail' : 'sub', args);
      const copy = collOf(allocMap('TreeMap', ks.slice(start, end), vs.slice(start, end), ctx), ctx)!;
      setComparator(copy, comparatorOf(c.ref, ctx));
      return copyForView(copy.ref, `${method}()`, ctx);
    }
    case 'descendingMap': {
      const copy = collOf(allocMap('TreeMap', ks.slice().reverse(), vs.slice().reverse(), ctx), ctx)!;
      setComparator(copy, reversedOrder(c));
      return copyForView(copy.ref, 'descendingMap()', ctx);
    }
    case 'descendingKeySet': return copyForView(newTreeSet(reversedOrder(c), ks.slice().reverse(), ctx), 'descendingKeySet()', ctx);
    case 'comparator': return comparatorOf(c.ref, ctx) ?? javaNull();
  }
  return undefined;
}

// ── Map views: keySet(), values(), entrySet() ──

/**
 * A view of a map: keySet() and values() share the map's `__keys__` /
 * `__values__` array, so they are always current; entrySet() holds Map.Entry
 * objects, refreshed from the map whenever it is used.
 */
function mapView(map: Coll, cls: 'KeySet' | 'Values' | 'EntrySet'): JavaValue {
  const { ctx } = map;
  const shown = cls === 'EntrySet'
    ? { kind: 'arrayRef' as const, heapId: ctx.allocArray('Object', []) }
    : map.obj.fields.get(cls === 'KeySet' ? '__keys__' : '__values__')!;
  const heapId = ctx.allocObject(cls, new Map<string, JavaValue>([['__target__', map.ref], ['__data__', shown]]));
  const view = collOf({ kind: 'objectRef', heapId, className: cls }, ctx)!;
  if (cls === 'EntrySet') refreshEntries(view);
  return view.ref;
}

const entryField = (entry: JavaValue, name: string, ctx: StdlibContext) => builtinObject(entry, ctx)!.fields.get(name)!;

/** A Map.Entry: `__map__` is the map it writes through to (none for a snapshot such as firstEntry()). */
function newEntry(key: JavaValue, value: JavaValue, map: JavaObjectRef | undefined, ctx: StdlibContext): JavaValue {
  const fields = new Map<string, JavaValue>([['key', key], ['value', value]]);
  if (map) fields.set('__map__', map);
  return { kind: 'objectRef', heapId: ctx.allocObject('MapEntry', fields), className: 'MapEntry' };
}

/** An entry that can't be changed: TreeMap.firstEntry() and the like, Map.entry(k, v). */
export function immutableEntry(key: JavaValue, value: JavaValue, ctx: StdlibContext): JavaValue {
  const entry = newEntry(key, value, undefined, ctx);
  stateOf(builtinObject(entry, ctx)!).restriction = 'immutable';
  return entry;
}

/** Bring an entrySet() up to date with its map, keeping the entry objects of keys still there. */
function refreshEntries(view: Coll): void {
  const map = parentOf(view);
  const ks = keysOf(map), vs = valuesOf(map);
  const entries = data(view);
  const byKey = new Map(entries.map(e => [entryField(e, 'key', view.ctx), e]));
  const fresh = ks.map((k, i) => {
    const existing = byKey.get(k);
    if (!existing) return newEntry(k, vs[i], map.ref, view.ctx);
    builtinObject(existing, view.ctx)!.fields.set('value', vs[i]);
    return existing;
  });
  entries.splice(0, entries.length, ...fresh);
}

/** The index of the key of an entry that the map holds with an equal value, or -1. */
function entryIndex(map: Coll, entry: JavaValue): number {
  const e = builtinObject(entry, map.ctx);
  if (e?.className !== 'MapEntry') return -1;
  const i = mapFind(map, e.fields.get('key')!);
  return i >= 0 && sameValue(valuesOf(map)[i], e.fields.get('value')!, map.ctx) ? i : -1;
}

function mapViewMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  const map = parentOf(c);
  if (c.cls === 'EntrySet') refreshEntries(c);
  switch (method) {
    case 'add': case 'addAll': throw unsupported();
    case 'remove': {
      const i = c.cls === 'KeySet' ? mapFind(map, args[0])
        : c.cls === 'Values' ? indexOfValue(valuesOf(map), args[0], c.ctx)
        : entryIndex(map, args[0]);
      if (i < 0) return javaBool(false);
      mapRemoveAt(map, i);
      if (c.cls === 'EntrySet') refreshEntries(c);
      return javaBool(true);
    }
  }
  if (c.cls === 'KeySet' && map.cls === 'TreeMap') {
    const result = navigableSetMethod(map, c, keysOf(map), method, args, i => mapRemoveAt(map, i));
    if (result !== undefined) return result;
  }
  return collectionMethod(c, method, args);
}

// ── Map.Entry ──

function entryMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  const { fields } = c.obj;
  const key = fields.get('key')!;
  // An entry of a map's entrySet() shows the map's current value.
  const map = collOf(fields.get('__map__'), c.ctx);
  const index = map ? keysOf(map).indexOf(key) : -1;
  if (map && index >= 0) fields.set('value', valuesOf(map)[index]);
  switch (method) {
    case 'getKey': return key;
    case 'getValue': return fields.get('value')!;
    case 'setValue': {
      const old = fields.get('value')!;
      fields.set('value', args[0]);
      if (map && index >= 0) valuesOf(map)[index] = args[0];
      return old;
    }
    case 'toString': return javaString(text(c.ref, c.ctx));
    case 'equals': return javaBool(valuesEqual(c.ref, args[0], c.ctx));
    case 'hashCode': return javaInt(hashCodeOf(c.ref, c.ctx));
  }
  return undefined;
}

// ── Unmodifiable views ──

/** Results of an unmodifiable collection's methods that are views themselves, so unmodifiable too. */
const VIEW_RESULTS = new Set([
  'keySet', 'values', 'entrySet', 'navigableKeySet', 'subList',
  'headSet', 'tailSet', 'subSet', 'descendingSet', 'headMap', 'tailMap', 'subMap', 'descendingMap', 'descendingKeySet',
]);

function unmodifiableMethod(c: Coll, method: string, args: JavaValue[]): JavaValue | undefined {
  // Changes were refused already (MUTATORS); everything else reads the collection.
  if (method === 'iterator') return makeIterator(c);
  const result = callInstanceMethod(c.obj.fields.get('__unmodifiable__')!, method, args, c.ctx);
  return result && VIEW_RESULTS.has(method) ? unmodifiableView(result, c.ctx) : result;
}

// ── Iterators and for-each ──

/**
 * How an iterator decides hasNext(): an ArrayList's (and Vector's, and a
 * subList's) compares its cursor with the size (`cursor != size`), a
 * LinkedList's, ArrayDeque's or PriorityQueue's checks `cursor < size`, and a
 * HashMap's, LinkedHashMap's or TreeMap's (and so their sets' and views')
 * found the next entry when it moved. The difference shows when a for-each
 * loop removes an element: removing the second-to-last element of an
 * ArrayList ends the loop without ConcurrentModificationException.
 */
function iterationStyle(c: Coll): 'index' | 'lessThan' | 'linked' {
  const root = rootOf(c.obj, c.ctx).className;
  if (SET_LIKE.has(root) || MAP_LIKE.has(root)) return 'linked';
  return root === 'LinkedList' || root === 'PriorityQueue' || root === 'ArrayDeque' ? 'lessThan' : 'index';
}

function startIteration(c: Coll, descending = false): IterationState {
  if (c.cls === 'EntrySet') refreshEntries(c);
  return { cursor: 0, lastRet: -1, expectedModCount: modCountOf(c.obj, c.ctx), nextExists: elements(c).length > 0, descending };
}

function hasNext(c: Coll, it: IterationState): boolean {
  if (it.forgetMeNot?.length) return true;
  const style = iterationStyle(c);
  if (style === 'linked') return it.nextExists === true;
  const n = c.cls === 'SubList' ? fieldInt(c.obj, '__size__') : (collectionElements(c.obj, c.ctx.heap) ?? []).length;
  return style === 'index' ? it.cursor !== n : it.cursor < n;
}

function next(c: Coll, it: IterationState): JavaValue {
  if (modCountOf(c.obj, c.ctx) !== it.expectedModCount) throw concurrentModification();
  const els = collectionElements(c.obj, c.ctx.heap) ?? [];
  const n = els.length;
  if ((iterationStyle(c) === 'linked' && !it.nextExists) || it.cursor >= n) {
    const moved = it.forgetMeNot?.shift();
    if (!moved) throw noSuchElement();
    it.lastRet = -1;
    it.lastRetElement = moved;
    return moved;
  }
  const value = els[it.descending ? n - 1 - it.cursor : it.cursor];
  it.lastRet = it.cursor;
  it.lastRetElement = undefined;
  it.cursor++;
  it.nextExists = it.cursor < n;
  return value;
}

/** Iterator.remove(): removes what next() returned, and the iteration goes on from the element after it. */
function removeCurrent(c: Coll, it: IterationState): void {
  if (it.lastRet < 0 && !it.lastRetElement) throw failure('IllegalStateException');
  if (modCountOf(c.obj, c.ctx) !== it.expectedModCount) throw concurrentModification();
  if (it.lastRet < 0) {
    // A PriorityQueue element the iterator came back for (see priorityQueueRemoveAt).
    const es = data(c);
    const i = es.indexOf(it.lastRetElement!);
    if (i >= 0) priorityQueueRemoveAt(c, i);
    it.lastRetElement = undefined;
  } else {
    const n = elements(c).length;
    const moved = removeAtIndex(c, it.descending ? n - 1 - it.lastRet : it.lastRet);
    if (moved) (it.forgetMeNot ??= []).push(moved);
    else it.cursor--;
    it.lastRet = -1;
  }
  it.expectedModCount = modCountOf(c.obj, c.ctx);
}

/**
 * An Iterator object: the collection it walks and its cursor are fields, so
 * the drawing shows where it is; the rest of its state isn't drawn.
 */
function makeIterator(c: Coll, descending = false): JavaValue {
  const iteration = startIteration(c, descending);
  const heapId = c.ctx.allocObject('Iterator', new Map<string, JavaValue>([
    ['collection', c.ref],
    ['cursor', javaInt(0)],
  ]));
  const it: JavaValue = { kind: 'objectRef', heapId, className: 'Iterator' };
  builtinObject(it, c.ctx)!.state = { iteration };
  return it;
}

function iteratorMethod(iterator: Coll, method: string): JavaValue | undefined {
  const it = iterator.obj.state?.iteration;
  const c = collOf(iterator.obj.fields.get('collection'), iterator.ctx);
  if (!it || !c) return undefined;
  switch (method) {
    case 'hasNext': return javaBool(hasNext(c, it));
    case 'next': {
      const value = next(c, it);
      iterator.obj.fields.set('cursor', javaInt(it.cursor));
      return value;
    }
    case 'remove':
      removeCurrent(c, it);
      iterator.obj.fields.set('cursor', javaInt(it.cursor));
      return javaNull();
  }
  return undefined;
}

/**
 * The iterator a for-each loop over a collection uses, so that changing the
 * collection inside the loop fails as it does in Java (#21). Undefined if the
 * value isn't an iterable library collection (a Map isn't).
 */
export function forEachIterator(ref: JavaValue, ctx: StdlibContext): { hasNext(): boolean; next(): JavaValue } | undefined {
  const c = collOf(ref, ctx);
  if (!c || collectionElements(c.obj, ctx.heap) === undefined) return undefined;
  const it = startIteration(c);
  return { hasNext: () => hasNext(c, it), next: () => next(c, it) };
}

/** A collection's elements in iteration order (a copy); undefined if not iterable (e.g. a Map). */
export function getIterableElements(ref: JavaValue, ctx: StdlibContext): JavaValue[] | undefined {
  const obj = builtinObject(ref, ctx);
  return obj ? collectionElements(obj, ctx.heap)?.slice() : undefined;
}

// ── For the static methods (Collections.*) ──

/**
 * Rewrite a list's elements in place (Collections.reverse, shuffle, swap,
 * fill, rotate): each position is set(), so a fixed-size list allows it and
 * an immutable one doesn't.
 */
export function rewriteList(list: JavaValue, ctx: StdlibContext, rewrite: (els: JavaValue[]) => JavaValue[]): void {
  const c = collArg(list, ctx);
  requireChangeable(c, false);
  rewrite(elements(c).slice()).forEach((e, i) => listSet(c, i, e));
}
