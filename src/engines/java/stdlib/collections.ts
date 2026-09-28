/**
 * Collection classes, Scanner, and Random.
 *
 * Lists/sets/queues store elements in a `__data__` backing array; maps use
 * parallel `__keys__` / `__values__` arrays (so keys keep their JavaValue type
 * and order — enabling typed keySet()/entrySet() and TreeMap ordering).
 *
 * `newBuiltin` handles `new X(...)`. `callInstanceMethod` dispatches `x.m(...)`.
 * Both return `undefined` when the class isn't one we manage, so the
 * interpreter falls through to user-defined class handling.
 */

import {
  type JavaValue,
  type JavaObject,
  isJavaArray,
  isJavaObject,
  javaValueToNumber,
  javaValueToString,
  javaInt,
  javaDouble,
  javaBool,
  javaString,
  javaNull,
} from '../types';
import { type StdlibContext, StdlibError } from './context';
import {
  LIST_LIKE, SET_LIKE, MAP_LIKE, isSorted,
  compareValues, compareWith, comparatorOf, isComparator, libraryComparator,
  valuesEqual, backingArray, mapArrays, syncSize, sortedInsert,
  allocCollection, allocMap,
} from './util';
import { isExceptionClass, newException, exceptionMethod } from './exceptions';

const ALL_BUILTIN = new Set<string>([
  ...LIST_LIKE, ...SET_LIKE, ...MAP_LIKE, 'Scanner', 'Random',
]);

export function isBuiltinCollection(className: string): boolean {
  return ALL_BUILTIN.has(className);
}

/** Copy the elements of a collection/array passed to a copy-constructor. */
function initialElements(arg: JavaValue | undefined, ctx: StdlibContext): JavaValue[] {
  if (!arg) return [];
  if (arg.kind === 'arrayRef') {
    const a = ctx.heap.get(arg.heapId);
    if (a && isJavaArray(a)) return a.elements.slice();
  }
  if (arg.kind === 'objectRef') {
    const data = backingArray(arg, ctx);
    if (data) return data.elements.slice();
  }
  return [];
}

/**
 * A PriorityQueue, TreeSet or TreeMap may be given a Comparator: `(cmp)` or,
 * for a PriorityQueue, `(capacity, cmp)`. It is kept in a hidden `__cmp__`
 * field and orders the collection from then on.
 */
function constructorComparator(args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  return args.find(a => isComparator(a, ctx));
}

function setComparator(ref: JavaValue, cmp: JavaValue | undefined, ctx: StdlibContext): void {
  if (!cmp || ref.kind !== 'objectRef') return;
  const obj = ctx.heap.get(ref.heapId);
  if (obj && 'fields' in obj) obj.fields.set('__cmp__', cmp);
}

export function newBuiltin(className: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  if (LIST_LIKE.has(className)) {
    const cmp = className === 'PriorityQueue' ? constructorComparator(args, ctx) : undefined;
    const init = cmp ? [] : initialElements(args[0], ctx);
    if (className === 'PriorityQueue') init.sort((a, b) => compareValues(a, b, ctx));
    const list = allocCollection(className, init, 'Object', ctx);
    setComparator(list, cmp, ctx);
    return list;
  }
  if (SET_LIKE.has(className)) {
    const cmp = className === 'TreeSet' ? constructorComparator(args, ctx) : undefined;
    const set = allocCollection(className, [], 'Object', ctx);
    setComparator(set, cmp, ctx);
    if (!cmp) for (const e of initialElements(args[0], ctx)) setAdd(set, e, className, ctx);
    return set;
  }
  if (MAP_LIKE.has(className)) {
    const cmp = className === 'TreeMap' ? constructorComparator(args, ctx) : undefined;
    const map = allocMap(className, [], [], ctx);
    setComparator(map, cmp, ctx);
    // A copy constructor, new HashMap<>(other), copies the other map's entries.
    const source = !cmp && args[0] ? mapArrays(args[0], ctx) : undefined;
    source?.keys.elements.forEach((k, i) => mapMethod(map, className, 'put', [k, source.values.elements[i]], ctx));
    return map;
  }
  if (className === 'Scanner') {
    // new Scanner(String) reads from the string; new Scanner(System.in) reads the preset stdin.
    const buf = args[0]?.kind === 'string' ? args[0].value : ctx.stdin;
    const heapId = ctx.allocObject('Scanner', new Map<string, JavaValue>([
      ['__buf__', javaString(buf)],
      ['__pos__', javaInt(0)],
    ]));
    return { kind: 'objectRef', heapId, className: 'Scanner' };
  }
  if (className === 'Random') {
    const seed = args.length > 0 ? BigInt(Math.trunc(javaValueToNumber(args[0]))) : BigInt(Math.trunc(ctx.random() * 2 ** 48));
    const heapId = ctx.allocObject('Random', new Map<string, JavaValue>([['seed', scrambledSeed(seed)]]));
    return { kind: 'objectRef', heapId, className: 'Random' };
  }
  if (isExceptionClass(className)) {
    return newException(className, args, ctx);
  }
  return undefined;
}

