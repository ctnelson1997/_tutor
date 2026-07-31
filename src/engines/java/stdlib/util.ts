/**
 * Shared helpers for the Java stdlib modules: value comparison/equality with
 * Java-ish semantics, and helpers for the backing storage of collection
 * objects (lists/sets use a `__data__` array; maps use parallel
 * `__keys__` / `__values__` arrays).
 */

import {
  type JavaValue,
  type JavaArray,
  type JavaType,
  isJavaArray,
  isJavaObject,
  javaValueToNumber,
  javaValueToBoolean,
  javaInt,
} from '../types';
import type { StdlibContext } from './context';

/** Class names that store their contents in a `__data__` backing array. */
export const LIST_LIKE = new Set([
  'ArrayList', 'LinkedList', 'Vector', 'Stack', 'ArrayDeque', 'PriorityQueue',
]);
export const SET_LIKE = new Set(['HashSet', 'LinkedHashSet', 'TreeSet']);
export const MAP_LIKE = new Set(['HashMap', 'LinkedHashMap', 'TreeMap']);

/** True if a collection keeps its elements/keys in sorted order. */
export function isSorted(className: string): boolean {
  return className === 'TreeSet' || className === 'TreeMap' || className === 'PriorityQueue';
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
  const na = javaValueToNumber(a);
  const nb = javaValueToNumber(b);
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/**
 * Value equality used for set membership and map keys. Primitives compare by
 * numeric value, strings by content, null to null, references by identity.
 * (A pragmatic teaching approximation of Java's `.equals` / autoboxing.)
 */
export function javaEquals(a: JavaValue, b: JavaValue): boolean {
  if (a.kind === 'null' || b.kind === 'null') return a.kind === 'null' && b.kind === 'null';
  if (a.kind === 'string' || b.kind === 'string') {
    return a.kind === 'string' && b.kind === 'string' && a.value === b.value;
  }
  if (a.kind === 'primitive' && b.kind === 'primitive') return a.value === b.value;
  if (a.kind === 'arrayRef' && b.kind === 'arrayRef') return a.heapId === b.heapId;
  if (a.kind === 'objectRef' && b.kind === 'objectRef') return a.heapId === b.heapId;
  return false;
}

/** Resolve the backing `__data__` array of a list/set object. */
export function backingArray(ref: JavaValue, ctx: StdlibContext): JavaArray | undefined {
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
  ctx: StdlibContext,
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

/** Keep the `size` display field of a collection in sync with its backing array. */
export function syncSize(ref: JavaValue, length: number, ctx: StdlibContext): void {
  if (ref.kind !== 'objectRef') return;
  const obj = ctx.heap.get(ref.heapId);
  if (obj && isJavaObject(obj)) obj.fields.set('size', javaInt(length));
}

/**
 * Equality honoring a user-defined `equals()` for objects (so student classes
 * work in HashSet/HashMap/contains), falling back to `javaEquals`.
 */
export function valuesEqual(a: JavaValue, b: JavaValue, ctx: StdlibContext): boolean {
  if (a.kind === 'objectRef') {
    const r = ctx.invokeUserMethod(a, 'equals', [b]);
    if (r !== undefined) return javaValueToBoolean(r);
  }
  return javaEquals(a, b);
}

/**
 * Ordering honoring a user-defined `compareTo()` for objects (so student
 * `Comparable` classes sort correctly), falling back to `compareJava`.
 */
export function compareValues(a: JavaValue, b: JavaValue, ctx: StdlibContext): number {
  if (a.kind === 'objectRef') {
    const r = ctx.invokeUserMethod(a, 'compareTo', [b]);
    if (r !== undefined) return javaValueToNumber(r);
  }
  return compareJava(a, b);
}

/** Insert into a sorted array (used by TreeSet/PriorityQueue), honoring compareTo. */
export function sortedInsert(elements: JavaValue[], value: JavaValue, ctx: StdlibContext): void {
  let i = 0;
  while (i < elements.length && compareValues(elements[i], value, ctx) <= 0) i++;
  elements.splice(i, 0, value);
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
    ['size', javaInt(elements.length)],
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
    ['size', javaInt(keys.length)],
    ['__keys__', { kind: 'arrayRef', heapId: kId }],
    ['__values__', { kind: 'arrayRef', heapId: vId }],
  ]));
  return { kind: 'objectRef', heapId, className };
}

/** Number of elements in an array-backed collection, for bounds checks. */
export function arrLen(arr: JavaArray): number {
  return arr.elements.length;
}
