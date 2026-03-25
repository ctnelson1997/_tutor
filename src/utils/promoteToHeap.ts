import type { ExecutionSnapshot, HeapObject, RuntimeValue, PrimitiveValue } from '../types/snapshot';

/**
 * Python type name mapping from our internal primitive types.
 * In Python, all values are objects — this maps to the actual Python type names.
 */
function pythonTypeName(prim: PrimitiveValue): string {
  if (prim.type === 'number') {
    return typeof prim.value === 'number' && prim.value % 1 !== 0 ? 'float' : 'int';
  }
  if (prim.type === 'string') return 'str';
  if (prim.type === 'boolean') return 'bool';
  if (prim.type === 'null') return 'NoneType';
  return prim.type; // fallback
}

/**
 * Format a primitive value for display as a heap object label.
 */
function formatLabel(prim: PrimitiveValue): string {
  if (prim.type === 'string') return `"${prim.value}"`;
  if (prim.type === 'null') return 'None';
  if (prim.type === 'boolean') return prim.value ? 'True' : 'False';
  return String(prim.value);
}

/**
 * Transform a snapshot so that all inline primitive values become heap references,
 * with corresponding heap objects created. This models Python's "everything is an
 * object" semantics — variables hold references to objects on the heap, even for
 * simple values like integers and strings.
 *
 * Values are deduplicated: if two variables hold the same primitive (e.g. both are
 * the integer 5), they point to the same heap object. This reflects Python's
 * interning behavior for small integers and string literals.
 */
export function promoteToHeap(snapshot: ExecutionSnapshot): ExecutionSnapshot {
  // Map from serialized primitive → heap ID (for deduplication)
  const valueToId = new Map<string, string>();
  const newHeapObjects: HeapObject[] = [];
  let nextId = 90000; // high range to avoid collisions with engine-assigned IDs

  function promote(value: RuntimeValue): RuntimeValue {
    if (value.type === 'ref') return value;

    const prim = value as PrimitiveValue;
    const key = `${prim.type}:${prim.value}`;
    let id = valueToId.get(key);

    if (!id) {
      id = String(nextId++);
      valueToId.set(key, id);
      newHeapObjects.push({
        id,
        objectType: pythonTypeName(prim),
        label: formatLabel(prim),
        properties: [],
      });
    }

    return { type: 'ref', heapId: id };
  }

  // Transform all frames
  const callStack = snapshot.callStack.map((frame) => ({
    ...frame,
    variables: frame.variables.map((v) => ({ ...v, value: promote(v.value) })),
    closureVars: frame.closureVars?.map((v) => ({ ...v, value: promote(v.value) })),
    thisArg: frame.thisArg ? promote(frame.thisArg) : undefined,
  }));

  // Transform primitives inside existing heap object properties too
  const heap = snapshot.heap.map((obj) => ({
    ...obj,
    properties: obj.properties.map((p) => ({ ...p, value: promote(p.value) })),
  }));

  return {
    ...snapshot,
    callStack,
    heap: [...heap, ...newHeapObjects],
  };
}