export function callInstanceMethod(
  ref: JavaValue,
  method: string,
  args: JavaValue[],
  ctx: StdlibContext,
): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const cls = ref.className;
  if (LIST_LIKE.has(cls)) return listMethod(ref, cls, method, args, ctx);
  if (SET_LIKE.has(cls)) return setMethod(ref, cls, method, args, ctx);
  if (MAP_LIKE.has(cls)) return mapMethod(ref, cls, method, args, ctx);
  if (cls === 'Scanner') return scannerMethod(ref, method, ctx);
  if (cls === 'Random') return randomMethod(ref, method, args, ctx);
  if (cls === 'Iterator') return iteratorMethod(ref, method, ctx);
  if (cls === 'MapEntry') return entryMethod(ref, method, ctx);
  if (cls === 'Comparator') return comparatorMethod(ref, method, args, ctx);
  if (isExceptionClass(cls)) return exceptionMethod(ref, method, ctx);
  return undefined;
}

/** Methods of a library comparator such as Collections.reverseOrder(). */
function comparatorMethod(ref: JavaValue, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  if (method === 'compare') return javaInt(compareWith(ref, args[0], args[1], ctx));
  if (method === 'reversed') return libraryComparator('reverse', ref, ctx);
  return undefined;
}

/** Elements to iterate for a for-each loop; undefined if not iterable (e.g. a Map). */
export function getIterableElements(ref: JavaValue, ctx: StdlibContext): JavaValue[] | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const data = backingArray(ref, ctx);
  return data ? data.elements.slice() : undefined;
}

// ── Lists / Queues / Deques / Stacks ──

