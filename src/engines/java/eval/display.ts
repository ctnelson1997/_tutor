/**
 * How the heap and values are drawn in a step (#9, #17): Java values as the
 * UI's RuntimeValues, heap objects (collections inline, library objects
 * without their internal fields), and the objects a step shows: those
 * reachable from its frames.
 */

import type { HeapObject, RuntimeValue, StackFrame } from '../../../types/snapshot';
import {
  type JavaValue,
  type JavaHeapEntry,
  type JavaArray,
  type JavaObject,
  isJavaArray,
  javaValueToString,
  javaString,
  javaNull,
  collectionElements,
  mapContents,
} from '../types';
import { stringLiteral, charLiteral } from '../literals';
import { SET_LIKE, scannerRemaining, tokenizerRemaining } from '../stdlib';

type Heap = Map<string, JavaHeapEntry>;

/**
 * A value as a step shows it. Primitives and strings carry Java's own
 * rendering (`display`), so a char shows as 'B' (not like the String "B"),
 * a double as 5.0, a float as Java prints it (1.1, not 1.100000023841858),
 * a long exactly, and a string with its escapes ("a\nb").
 */
export function javaToRuntime(val: JavaValue, heap: Heap): RuntimeValue {
  switch (val.kind) {
    case 'primitive':
      switch (val.javaType) {
        case 'boolean': return { type: 'boolean', value: val.value as boolean };
        case 'char': {
          const code = val.value as number;
          return { type: 'string', value: String.fromCharCode(code), display: charLiteral(code) };
        }
        case 'long': return { type: 'bigint', value: String(val.value) }; // exact past 2^53
        case 'float': case 'double':
          return { type: 'number', value: val.value as number, display: javaValueToString(val, heap) };
        default: return { type: 'number', value: val.value as number };
      }
    case 'string':
      return { type: 'string', value: val.value, display: stringLiteral(val.value) };
    case 'null':
      return { type: 'null', value: null };
    case 'arrayRef':
    case 'objectRef':
      return { type: 'ref', heapId: val.heapId };
  }
}

export function serializeArray(id: string, entry: JavaArray, heap: Heap): HeapObject {
  return {
    id,
    objectType: 'array',
    label: entry.elementType + '[]',
    properties: entry.elements.map((el, i) => ({ key: String(i), value: javaToRuntime(el, heap) })),
  };
}

/**
 * Render a heap object for a step. Library collections show their contents
 * inline (list/set/map objectTypes, views and unmodifiable collections what
 * they show); StringBuilder shows its text; a Scanner shows the input it has
 * left; other library objects hide their internal `__`-prefixed fields. An
 * instance of a user class shows its fields as declared, even when the class
 * is called LinkedList or Stack.
 */
export function serializeObject(id: string, entry: JavaObject, heap: Heap): HeapObject {
  const cls = entry.className;
  const fields = () => [...throwableProperties(entry, heap), ...Array.from(entry.fields.entries()).map(([k, v]) => ({ key: k, value: javaToRuntime(v, heap) }))];
  // A lambda or method reference: its source, with the values it captured.
  if (entry.lambda) return { id, objectType: 'function', label: entry.lambda.text, properties: fields() };
  // An enum constant is labeled with its name.
  if (entry.enumConstant) return { id, objectType: 'object', label: `${entry.enumConstant.enumName}.${entry.enumConstant.name}`, properties: fields() };
  if (!entry.builtin) return { id, objectType: 'object', label: cls, properties: fields() };
  const map = mapContents(entry, heap);
  if (map) {
    return {
      id, objectType: 'map', label: cls,
      properties: map.keys.map((k, i) => ({ key: javaValueToString(k, heap), value: javaToRuntime(map.values[i] ?? javaNull(), heap) })),
    };
  }
  const elements = collectionElements(entry, heap);
  if (elements) {
    return {
      id, objectType: SET_LIKE.has(cls) || cls === 'KeySet' || cls === 'EntrySet' ? 'set' : 'list', label: cls,
      properties: elements.map((e, i) => ({ key: String(i), value: javaToRuntime(e, heap) })),
    };
  }
  if (cls === 'StringBuilder' || cls === 'StringBuffer') {
    return { id, objectType: 'object', label: cls, properties: [{ key: 'value', value: javaToRuntime(entry.fields.get('value') ?? javaNull(), heap) }] };
  }
  if (cls === 'StringTokenizer') {
    return { id, objectType: 'object', label: cls, properties: [{ key: 'remaining', value: javaToRuntime(javaString(tokenizerRemaining(entry)), heap) }] };
  }
  if (cls === 'Scanner') {
    // The input still to be read; a string shows its escapes, so the line break nextInt() leaves is visible as \n.
    return { id, objectType: 'object', label: cls, properties: [{ key: 'remaining', value: javaToRuntime(javaString(scannerRemaining(entry)), heap) }] };
  }
  return {
    id, objectType: 'object', label: cls,
    properties: [
      ...throwableProperties(entry, heap),
      ...Array.from(entry.fields.entries()).filter(([k]) => !k.startsWith('__')).map(([k, v]) => ({ key: k, value: javaToRuntime(v, heap) })),
    ],
  };
}

/**
 * A Throwable's own state, drawn before its class's fields (#64): its
 * `message`, its `cause` and its suppressed exceptions when it has them.
 * A field of the program's class with one of those names keeps it, and
 * Throwable's is drawn as `Throwable.message`, as a hidden field is.
 */
