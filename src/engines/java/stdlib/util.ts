/**
 * Shared helpers for the Java stdlib modules: value comparison/equality with
 * Java's semantics, and helpers for the backing storage of collection
 * objects (lists/sets use a `__data__` array; maps use parallel
 * `__keys__` / `__values__` arrays; see collections.ts).
 */

import {
  type JavaValue,
  type JavaArray,
  type JavaType,
  type JavaObject,
  isJavaArray,
  isJavaObject,
  isBuiltinObject,
  collectionElements,
  mapContents,
  javaValueToNumber,
  javaValueToBoolean,
  javaValueToString,
  javaString,
} from '../types';
import { type StdlibContext, StdlibError } from './context';

/** Class names that store their contents in a `__data__` backing array. */
export const LIST_LIKE = new Set([
  'ArrayList', 'LinkedList', 'Vector', 'Stack', 'ArrayDeque', 'PriorityQueue',
]);
export const SET_LIKE = new Set(['HashSet', 'LinkedHashSet', 'TreeSet']);
export const MAP_LIKE = new Set(['HashMap', 'LinkedHashMap', 'TreeMap']);
/**
 * Views of another collection (#21): a map's keySet(), values() and
 * entrySet(), and a list's subList(). The collection they show is their
 * `__target__` field.
 */
export const VIEW_CLASSES = new Set(['KeySet', 'Values', 'EntrySet', 'SubList']);

/** Classes that are a java.util.List: their equals() compares elements in order. */
const LIST_CLASSES = new Set(['ArrayList', 'LinkedList', 'Vector', 'Stack', 'SubList']);
/** Classes that are a java.util.Set: their equals() compares contents. */
const SET_CLASSES = new Set([...SET_LIKE, 'KeySet', 'EntrySet']);

/** The library object a value refers to, if it is one. */
export function builtinObject(value: JavaValue | undefined, ctx: Pick<StdlibContext, 'heap'>): JavaObject | undefined {
  if (value?.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(value.heapId);
  return isBuiltinObject(obj) ? obj : undefined;
}

/** What kind of collection a library object is, for equals() and hashCode(); undefined for other objects. */
export function collectionKind(obj: JavaObject | undefined): 'list' | 'set' | 'map' | 'collection' | undefined {
  if (!obj?.builtin) return undefined;
  if (LIST_CLASSES.has(obj.className)) return 'list';
  if (SET_CLASSES.has(obj.className)) return 'set';
  if (MAP_LIKE.has(obj.className)) return 'map';
  return obj.className === 'Values' || LIST_LIKE.has(obj.className) ? 'collection' : undefined;
}

/** The elements of any library collection or view, in iteration order (a live array, or a copy for a subList), or undefined. */
export function elementsOf(value: JavaValue | undefined, ctx: Pick<StdlibContext, 'heap'>): JavaValue[] | undefined {
  const obj = builtinObject(value, ctx);
  return obj ? collectionElements(obj, ctx.heap) : undefined;
}

/**
 * Java-ordering comparison for primitives and strings (numeric by value,
 * strings by UTF-16 code units, which is what JS `<` does for the BMP).
 * Used by TreeSet/TreeMap/PriorityQueue and Collections.sort / Arrays.sort.
 */
export function compareJava(a: JavaValue, b: JavaValue): number {
  if (a.kind === 'string' && b.kind === 'string') {
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  }
  if (a.kind === 'primitive' && b.kind === 'primitive' && typeof a.value !== 'boolean' && typeof b.value !== 'boolean') {
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0; // exact for longs, and for a long against an int
  }
  const na = javaValueToNumber(a);
  const nb = javaValueToNumber(b);
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/**
 * equals() for values without a user equals(): strings by content, null to
 * null, references by identity, and primitives as their boxes compare, so of
 * the same type and value (Integer 1 isn't Long 1L, nor Character 'a' the
 * Integer 97: a map with the key 'a' doesn't contain 97). Double.equals
 * compares bits, so NaN equals NaN and 0.0 isn't -0.0.
 */
export function javaEquals(a: JavaValue, b: JavaValue): boolean {
  if (a.kind === 'null' || b.kind === 'null') return a.kind === 'null' && b.kind === 'null';
  if (a.kind === 'string' || b.kind === 'string') {
    return a.kind === 'string' && b.kind === 'string' && a.value === b.value;
  }
  if (a.kind === 'primitive' && b.kind === 'primitive') {
    return a.javaType === b.javaType && (typeof a.value === 'number' ? Object.is(a.value, b.value) : a.value === b.value);
  }
  if (a.kind === 'arrayRef' && b.kind === 'arrayRef') return a.heapId === b.heapId;
  if (a.kind === 'objectRef' && b.kind === 'objectRef') return a.heapId === b.heapId;
  return false;
}

/** The characters of a char[], or undefined for any other value. */
export function charArrayText(value: JavaValue | undefined, ctx: Pick<StdlibContext, 'heap'>): string | undefined {
  if (value?.kind !== 'arrayRef') return undefined;
  const arr = ctx.heap.get(value.heapId);
  if (!arr || !isJavaArray(arr) || arr.elementType !== 'char') return undefined;
  return arr.elements.map(c => String.fromCharCode(javaValueToNumber(c))).join('');
}

/** Resolve the backing `__data__` array of a list/set object (a view of a map's keys or values shares the map's). */
export function backingArray(ref: JavaValue, ctx: Pick<StdlibContext, 'heap'>): JavaArray | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(ref.heapId);
  if (!obj || !isJavaObject(obj)) return undefined;
  const dataRef = obj.fields.get('__data__');
  if (!dataRef || dataRef.kind !== 'arrayRef') return undefined;
  const data = ctx.heap.get(dataRef.heapId);
  return data && isJavaArray(data) ? data : undefined;
}

/** Resolve the parallel `__keys__` / `__values__` arrays of a map object. */
export function mapArrays(
  ref: JavaValue,
  ctx: Pick<StdlibContext, 'heap'>,
): { keys: JavaArray; values: JavaArray } | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(ref.heapId);
  if (!obj || !isJavaObject(obj)) return undefined;
  const kRef = obj.fields.get('__keys__');
  const vRef = obj.fields.get('__values__');
  if (!kRef || kRef.kind !== 'arrayRef' || !vRef || vRef.kind !== 'arrayRef') return undefined;
  const keys = ctx.heap.get(kRef.heapId);
  const values = ctx.heap.get(vRef.heapId);
  if (!keys || !isJavaArray(keys) || !values || !isJavaArray(values)) return undefined;
  return { keys, values };
}