function listMethod(ref: JavaValue, cls: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const data = backingArray(ref, ctx);
  if (!data) return javaNull();
  const el = data.elements;
  const sync = () => syncSize(ref, el.length, ctx);
  const front = () => (el.length ? el[0] : javaNull());
  const back = () => (el.length ? el[el.length - 1] : javaNull());

  switch (method) {
    case 'add': case 'addLast': case 'offer': case 'offerLast':
      if (method === 'add' && args.length === 2) {
        el.splice(javaValueToNumber(args[0]) | 0, 0, args[1]);
      } else if (cls === 'PriorityQueue') {
        sortedInsert(el, args[0], ctx, comparatorOf(ref, ctx));
      } else {
        el.push(args[0]);
      }
      sync();
      return javaBool(true);
    case 'addFirst': case 'offerFirst':
      el.unshift(args[0]); sync(); return javaBool(true);
    case 'push':
      // Stack.push -> top (end); Deque.push -> head (front).
      if (cls === 'Stack') el.push(args[0]); else el.unshift(args[0]);
      sync(); return method === 'push' && cls === 'Stack' ? args[0] : javaBool(true);
    case 'pop': {
      // Stack.pop -> end; Deque.pop -> front.
      if (!el.length) throw new StdlibError('NoSuchElementException');
      const v = cls === 'Stack' ? el.pop()! : el.shift()!;
      sync(); return v;
    }
    case 'poll': case 'pollFirst': {
      if (!el.length) return javaNull();
      const v = el.shift()!; sync(); return v;
    }
    case 'pollLast': {
      if (!el.length) return javaNull();
      const v = el.pop()!; sync(); return v;
    }
    case 'peek': case 'peekFirst': case 'element':
      // Stack.peek -> top (end); Queue/Deque.peek -> head (front).
      return cls === 'Stack' ? back() : front();
    case 'peekLast': return back();
    case 'getFirst': return front();
    case 'getLast': return back();
    case 'removeFirst': {
      if (!el.length) throw new StdlibError('NoSuchElementException');
      const v = el.shift()!; sync(); return v;
    }
    case 'removeLast': {
      if (!el.length) throw new StdlibError('NoSuchElementException');
      const v = el.pop()!; sync(); return v;
    }
    case 'get': {
      const i = javaValueToNumber(args[0]) | 0;
      if (i < 0 || i >= el.length) throw new StdlibError(`IndexOutOfBoundsException: Index ${i} out of bounds for length ${el.length}`);
      return el[i];
    }
    case 'set': {
      const i = javaValueToNumber(args[0]) | 0;
      const prev = el[i] ?? javaNull();
      el[i] = args[1];
      return prev;
    }
    case 'remove': {
      if (args[0]?.kind === 'primitive' && args[0].javaType !== 'boolean') {
        const i = javaValueToNumber(args[0]) | 0;
        if (i < 0 || i >= el.length) throw new StdlibError(`IndexOutOfBoundsException: Index ${i} out of bounds for length ${el.length}`);
        const [removed] = el.splice(i, 1);
        sync(); return removed ?? javaNull();
      }
      const idx = el.findIndex(e => valuesEqual(e, args[0], ctx));
      if (idx >= 0) { el.splice(idx, 1); sync(); return javaBool(true); }
      return javaBool(false);
    }
    case 'indexOf': return javaInt(el.findIndex(e => valuesEqual(e, args[0], ctx)));
    case 'lastIndexOf': {
      for (let i = el.length - 1; i >= 0; i--) if (valuesEqual(el[i], args[0], ctx)) return javaInt(i);
      return javaInt(-1);
    }
    case 'contains': return javaBool(el.some(e => valuesEqual(e, args[0], ctx)));
    case 'size': return javaInt(el.length);
    case 'isEmpty': return javaBool(el.length === 0);
    case 'clear': el.length = 0; sync(); return javaNull();
    case 'addAll': {
      for (const e of initialElements(args[args.length - 1], ctx)) el.push(e);
      sync(); return javaBool(true);
    }
    case 'iterator': return makeIterator(ref, ctx);
    case 'toArray': return { kind: 'arrayRef', heapId: ctx.allocArray('Object', el.slice()) };
    case 'toString': return javaString('[' + el.map(e => javaValueToString(e, ctx.heap)).join(', ') + ']');
    case 'equals': return javaBool(ref.kind === 'objectRef' && args[0]?.kind === 'objectRef' && ref.heapId === args[0].heapId);
    case 'sort': el.sort((a, b) => compareWith(args[0], a, b, ctx)); return javaNull();
  }
  return undefined;
}

// ── Sets ──

/**
 * Whether a set or map holds an element or key equal to `value`. A TreeSet or
 * TreeMap with a comparator treats elements that compare as 0 as equal, as
 * Java does; otherwise equals() decides.
 */
function sameElement(cmp: JavaValue | undefined, ctx: StdlibContext): (e: JavaValue, value: JavaValue) => boolean {
  return cmp ? (e, value) => compareWith(cmp, e, value, ctx) === 0 : (e, value) => valuesEqual(e, value, ctx);
}

function setAdd(ref: JavaValue, value: JavaValue, cls: string, ctx: StdlibContext): boolean {
  const data = backingArray(ref, ctx);
  if (!data) return false;
  const cmp = comparatorOf(ref, ctx);
  const same = sameElement(cmp, ctx);
  if (data.elements.some(e => same(e, value))) return false;
  if (isSorted(cls)) sortedInsert(data.elements, value, ctx, cmp);
  else data.elements.push(value);
  syncSize(ref, data.elements.length, ctx);
  return true;
}

