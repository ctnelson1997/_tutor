/**
 * hashCode() and java.util.HashMap's table (#21).
 *
 * A HashMap iterates bucket by bucket, and a bucket in the order its keys
 * were inserted, so printing or looping over a HashMap or HashSet shows an
 * order that depends on each key's hashCode() and on the table's capacity:
 * `{banana=3, date=2, apple=1, cherry=7}`. The collections keep their keys in
 * that order, so the table here is only the capacity and each key's hash.
 *
 * As in the JDK:
 *   - a key's hash is its hashCode() spread as `h ^ (h >>> 16)`, and is kept
 *     with the key (a key whose hashCode() changes later isn't found again);
 *   - its bucket is `hash & (capacity - 1)`;
 *   - the table has 16 buckets at the first put (or the power of two at
 *     least the initial capacity it was given), and doubles when the size
 *     goes past 0.75 of the capacity, or when a bucket reaches 9 keys while
 *     the table is smaller than 64 (treeifyBin resizes instead);
 *   - doubling keeps the keys of each new bucket in their old relative order.
 * A bucket of 9 or more keys in a table of 64 or more becomes a tree in the
 * JDK, which iterates differently. That takes many keys with colliding
 * hashes, and isn't modeled.
 */

import { type JavaValue, type HashTable, isBuiltinObject, javaValueToNumber, identityHash, collectionElements, mapContents } from '../types';
import type { StdlibContext } from './context';
import { stringHashCode, boxedHashCode } from './strings';
import { collectionKind, valuesEqual } from './util';

/** System.identityHashCode, matching the hex an object's toString() prints. */
export function identityHashCode(heapId: string): number {
  return parseInt(identityHash(heapId), 16);
}

/**
 * hashCode() as Java computes it: String's and the boxes' (Integer's value,
 * Character's code, Long's halves xor'ed, …), a user class's own hashCode(),
 * the collections' (List: 31 * h + e, Set: the sum, Map: the sum of
 * key ^ value, Map.Entry: key ^ value), and for anything else the identity
 * hash.
 */
export function hashCodeOf(value: JavaValue, ctx: StdlibContext): number {
  switch (value.kind) {
    case 'null': return 0;
    case 'primitive': return boxedHashCode(value);
    case 'string': return stringHashCode(value.value);
    case 'arrayRef': return identityHashCode(value.heapId);
    case 'objectRef': {
      const obj = ctx.heap.get(value.heapId);
      if (!isBuiltinObject(obj)) {
        const r = ctx.invokeUserMethod(value, 'hashCode', []);
        return r !== undefined ? javaValueToNumber(r) | 0 : identityHashCode(value.heapId);
      }
      if (obj.className === 'MapEntry') return hashCodeOf(obj.fields.get('key')!, ctx) ^ hashCodeOf(obj.fields.get('value')!, ctx);
      const kind = collectionKind(obj);
      if (kind === 'map') {
        const { keys, values } = mapContents(obj, ctx.heap)!;
        return keys.reduce((h, k, i) => (h + (hashCodeOf(k, ctx) ^ hashCodeOf(values[i], ctx))) | 0, 0);
      }
      if (kind === 'list') return collectionElements(obj, ctx.heap)!.reduce((h, e) => (Math.imul(31, h) + hashCodeOf(e, ctx)) | 0, 1);
      if (kind === 'set') return collectionElements(obj, ctx.heap)!.reduce((h, e) => (h + hashCodeOf(e, ctx)) | 0, 0);
      return identityHashCode(value.heapId);
    }
  }
}

/** HashMap.hash: the hashCode with its high bits folded into the low ones. */
export function spreadHash(value: JavaValue, ctx: StdlibContext): number {
  const h = hashCodeOf(value, ctx);
  return h ^ (h >>> 16);
}

const MAXIMUM_CAPACITY = 1 << 30;

/** HashMap.tableSizeFor: the least power of two at least n (1 for n <= 1). */
export function tableSizeFor(n: number): number {
  let size = 1;
  while (size < n && size < MAXIMUM_CAPACITY) size *= 2;
  return size;
}

/** A new, empty table: for `new HashMap<>()`, or `new HashMap<>(requested)` (which allocates tableSizeFor(requested) buckets at the first put). */
export function newTable(requested?: number): HashTable {
  return { capacity: 0, initialCapacity: requested === undefined ? 0 : tableSizeFor(requested), hashes: [] };
}