/**
 * `a.equals(b)`: a user-defined `equals()` (so student classes work in
 * HashSet/HashMap/contains), a library collection's (lists by elements in
 * order, sets and maps by contents, Map.Entry by key and value), else
 * `javaEquals`.
 */
export function valuesEqual(a: JavaValue, b: JavaValue, ctx: StdlibContext): boolean {
  if (a.kind === 'objectRef') {
    const obj = ctx.heap.get(a.heapId);
    if (isBuiltinObject(obj)) {
      if (b.kind === 'objectRef' && b.heapId === a.heapId) return true;
      const equal = collectionEquals(obj, b, ctx);
      if (equal !== undefined) return equal;
    } else {
      const r = ctx.invokeUserMethod(a, 'equals', [b]);
      if (r !== undefined) return javaValueToBoolean(r);
    }
  }
  return javaEquals(a, b);
}

/**
 * equals() of a library collection, as AbstractList, AbstractSet and
 * AbstractMap define it: another list with equal elements in the same order,
 * a set of the same size containing each element, a map with the same
 * mappings; and a Map.Entry with an equal key and value. Undefined for a
 * library object that isn't one (identity decides).
 */
function collectionEquals(obj: JavaObject, other: JavaValue, ctx: StdlibContext): boolean | undefined {
  if (obj.className === 'MapEntry') {
    const o = builtinObject(other, ctx);
    if (o?.className !== 'MapEntry') return false;
    return valuesEqual(obj.fields.get('key')!, o.fields.get('key')!, ctx) && valuesEqual(obj.fields.get('value')!, o.fields.get('value')!, ctx);
  }
  const kind = collectionKind(obj);
  if (kind === undefined || kind === 'collection') return undefined;
  const o = builtinObject(other, ctx);
  if (collectionKind(o) !== kind) return false;
  if (kind === 'map') {
    const a = mapContents(obj, ctx.heap)!, b = mapContents(o!, ctx.heap)!;
    if (a.keys.length !== b.keys.length) return false;
    return a.keys.every((k, i) => {
      const j = b.keys.findIndex(key => valuesEqual(k, key, ctx));
      return j >= 0 && (a.values[i].kind === 'null' ? b.values[j].kind === 'null' : valuesEqual(a.values[i], b.values[j], ctx));
    });
  }
  const a = collectionElements(obj, ctx.heap)!, b = collectionElements(o!, ctx.heap)!;
  if (a.length !== b.length) return false;
  if (kind === 'list') return a.every((e, i) => valuesEqual(e, b[i], ctx));
  return b.every(e => a.some(x => valuesEqual(e, x, ctx))); // AbstractSet.equals: containsAll
}