function setMethod(ref: JavaValue, cls: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const data = backingArray(ref, ctx);
  if (!data) return javaNull();
  const el = data.elements;
  const same = sameElement(comparatorOf(ref, ctx), ctx);
  switch (method) {
    case 'add': return javaBool(setAdd(ref, args[0], cls, ctx));
    case 'remove': {
      const idx = el.findIndex(e => same(e, args[0]));
      if (idx >= 0) { el.splice(idx, 1); syncSize(ref, el.length, ctx); return javaBool(true); }
      return javaBool(false);
    }
    case 'contains': return javaBool(el.some(e => same(e, args[0])));
    case 'size': return javaInt(el.length);
    case 'isEmpty': return javaBool(el.length === 0);
    case 'clear': el.length = 0; syncSize(ref, 0, ctx); return javaNull();
    case 'addAll': {
      let changed = false;
      for (const e of initialElements(args[0], ctx)) changed = setAdd(ref, e, cls, ctx) || changed;
      return javaBool(changed);
    }
    case 'first': return el.length ? el[0] : javaNull();
    case 'last': return el.length ? el[el.length - 1] : javaNull();
    case 'iterator': return makeIterator(ref, ctx);
    case 'toArray': return { kind: 'arrayRef', heapId: ctx.allocArray('Object', el.slice()) };
    case 'toString': return javaString('[' + el.map(e => javaValueToString(e, ctx.heap)).join(', ') + ']');
  }
  return undefined;
}

// ── Maps ──

function mapMethod(ref: JavaValue, cls: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const m = mapArrays(ref, ctx);
  if (!m) return javaNull();
  const { keys, values } = m;
  const cmp = comparatorOf(ref, ctx);
  const same = sameElement(cmp, ctx);
  const findIndex = (k: JavaValue) => keys.elements.findIndex(e => same(e, k));
  switch (method) {
    case 'put': {
      const i = findIndex(args[0]);
      if (i >= 0) { const old = values.elements[i]; values.elements[i] = args[1]; return old; }
      if (cls === 'TreeMap') {
        let pos = 0;
        while (pos < keys.elements.length && compareWith(cmp, keys.elements[pos], args[0], ctx) < 0) pos++;
        keys.elements.splice(pos, 0, args[0]);
        values.elements.splice(pos, 0, args[1]);
      } else {
        keys.elements.push(args[0]);
        values.elements.push(args[1]);
      }
      syncSize(ref, keys.elements.length, ctx);
      return javaNull();
    }
    case 'get': { const i = findIndex(args[0]); return i >= 0 ? values.elements[i] : javaNull(); }
    case 'getOrDefault': { const i = findIndex(args[0]); return i >= 0 ? values.elements[i] : args[1]; }
    case 'putIfAbsent': {
      const i = findIndex(args[0]);
      if (i >= 0) return values.elements[i];
      return mapMethod(ref, cls, 'put', args, ctx)!;
    }
    case 'containsKey': return javaBool(findIndex(args[0]) >= 0);
    case 'containsValue': return javaBool(values.elements.some(e => valuesEqual(e, args[0], ctx)));
    case 'remove': {
      const i = findIndex(args[0]);
      if (i < 0) return javaNull();
      const old = values.elements[i];
      keys.elements.splice(i, 1);
      values.elements.splice(i, 1);
      syncSize(ref, keys.elements.length, ctx);
      return old;
    }
    case 'size': return javaInt(keys.elements.length);
    case 'isEmpty': return javaBool(keys.elements.length === 0);
    case 'clear': keys.elements.length = 0; values.elements.length = 0; syncSize(ref, 0, ctx); return javaNull();
    case 'keySet': {
      const setCls = cls === 'TreeMap' ? 'TreeSet' : 'LinkedHashSet';
      return allocCollection(setCls, keys.elements.slice(), 'Object', ctx);
    }
    case 'values': return allocCollection('ArrayList', values.elements.slice(), 'Object', ctx);
    case 'entrySet': {
      const entries = keys.elements.map((k, i) => {
        const id = ctx.allocObject('MapEntry', new Map<string, JavaValue>([
          ['key', k], ['value', values.elements[i]],
        ]));
        return { kind: 'objectRef', heapId: id, className: 'MapEntry' } as JavaValue;
      });
      return allocCollection('LinkedHashSet', entries, 'Object', ctx);
    }
    case 'firstKey': return keys.elements.length ? keys.elements[0] : javaNull();
    case 'lastKey': return keys.elements.length ? keys.elements[keys.elements.length - 1] : javaNull();
    case 'toString': {
      const parts = keys.elements.map((k, i) =>
        `${javaValueToString(k, ctx.heap)}=${javaValueToString(values.elements[i], ctx.heap)}`);
      return javaString('{' + parts.join(', ') + '}');
    }
  }
  return undefined;
}