/** `a == b` for references: the same object (user equals() isn't asked then, as in HashMap). */
const sameReference = (a: JavaValue, b: JavaValue) =>
  a === b || (a.kind === 'objectRef' && b.kind === 'objectRef' && a.heapId === b.heapId) || (a.kind === 'arrayRef' && b.kind === 'arrayRef' && a.heapId === b.heapId);

const threshold = (capacity: number) => Math.floor(capacity * 0.75);
const bucket = (hash: number, capacity: number) => hash & (capacity - 1);

/**
 * The index of `key` among `keys`, or -1: a key with the same hash that
 * `key.equals()`, as HashMap.getNode looks for it.
 */
export function hashFind(table: HashTable, keys: JavaValue[], key: JavaValue, hash: number, ctx: StdlibContext): number {
  for (let i = 0; i < keys.length; i++) {
    if (table.hashes[i] !== hash) continue;
    const k = keys[i];
    if (key.kind === 'null' ? k.kind === 'null' : sameReference(k, key) || valuesEqual(key, k, ctx)) return i;
  }
  return -1;
}

/**
 * Insert a new key (and its value, in the parallel arrays) where the map
 * iterates it: at the end of its bucket for a HashMap or HashSet
 * (`bucketOrder`), at the end for a LinkedHashMap or LinkedHashSet. Then grow
 * the table as HashMap.putVal does.
 */
export function hashInsert(table: HashTable, arrays: JavaValue[][], items: JavaValue[], hash: number, bucketOrder: boolean): void {
  if (table.capacity === 0) table.capacity = table.initialCapacity || 16;
  let pos = table.hashes.length;
  if (bucketOrder) {
    const b = bucket(hash, table.capacity);
    pos = table.hashes.findIndex(h => bucket(h, table.capacity) > b);
    if (pos < 0) pos = table.hashes.length;
  }
  table.hashes.splice(pos, 0, hash);
  arrays.forEach((arr, i) => arr.splice(pos, 0, items[i]));
  if (table.capacity < 64) {
    const b = bucket(hash, table.capacity);
    const binCount = table.hashes.reduce((n, h) => n + (bucket(h, table.capacity) === b ? 1 : 0), 0);
    if (binCount >= 9) resize(table, arrays, bucketOrder); // treeifyBin on a small table
  }
  if (table.hashes.length > threshold(table.capacity)) resize(table, arrays, bucketOrder);
}

/** Remove the key at `index` (the table keeps its capacity, as HashMap's does). */
export function hashRemove(table: HashTable, arrays: JavaValue[][], index: number): void {
  table.hashes.splice(index, 1);
  for (const arr of arrays) arr.splice(index, 1);
}

/** Double the table, keeping each new bucket's keys in their old order. */
function resize(table: HashTable, arrays: JavaValue[][], bucketOrder: boolean): void {
  if (table.capacity >= MAXIMUM_CAPACITY) return;
  table.capacity *= 2;
  if (!bucketOrder) return;
  const order = table.hashes.map((_, i) => i);
  order.sort((a, b) => bucket(table.hashes[a], table.capacity) - bucket(table.hashes[b], table.capacity) || a - b);
  table.hashes = order.map(i => table.hashes[i]);
  for (const arr of arrays) {
    const copy = order.map(i => arr[i]);
    arr.splice(0, arr.length, ...copy);
  }
}

/**
 * Size the table for `count` more keys before they are put, as
 * HashMap.putMapEntries does for `new HashMap<>(map)` and putAll(map): an
 * unallocated table gets room for them all, an allocated one doubles while
 * `count` alone exceeds its threshold.
 */
export function presize(table: HashTable, arrays: JavaValue[][], count: number, bucketOrder: boolean): void {
  if (count <= 0) return;
  if (table.capacity === 0) {
    const t = Math.min(Math.ceil(count / 0.75), MAXIMUM_CAPACITY);
    if (t > table.initialCapacity) table.initialCapacity = tableSizeFor(t);
    return;
  }
  while (count > threshold(table.capacity) && table.capacity < MAXIMUM_CAPACITY) resize(table, arrays, bucketOrder);
}