/**
 * Natural ordering: a user-defined `compareTo()` for objects (so student
 * `Comparable` classes sort correctly), else `compareJava` for strings and
 * numbers. Other objects have no natural order, and Java throws
 * ClassCastException when asked to sort them.
 */
export function compareValues(a: JavaValue, b: JavaValue, ctx: StdlibContext): number {
  if (a.kind === 'objectRef') {
    const r = ctx.invokeUserMethod(a, 'compareTo', [b]);
    if (r !== undefined) return javaValueToNumber(r);
    throw new StdlibError(`ClassCastException: class ${a.className} cannot be cast to class Comparable`);
  }
  return compareJava(a, b);
}

/**
 * A library comparator: Collections.reverseOrder(), Comparator.naturalOrder(),
 * String.CASE_INSENSITIVE_ORDER, or another comparator's reversed(). It is a
 * `Comparator` object whose fields say how it orders: `order`, and for
 * reversed() the `base` comparator it reverses. The drawing shows both.
 */
export function libraryComparator(order: 'natural' | 'reverse' | 'caseInsensitive', base: JavaValue | undefined, ctx: StdlibContext): JavaValue {
  const fields = new Map<string, JavaValue>([['order', javaString(order)]]);
  if (base) fields.set('base', base);
  return { kind: 'objectRef', heapId: ctx.allocObject('Comparator', fields), className: 'Comparator' };
}

/** Could this argument be a Comparator? A library Comparator, or an object of a user class (whose compare() is called); not a library collection. */
export function isComparator(value: JavaValue | undefined, ctx: StdlibContext): boolean {
  if (value?.kind !== 'objectRef') return false;
  return isBuiltinObject(ctx.heap.get(value.heapId)) ? value.className === 'Comparator' : true;
}

/**
 * Order two values by a comparator: a user object's `compare()`, or a library
 * comparator. With no comparator (undefined or null), natural ordering.
 */
export function compareWith(cmp: JavaValue | undefined, a: JavaValue, b: JavaValue, ctx: StdlibContext): number {
  if (!cmp || cmp.kind === 'null') return compareValues(a, b, ctx);
  if (cmp.kind === 'objectRef' && cmp.className === 'Comparator' && isBuiltinObject(ctx.heap.get(cmp.heapId))) {
    const obj = ctx.heap.get(cmp.heapId);
    const fields = obj && isJavaObject(obj) ? obj.fields : new Map<string, JavaValue>();
    const order = fields.get('order');
    const base = fields.get('base');
    if (order?.kind === 'string' && order.value === 'reverse') return compareWith(base, b, a, ctx);
    if (order?.kind === 'string' && order.value === 'caseInsensitive') {
      const x = javaValueToString(a, ctx.heap).toLowerCase(), y = javaValueToString(b, ctx.heap).toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    }
    return compareValues(a, b, ctx);
  }
  const r = ctx.invokeUserMethod(cmp, 'compare', [a, b]);
  if (r === undefined) {
    const name = cmp.kind === 'objectRef' ? cmp.className : cmp.kind;
    throw new StdlibError(`${name} can't be used as a Comparator, since it has no compare(a, b) method`);
  }
  return javaValueToNumber(r);
}

/** The comparator a PriorityQueue, TreeSet or TreeMap was created with, if any. */
export function comparatorOf(ref: JavaValue, ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(ref.heapId);
  return obj && isJavaObject(obj) ? obj.fields.get('__cmp__') : undefined;
}

/**
 * Allocate a list/set/queue object backed by a `__data__` array.
 * Returns the objectRef.
 */
export function allocCollection(
  className: string,
  elements: JavaValue[],
  elementType: JavaType,
  ctx: StdlibContext,
): JavaValue {
  const dataId = ctx.allocArray(elementType, elements);
  const heapId = ctx.allocObject(className, new Map<string, JavaValue>([
    ['__data__', { kind: 'arrayRef', heapId: dataId }],
  ]));
  return { kind: 'objectRef', heapId, className };
}

/** Allocate a map object backed by parallel `__keys__` / `__values__` arrays. */
export function allocMap(
  className: string,
  keys: JavaValue[],
  values: JavaValue[],
  ctx: StdlibContext,
): JavaValue {
  const kId = ctx.allocArray('Object', keys);
  const vId = ctx.allocArray('Object', values);
  const heapId = ctx.allocObject(className, new Map<string, JavaValue>([
    ['__keys__', { kind: 'arrayRef', heapId: kId }],
    ['__values__', { kind: 'arrayRef', heapId: vId }],
  ]));
  return { kind: 'objectRef', heapId, className };
}