// ── Map.Entry ──

function entryMethod(ref: JavaValue, method: string, ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(ref.heapId);
  if (!obj || !('fields' in obj)) return undefined;
  if (method === 'getKey') return obj.fields.get('key') ?? javaNull();
  if (method === 'getValue') return obj.fields.get('value') ?? javaNull();
  if (method === 'toString') {
    return javaString(`${javaValueToString(obj.fields.get('key')!, ctx.heap)}=${javaValueToString(obj.fields.get('value')!, ctx.heap)}`);
  }
  return undefined;
}

// ── Iterator ──

/**
 * An iterator over a list or set: the collection it walks, and the index of
 * the element next() returns (`cursor`, as in java.util.ArrayList's own
 * iterator). Both are fields, so the drawing shows where it is.
 */
function makeIterator(collection: JavaValue, ctx: StdlibContext): JavaValue {
  const heapId = ctx.allocObject('Iterator', new Map<string, JavaValue>([
    ['collection', collection],
    ['cursor', javaInt(0)],
  ]));
  return { kind: 'objectRef', heapId, className: 'Iterator' };
}

function iteratorMethod(ref: JavaValue, method: string, ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(ref.heapId);
  if (!obj || !isJavaObject(obj)) return javaNull();
  const data = backingArray(obj.fields.get('collection') ?? javaNull(), ctx);
  if (!data) return javaNull();
  const cursor = javaValueToNumber(obj.fields.get('cursor') ?? javaInt(0)) | 0;
  if (method === 'hasNext') return javaBool(cursor < data.elements.length);
  if (method === 'next') {
    if (cursor >= data.elements.length) throw new StdlibError('NoSuchElementException');
    obj.fields.set('cursor', javaInt(cursor + 1));
    return data.elements[cursor];
  }
  return undefined;
}

// ── Scanner ──

/** The part of a Scanner's input it hasn't read yet. */
export function scannerRemaining(scanner: JavaObject): string {
  const buf = scanner.fields.get('__buf__');
  const pos = javaValueToNumber(scanner.fields.get('__pos__') ?? javaInt(0)) | 0;
  return buf?.kind === 'string' ? buf.value.slice(pos) : '';
}

function scannerMethod(ref: JavaValue, method: string, ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(ref.heapId);
  if (!obj || !('fields' in obj)) return javaNull();
  const buf = (obj.fields.get('__buf__') as { value: string } | undefined)?.value ?? '';
  const pos = javaValueToNumber(obj.fields.get('__pos__') ?? javaInt(0)) | 0;
  const setPos = (p: number) => obj.fields.set('__pos__', javaInt(p));

  const skipWs = (from: number) => { while (from < buf.length && /\s/.test(buf[from])) from++; return from; };
  const nextToken = (): string | undefined => {
    const start = skipWs(pos);
    if (start >= buf.length) return undefined;
    let end = start;
    while (end < buf.length && !/\s/.test(buf[end])) end++;
    setPos(end);
    return buf.slice(start, end);
  };
  const peekToken = (): string | undefined => {
    const start = skipWs(pos);
    if (start >= buf.length) return undefined;
    let end = start;
    while (end < buf.length && !/\s/.test(buf[end])) end++;
    return buf.slice(start, end);
  };

  switch (method) {
    case 'next': {
      const t = nextToken();
      if (t === undefined) throw new StdlibError('NoSuchElementException');
      return javaString(t);
    }
    case 'nextInt': case 'nextLong': case 'nextShort': case 'nextByte': {
      const t = nextToken();
      if (t === undefined) throw new StdlibError('NoSuchElementException');
      const n = parseInt(t, 10);
      return method === 'nextLong' ? { kind: 'primitive', javaType: 'long', value: n } : javaInt(n);
    }
    case 'nextDouble': case 'nextFloat': {
      const t = nextToken();
      if (t === undefined) throw new StdlibError('NoSuchElementException');
      return javaDouble(parseFloat(t));
    }
    case 'nextBoolean': {
      const t = nextToken();
      return javaBool((t ?? '').toLowerCase() === 'true');
    }
    case 'nextLine': {
      // Read to end of current line (Java semantics: consumes the newline).
      if (pos >= buf.length) throw new StdlibError('NoSuchElementException');
      const nl = buf.indexOf('\n', pos);
      if (nl < 0) { const line = buf.slice(pos); setPos(buf.length); return javaString(line); }
      const line = buf.slice(pos, nl).replace(/\r$/, '');
      setPos(nl + 1);
      return javaString(line);
    }
    case 'hasNext': return javaBool(peekToken() !== undefined);
    case 'hasNextLine': return javaBool(pos < buf.length);
    case 'hasNextInt': case 'hasNextLong': {
      const t = peekToken();
      return javaBool(t !== undefined && /^[+-]?\d+$/.test(t));
    }
    case 'hasNextDouble': case 'hasNextFloat': {
      const t = peekToken();
      return javaBool(t !== undefined && !Number.isNaN(parseFloat(t)));
    }
    case 'close': return javaNull();
  }
  return undefined;
}

