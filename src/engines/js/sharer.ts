/**
 * Snapshot sharing in the JS runtime (#49): `__shareSnapshot__(snap)` makes
 * each snapshot share, with the snapshots before it, every part that hasn't
 * changed, as it is recorded, so the worker's postMessage (a structured
 * clone, which writes a shared object once) carries each unchanged frame,
 * variable, heap object and console line once, not again at every step.
 *
 * The same algorithm as src/utils/snapshotSharing.ts (SnapshotSharer, #18),
 * written as a script for the worker; sharer.test.ts checks the two share
 * exactly the same parts. A string, not a function's source, for the reason
 * inspect.ts gives (keepNames helpers); no backticks or dollar-brace inside.
 */
export const SHARER_SOURCE = String.raw`
var __shareSnapshot__ = (function () {
  function sameValue(a, b) {
    if (a === b) return true;
    if (!a || !b || a.type !== b.type) return false;
    if (a.type === "ref") return a.heapId === b.heapId;
    return Object.is(a.value, b.value) && a.display === b.display;
  }
  function shareArray(previous, next, share) {
    if (previous === next) return next;
    var matchesPrevious = previous !== undefined && previous.length === next.length;
    var unchanged = true;
    var out = [];
    for (var i = 0; i < next.length; i++) {
      var old = previous ? previous[i] : undefined;
      var shared = share(old, next[i]);
      if (shared !== old) matchesPrevious = false;
      if (shared !== next[i]) unchanged = false;
      out.push(shared);
    }
    return matchesPrevious ? previous : unchanged ? next : out;
  }
  function shareVariable(old, next) {
    return old && old.name === next.name && sameValue(old.value, next.value) ? old : next;
  }
  function shareFrame(old, next) {
    if (old === next) return old;
    if (!old || old.name !== next.name || old.isBlockScope !== next.isBlockScope || !sameValue(old.thisArg, next.thisArg)) return next;
    var variables = shareArray(old.variables, next.variables, shareVariable);
    var closureVars = next.closureVars && shareArray(old.closureVars, next.closureVars, shareVariable);
    if (variables === old.variables && closureVars === old.closureVars) return old;
    if (variables === next.variables && closureVars === next.closureVars) return next;
    var frame = Object.assign({}, next, { variables: variables });
    if (closureVars) frame.closureVars = closureVars;
    return frame;
  }
  function shareProperty(old, next) {
    return old && old.key === next.key && sameValue(old.value, next.value) && sameValue(old.keyValue, next.keyValue) ? old : next;
  }
  function shareConsoleLine(old, next) {
    return old && old.text === next.text && old.stream === next.stream ? old : next;
  }
  function shareHeapObject(old, next) {
    if (old === next) return old;
    if (!old || old.objectType !== next.objectType || old.label !== next.label || !sameValue(old.proto, next.proto)) return next;
    var properties = shareArray(old.properties, next.properties, shareProperty);
    return properties === old.properties ? old : properties === next.properties ? next : Object.assign({}, next, { properties: properties });
  }

  var previous;
  // The last version of each heap object, by id.
  var heap = new Map();
  return function share(next) {
    var callStack = shareArray(previous && previous.callStack, next.callStack, shareFrame);
    var sharedHeap = shareArray(previous && previous.heap, next.heap, function (_old, obj) {
      var shared = shareHeapObject(heap.get(obj.id), obj);
      heap.set(obj.id, shared);
      return shared;
    });
    var stdout = next.stdout;
    if (previous && previous.stdout.length === next.stdout.length) {
      var same = true;
      for (var i = 0; i < next.stdout.length; i++) if (previous.stdout[i] !== next.stdout[i]) { same = false; break; }
      if (same) stdout = previous.stdout;
    }
    var consoleLines = next.console && shareArray(previous && previous.console, next.console, shareConsoleLine);
    var shared = next;
    if (callStack !== next.callStack || sharedHeap !== next.heap || stdout !== next.stdout || consoleLines !== next.console) {
      shared = Object.assign({}, next, { callStack: callStack, heap: sharedHeap, stdout: stdout });
      if (consoleLines) shared.console = consoleLines;
    }
    previous = shared;
    return shared;
  };
})();
`;
