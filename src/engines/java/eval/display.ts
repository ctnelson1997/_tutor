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
import { SET_LIKE, scannerRemaining } from '../stdlib';

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
  const fields = () => Array.from(entry.fields.entries()).map(([k, v]) => ({ key: k, value: javaToRuntime(v, heap) }));
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
  if (cls === 'Scanner') {
    // The input still to be read; a string shows its escapes, so the line break nextInt() leaves is visible as \n.
    return { id, objectType: 'object', label: cls, properties: [{ key: 'remaining', value: javaToRuntime(javaString(scannerRemaining(entry)), heap) }] };
  }
  return {
    id, objectType: 'object', label: cls,
    properties: Array.from(entry.fields.entries()).filter(([k]) => !k.startsWith('__')).map(([k, v]) => ({ key: k, value: javaToRuntime(v, heap) })),
  };
}

/**
 * The heap objects a step shows: those reachable from its frames' variables
 * and `this`, in the order they were created. An object nothing refers to any
 * more is left out, as it is garbage in Java. The walk follows the references
 * the drawing shows, so a collection's backing array isn't drawn.
 */
export function reachableHeap(callStack: StackFrame[], heap: Heap): HeapObject[] {
  const objects: HeapObject[] = [];
  const reached = new Set<string>();
  const pending: string[] = [];
  const reach = (value: RuntimeValue | undefined) => {
    if (value?.type === 'ref' && !reached.has(value.heapId)) {
      reached.add(value.heapId);
      pending.push(value.heapId);
    }
  };
  for (const frame of callStack) {
    for (const v of frame.variables) reach(v.value);
    reach(frame.thisArg);
  }
  while (pending.length > 0) {
    const id = pending.pop()!;
    const entry = heap.get(id);
    if (!entry) continue;
    const obj = isJavaArray(entry) ? serializeArray(id, entry, heap) : serializeObject(id, entry, heap);
    objects.push(obj);
    for (const p of obj.properties) reach(p?.value);
  }
  return objects.sort((a, b) => Number(a.id) - Number(b.id));
}