// ── Random (Java's 48-bit LCG, so seeded sequences match real java.util.Random) ──

const RNG_MULT = 0x5DEECE66Dn;
const RNG_ADD = 0xBn;
const RNG_MASK = (1n << 48n) - 1n;

/**
 * The 48-bit state java.util.Random keeps in its `seed` field: the seed it is
 * given, scrambled (Random.setSeed). It fits a double exactly, so it is kept
 * as a long field of the Random object, and the drawing shows it change.
 */
function scrambledSeed(seed: bigint): JavaValue {
  return { kind: 'primitive', javaType: 'long', value: Number((seed ^ RNG_MULT) & RNG_MASK) };
}

function rngNext(rng: JavaObject, bits: number): number {
  const state = rng.fields.get('seed');
  const s = (BigInt(state?.kind === 'primitive' ? Number(state.value) : 0) * RNG_MULT + RNG_ADD) & RNG_MASK;
  rng.fields.set('seed', { kind: 'primitive', javaType: 'long', value: Number(s) });
  // Top `bits` bits, interpreted as a signed 32-bit int.
  const shifted = s >> BigInt(48 - bits);
  return Number(BigInt.asIntN(32, shifted));
}

function randomMethod(ref: JavaValue, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const rng = ctx.heap.get(ref.heapId);
  if (!rng || !isJavaObject(rng)) return undefined;
  switch (method) {
    case 'nextInt': {
      if (args.length === 0) return javaInt(rngNext(rng, 32));
      const bound = javaValueToNumber(args[0]) | 0;
      if (bound <= 0) throw new StdlibError('IllegalArgumentException: bound must be positive');
      if ((bound & -bound) === bound) { // power of two
        return javaInt(Number((BigInt(bound) * BigInt(rngNext(rng, 31))) >> 31n));
      }
      let bits: number, val: number;
      do {
        bits = rngNext(rng, 31);
        val = bits % bound;
      } while (((bits - val + (bound - 1)) | 0) < 0);
      return javaInt(val);
    }
    case 'nextLong': {
      const hi = BigInt(rngNext(rng, 32));
      const lo = BigInt(rngNext(rng, 32));
      return { kind: 'primitive', javaType: 'long', value: Number((hi << 32n) + lo) };
    }
    case 'nextBoolean': return javaBool(rngNext(rng, 1) !== 0);
    case 'nextDouble': {
      const hi = rngNext(rng, 26);
      const lo = rngNext(rng, 27);
      return javaDouble((hi * 2 ** 27 + lo) / 2 ** 53);
    }
    case 'nextFloat': return javaDouble(rngNext(rng, 24) / 2 ** 24);
    case 'setSeed':
      rng.fields.set('seed', scrambledSeed(BigInt(Math.trunc(javaValueToNumber(args[0])))));
      return javaNull();
  }
  return undefined;
}
