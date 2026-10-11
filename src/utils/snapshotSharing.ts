import type { ExecutionSnapshot, HeapObject, Property, RuntimeValue, StackFrame, Variable } from '../types/snapshot';

function sameValue(a: RuntimeValue | undefined, b: RuntimeValue | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === 'ref') return b.type === 'ref' && a.heapId === b.heapId;
  return b.type !== 'ref' && a.value === b.value && a.display === b.display;
}

/**
 * Items of `next` replaced by their equal counterparts in `previous`:
 * `previous` itself when every item matches it, and `next` itself when no
 * item was replaced.
 */
function shareArray<T>(previous: T[] | undefined, next: T[], share: (old: T | undefined, item: T, index: number) => T): T[] {
  if (previous === next) return next;
  let matchesPrevious = previous !== undefined && previous.length === next.length;
  let unchanged = true;
  const out = next.map((item, i) => {
    const shared = share(previous?.[i], item, i);
    if (shared !== previous?.[i]) matchesPrevious = false;
    if (shared !== item) unchanged = false;
    return shared;
  });
  return matchesPrevious ? previous! : unchanged ? next : out;
}

function shareVariable(old: Variable | undefined, next: Variable): Variable {
  return old && old.name === next.name && sameValue(old.value, next.value) ? old : next;
}

function shareFrame(old: StackFrame | undefined, next: StackFrame): StackFrame {
  if (old === next) return old;
  if (!old || old.name !== next.name || old.isBlockScope !== next.isBlockScope || !sameValue(old.thisArg, next.thisArg)) return next;
  const variables = shareArray(old.variables, next.variables, shareVariable);
  const closureVars = next.closureVars && shareArray(old.closureVars, next.closureVars, shareVariable);
  if (variables === old.variables && closureVars === old.closureVars) return old;
  if (variables === next.variables && closureVars === next.closureVars) return next;
  return { ...next, variables, ...(closureVars ? { closureVars } : {}) };
}

function shareProperty(old: Property | undefined, next: Property): Property {
  return old && old.key === next.key && sameValue(old.value, next.value) ? old : next;
}

function shareHeapObject(old: HeapObject | undefined, next: HeapObject): HeapObject {
  if (old === next) return old;
  if (!old || old.objectType !== next.objectType || old.label !== next.label || !sameValue(old.proto, next.proto)) return next;
  const properties = shareArray(old.properties, next.properties, shareProperty);
  return properties === old.properties ? old : properties === next.properties ? next : { ...next, properties };
}

/**
 * Makes each snapshot share, with the snapshots before it, every part that
 * hasn't changed: frames, variables, heap objects (matched by id, from any
 * earlier step), their properties, and the stdout lines. A postMessage
 * (structured clone) and the store then hold each unchanged object once, so
 * the steps of a run cost what changes at each step, not the whole heap
 * again (#18). Snapshots are never modified, so sharing equal data is safe;
 * which snapshot an object first appeared in doesn't matter.
 */
export class SnapshotSharer {
  private previous: ExecutionSnapshot | undefined;
  /** The last version of each heap object, by id. */
  private heap = new Map<string, HeapObject>();

  share(next: ExecutionSnapshot): ExecutionSnapshot {
    const previous = this.previous;
    const callStack = shareArray(previous?.callStack, next.callStack, shareFrame);
    const heap = shareArray(previous?.heap, next.heap, (_old, obj) => {
      const shared = shareHeapObject(this.heap.get(obj.id), obj);
      this.heap.set(obj.id, shared);
      return shared;
    });
    const stdout = previous && previous.stdout.length === next.stdout.length && previous.stdout.every((line, i) => line === next.stdout[i])
      ? previous.stdout : next.stdout;
    const shared = callStack === next.callStack && heap === next.heap && stdout === next.stdout ? next : { ...next, callStack, heap, stdout };
    this.previous = shared;
    return shared;
  }
}

/** The steps of a run with their unchanged parts shared (see SnapshotSharer). */
export function shareSnapshots(snapshots: ExecutionSnapshot[]): ExecutionSnapshot[] {
  const sharer = new SnapshotSharer();
  return snapshots.map(s => sharer.share(s));
}