function throwableProperties(entry: JavaObject, heap: Heap): HeapObject['properties'] {
  const t = entry.throwable;
  if (!t) return [];
  const key = (name: string) => (entry.fields.has(name) ? `Throwable.${name}` : name);
  const out = [{ key: key('message'), value: javaToRuntime(t.message, heap) }];
  if (t.cause.kind !== 'null') out.push({ key: key('cause'), value: javaToRuntime(t.cause, heap) });
  t.suppressed.forEach((s, i) => out.push({ key: `suppressed[${i}]`, value: javaToRuntime(s, heap) }));
  return out;
}

/**
 * The heap objects a step shows: those reachable from its frames' variables
 * and `this`, in the order they were created. An object nothing refers to any
 * more is left out, as it is garbage in Java. The walk follows the references
 * the drawing shows, so a collection's backing array isn't drawn.
 */
export function reachableHeap(callStack: StackFrame[], heap: Heap, draw: (id: string, entry: JavaHeapEntry) => HeapObject = (id, entry) => drawEntry(id, entry, heap)): HeapObject[] {
  const drawn = new Map<string, HeapObject>();
  const pending: HeapObject[] = [];
  const reach = (value: RuntimeValue | undefined) => {
    if (value?.type !== 'ref' || drawn.has(value.heapId)) return;
    const entry = heap.get(value.heapId);
    if (!entry) return;
    const obj = draw(value.heapId, entry);
    drawn.set(value.heapId, obj);
    pending.push(obj);
  };
  for (const frame of callStack) {
    for (const v of frame.variables) reach(v.value);
    reach(frame.thisArg);
  }
  while (pending.length > 0) {
    for (const p of pending.pop()!.properties) reach(p?.value);
  }
  // The heap holds its objects in creation order (ids count up, and none is removed): walking it beats sorting once a step shows a good part of it.
  if (drawn.size * 8 < heap.size) return [...drawn.values()].sort((a, b) => Number(a.id) - Number(b.id));
  const objects: HeapObject[] = [];
  for (const id of heap.keys()) {
    const obj = drawn.get(id);
    if (obj) objects.push(obj);
  }
  return objects;
}

function drawEntry(id: string, entry: JavaHeapEntry, heap: Heap): HeapObject {
  return isJavaArray(entry) ? serializeArray(id, entry, heap) : serializeObject(id, entry, heap);
}

/**
 * The heap as the steps draw it, each object drawn again only when what it
 * shows has changed (#73): an array when one of its elements is another
 * value, an object of the program's class when one of its fields is, a
 * library collection when one of its elements (or a map's keys and values)
 * is. Java values are never changed in place, so a field that holds the same
 * value object shows the same thing. Other library objects (a Scanner, a
 * StringBuilder), throwables and maps keyed by objects (whose keys print
 * what the objects hold) are drawn at every step. `remember` keeps the
 * version the snapshot sharer settled on, so an unchanged object is the very
 * object the step before showed, and sharing it costs nothing.
 */
export class HeapDrawing {
  private readonly heap: Heap;
  private readonly cache = new Map<string, { shows: JavaValue[]; drawn: HeapObject }>();

  constructor(heap: Heap) {
    this.heap = heap;
  }

  /** The heap objects a step shows (see reachableHeap). */
  reachable(callStack: StackFrame[]): HeapObject[] {
    return reachableHeap(callStack, this.heap, (id, entry) => this.draw(id, entry));
  }

  /** Keep the objects a step was recorded with, as the sharer gave them back. */
  remember(objects: HeapObject[]): void {
    for (const obj of objects) {
      const cached = this.cache.get(obj.id);
      if (cached) cached.drawn = obj;
    }
  }

  private draw(id: string, entry: JavaHeapEntry): HeapObject {
    const cached = this.cache.get(id);
    if (cached && this.unchanged(cached.shows, entry)) return cached.drawn;
    const drawn = drawEntry(id, entry, this.heap);
    const shows = this.shown(entry);
    if (shows) this.cache.set(id, { shows: shows.slice(), drawn });
    return drawn;
  }

  /** Does the object show the values it showed (compared without copying them)? */
  private unchanged(shows: JavaValue[], entry: JavaHeapEntry): boolean {
    if (!isJavaArray(entry) && !entry.builtin && !entry.throwable) {
      if (entry.fields.size !== shows.length) return false;
      let i = 0;
      for (const value of entry.fields.values()) if (value !== shows[i++]) return false;
      return true;
    }
    const now = this.shown(entry);
    return now !== undefined && sameValues(shows, now);
  }

  /** The values an object's drawing depends on alone (a live array: copied when kept), or undefined to draw it every time. */
  private shown(entry: JavaHeapEntry): JavaValue[] | undefined {
    if (isJavaArray(entry)) return entry.elements;
    if (entry.throwable) return undefined;
    if (!entry.builtin) return Array.from(entry.fields.values());
    const map = mapContents(entry, this.heap);
    if (map) return map.keys.some(k => k.kind === 'objectRef' || k.kind === 'arrayRef') ? undefined : [...map.keys, ...map.values];
    return collectionElements(entry, this.heap);
  }
}

function sameValues(a: readonly JavaValue[], b: readonly JavaValue[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
