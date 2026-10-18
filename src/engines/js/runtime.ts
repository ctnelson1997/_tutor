/**
 * Runtime Helpers
 *
 * This module generates the runtime JavaScript code that gets prepended
 * to the instrumented user code inside the Web Worker.
 *
 * It provides:
 *  - __capture__(line, vars) — serialize state into a snapshot
 *  - __pushFrame__(name, params) — push a call stack frame
 *  - __popFrame__() — pop a call stack frame
 *  - the program's console (inspect.ts: Node's format, #43), writing
 *    stdout and stderr lines that each snapshot carries
 *  - Serialization logic for primitives, objects, arrays, functions
 */

import { CONSOLE_SOURCE } from './inspect';

/**
 * Returns the runtime preamble as a string of JavaScript to be
 * evaluated in the worker before the instrumented user code.
 */
export function getRuntimeCode(): string {
  // This is a self-contained JS string — no imports, no TypeScript.
  return `
// ══════════════════════════════════════
// JS Runtime Helpers
// ══════════════════════════════════════

var __snapshots__ = [];
// The console, by line: stdout's lines, and every line with its stream (the
// snapshot's console once the program has written to stderr).
var __stdout__ = [];
var __console__ = [];
var __stderrUsed__ = false;
var __callStack__ = [{ name: "Global", variables: {} }];
var __heapMap__ = new Map();  // object identity → heap ID
var __heapRegistry__ = {};   // heapId → most recent serialized HeapObject
var __heapCounter__ = 0;
// Since the last step: was a frame pushed (a call, a loop's block), and how
// many loop iterations had begun. Either makes the next capture a step even
// on the line the frame last stepped at, as a call or a loop's backward jump
// is in CPython.
var __framePushed__ = false;
var __stepLoopCount__ = 0;
var __MAX_SNAPSHOTS = 5000;
// Thrown at the step cap, so the program stops instead of running on unrecorded.
var __STOP__ = { __tutorStop__: true };
// Set once the cap is hit: a callback that hits it inside a promise only rejects that promise.
var __stopped__ = false;
// The time budget for the program's callbacks, before the worker's 10-second kill.
var __TIME_LIMIT__ = { __tutorTime__: true };
var __TIME_BUDGET_MS__ = 8500;
// After the script's synchronous code (#45): its timers and promise callbacks
// run before the reply. The step that starts a callback gets a label saying so.
var __scriptDone__ = false;
var __scriptEndStep__ = 0;
var __nextLabel__ = null;

// Expose snapshots on the global scope so the worker can read them
self.__snapshots__ = __snapshots__;

// The worker's reply once the program has run: its steps, and why it stopped
// early if it did. Called with the thrown value when the program threw: the
// step cap, the loop guard, or an exception the program didn't catch.
function __runResult__(err) {
  __finishOutput__();
  var msg = { type: "result", snapshots: __snapshots__ };
  if (arguments.length === 0) {
    if (__snapshots__.length >= __MAX_SNAPSHOTS) {
      msg.error = { kind: "limit", message: "Stopped recording after " + __MAX_SNAPSHOTS + " steps, the most that can be shown." };
    }
    return msg;
  }
  if (err === __STOP__) {
    msg.error = { kind: "limit", message: "Stopped after " + __MAX_SNAPSHOTS + " steps, the most that can be shown. Your code may contain an infinite loop." };
  } else if (err === __TIME_LIMIT__) {
    msg.error = { kind: "limit", message: "Stopped after " + (__TIME_BUDGET_MS__ / 1000) + " seconds, the longest a run can take. A timer may keep running forever (a setInterval never cleared)." };
  } else if (err instanceof Error && err.message.indexOf("Infinite loop detected") === 0) {
    msg.error = { kind: "limit", message: err.message };
  } else {
    var text = err instanceof Error ? err.name + ": " + err.message : String(err);
    // The console shows the stack, whose frames name the program's lines (#47).
    var trace = text;
    if (err instanceof Error) {
      try { if (typeof err.stack === "string" && err.stack.indexOf(text) === 0) trace = err.stack; } catch (e) { /* a stack getter that throws */ }
    }
    // A rejected promise nothing handled ends the run as Node ends it; the browser says "(in promise)".
    msg.error = { kind: "exception", message: text, stderr: (arguments[1] === "promise" ? "Uncaught (in promise) " : "Uncaught ") + trace };
  }
  return msg;
}
self.__runResult__ = __runResult__;

// Output written after the last step (a finally block's, on the way out of an
// uncaught exception) gets one more step, the last, at the same place.
function __finishOutput__() {
  var last = __snapshots__[__snapshots__.length - 1];
  if (!last || __snapshots__.length >= __MAX_SNAPSHOTS) return;
  if (last.stdout.length === __stdout__.length && (last.console ? last.console.length : last.stdout.length) === __console__.length) return;
  var snap = { step: __snapshots__.length, line: last.line, callStack: last.callStack, heap: last.heap };
  __outputOf__(snap);
  __snapshots__.push(snap);
}

// A snapshot's console: stdout's lines, and once the program has used stderr, every line with its stream.
function __outputOf__(snap) {
  snap.stdout = __stdout__.slice();
  if (__stderrUsed__) snap.console = __console__.slice();
  if (__nextLabel__) { snap.label = __nextLabel__; __nextLabel__ = null; }
  return snap;
}

// The Global frame shows each top-level name's current value at every step,
// inside functions too (a callback changing a global, #45): __globals__(),
// which the instrumenter adds to the program, reads them all.
function __refreshGlobals__(heapObjects, visited) {
  if (__callStack__.length > 1 && typeof __globals__ === "function") {
    __callStack__[0].variables = __serializeVars__(__globals__(), heapObjects, visited);
  }
}

// ── Serialization ──

function __getHeapId__(obj) {
  if (__heapMap__.has(obj)) return __heapMap__.get(obj);
  var id = String(++__heapCounter__);
  __heapMap__.set(obj, id);
  return id;
}

function __serializeValue__(val, heapObjects, visited) {
  // Primitives
  if (val === null) return { type: "null", value: null };
  if (val === undefined) return { type: "undefined", value: null };
  var t = typeof val;
  // NaN, the infinities and -0 say what they are (#48): JSON has no such numbers, and -0 prints as 0.
  if (t === "number") {
    if (val !== val) return { type: t, value: val, display: "NaN" };
    if (val === Infinity || val === -Infinity) return { type: t, value: val, display: val > 0 ? "Infinity" : "-Infinity" };
    if (val === 0 && 1 / val < 0) return { type: t, value: val, display: "-0" };
    return { type: t, value: val };
  }
  if (t === "boolean") return { type: t, value: val };
  if (t === "string") return { type: "string", value: val };
  if (t === "symbol") return { type: "symbol", value: val.toString() };
  if (t === "bigint") return { type: "bigint", value: val.toString() };

  // Objects / Arrays / Functions → heap reference
  if (t === "object" || t === "function") {
    var heapId = __getHeapId__(val);
    // Only serialize the object once per snapshot
    if (!visited.has(val)) {
      visited.add(val);
      var heapObj = __serializeHeapObject__(val, heapId, heapObjects, visited);
      heapObjects.push(heapObj);
    }
    return { type: "ref", heapId: heapId };
  }

  return { type: "undefined", value: null };
}

function __serializeHeapObject__(obj, heapId, heapObjects, visited) {
  var objectType = "object";
  var label = "";
  var properties = [];

  if (Array.isArray(obj)) {
    objectType = "array";
    for (var i = 0; i < obj.length && i < 100; i++) {
      // A hole is drawn as empty, not undefined; a getter isn't called (#48).
      var cell = Object.getOwnPropertyDescriptor(obj, i);
      var cellValue = !cell ? { type: "empty", value: null, display: "empty" }
        : !("value" in cell) ? { type: "string", value: cell.get && cell.set ? "<accessor>" : cell.get ? "<getter>" : "<setter>" }
        : __serializeValue__(cell.value, heapObjects, visited);
      properties.push({ key: String(i), value: cellValue });
    }
    if (obj.length > 100) {
      properties.push({ key: "...", value: { type: "string", value: "(" + (obj.length - 100) + " more)" } });
    }
  } else if (typeof obj === "function") {
    objectType = "function";
    label = obj.name || "anonymous";
  } else if (obj instanceof Date) {
    objectType = "date";
    label = obj.toISOString();
  } else if (obj instanceof RegExp) {
    objectType = "regexp";
    label = obj.toString();
  } else if (obj instanceof Error) {
    // Its stack isn't read: V8 writes a stack's text the first time it is read,
    // from the error's name then, which a step taken before a constructor sets
    // the name would freeze (#47).
    objectType = "error";
    label = obj.constructor.name;
    properties.push({ key: "message", value: { type: "string", value: obj.message } });
    var errorKeys = Object.keys(obj);
    for (var ek = 0; ek < errorKeys.length && ek < 50; ek++) {
      var ed = Object.getOwnPropertyDescriptor(obj, errorKeys[ek]);
      if (errorKeys[ek] === "message" || errorKeys[ek] === "stack" || !ed || !("value" in ed)) continue;
      properties.push({ key: errorKeys[ek], value: __serializeValue__(ed.value, heapObjects, visited) });
    }
  } else if (obj instanceof Map) {
    objectType = "map";
    var idx = 0;
    obj.forEach(function(v, k) {
      if (idx < 50) {
        // The key is drawn as a value too, so an object key is a reference to its object (#48).
        var keyValue = __serializeValue__(k, heapObjects, visited);
        properties.push({
          key: keyValue.type === "ref" ? "#" + keyValue.heapId : typeof k === "symbol" ? k.toString() : String(k),
          keyValue: keyValue,
          value: __serializeValue__(v, heapObjects, visited)
        });
      }
      idx++;
    });
  } else if (obj instanceof Set) {
    objectType = "set";
    var idx2 = 0;
    obj.forEach(function(v) {
      if (idx2 < 50) {
        properties.push({
          key: String(idx2),
          value: __serializeValue__(v, heapObjects, visited)
        });
      }
      idx2++;
    });
  } else {
    // Regular object
    var constructor = obj.constructor;
    if (constructor && constructor.name && constructor.name !== "Object") {
      objectType = "class";
      label = constructor.name;
    }
    // Its own enumerable keys, Symbol keys included, drawn as [Symbol(id)] (#48).
    var keys = Object.keys(obj);
    var symbols = Object.getOwnPropertySymbols(obj);
    for (var sk = 0; sk < symbols.length; sk++) if (Object.prototype.propertyIsEnumerable.call(obj, symbols[sk])) keys.push(symbols[sk]);
    for (var k = 0; k < keys.length && k < 50; k++) {
      var ki = keys[k];
      var keyText = typeof ki === "symbol" ? "[" + ki.toString() + "]" : ki;
      // Skip accessor properties (get/set). Invoking the getter would run
      // user code, which would re-enter serialization via __pushFrame__ /
      // __capture__ and recurse without bound (the getter accesses \`this\`,
      // which is the object being serialized).
      var desc;
      try { desc = Object.getOwnPropertyDescriptor(obj, ki); } catch(e) {}
      if (desc && (desc.get || desc.set)) {
        var label = desc.get && desc.set ? "<accessor>" : desc.get ? "<getter>" : "<setter>";
        properties.push({ key: keyText, value: { type: "string", value: label } });
        continue;
      }
      try {
        properties.push({
          key: keyText,
          value: __serializeValue__(obj[ki], heapObjects, visited)
        });
      } catch(e) {
        properties.push({
          key: keyText,
          value: { type: "string", value: "[error reading property]" }
        });
      }
    }
  }

  var heapObj = {
    id: heapId,
    objectType: objectType,
    label: label,
    properties: properties
  };
  __heapRegistry__[heapId] = heapObj;
  return heapObj;
}

// ── Heap collection ──

// Walk all frames in a stack snapshot and collect every referenced
// HeapObject (transitively through object properties) from the registry.
function __collectHeap__(stackSnapshot) {
  var seen = {};
  var result = [];
  function visit(val) {
    if (!val || val.type !== "ref") return;
    if (seen[val.heapId]) return;
    seen[val.heapId] = true;
    var obj = __heapRegistry__[val.heapId];
    if (obj) {
      result.push(obj);
      for (var p = 0; p < obj.properties.length; p++) {
        visit(obj.properties[p].value);
        if (obj.properties[p].keyValue) visit(obj.properties[p].keyValue);
      }
    }
  }
  for (var f = 0; f < stackSnapshot.length; f++) {
    var vars = stackSnapshot[f].variables;
    if (vars && vars.length) {
      for (var v = 0; v < vars.length; v++) {
        visit(vars[v].value);
      }
    }
    var cvars = stackSnapshot[f].closureVars;
    if (cvars && cvars.length) {
      for (var cv = 0; cv < cvars.length; cv++) {
        visit(cvars[cv].value);
      }
    }
    if (stackSnapshot[f].thisArg) visit(stackSnapshot[f].thisArg);
  }
  return result;
}

// ── Condition tracking ──

// A test's step (#24): it refreshes the variables the test sees, as a capture
// does, so the step shows the current state with the test's result.
// blockFrame ({ name, vars }) is a for loop's let/const variables, whose frame
// is pushed in the loop body: the step shows them in a frame of their own.
function __condition__(value, line, expression, vars, parentVarNames, closureVars, blockFrame) {
  if (__snapshots__.length >= __MAX_SNAPSHOTS) { __stopped__ = true; throw __STOP__; }

  var columnRange = null;
  if (Array.isArray(line)) {
    columnRange = { startCol: line[1], endCol: line[2] };
    line = line[0];
  }

  // Re-serialize this context from live references
  var heapObjects = [];
  var visited = new Set();
  if (vars) __updateFrames__(vars, parentVarNames, closureVars, heapObjects, visited);
  __refreshGlobals__(heapObjects, visited);
  for (var ti = 0; ti < __callStack__.length; ti++) {
    if (__callStack__[ti].__rawThis !== undefined) {
      try {
        __callStack__[ti].thisArg = __serializeValue__(__callStack__[ti].__rawThis, heapObjects, visited);
      } catch(e) {}
    }
  }

  // Build a snapshot at the condition line using the current call stack state
  var stackSnapshot = [];
  for (var c = 0; c < __callStack__.length; c++) {
    var fr = __callStack__[c];
    var ent = {
      name: fr.name,
      variables: fr.variables || []
    };
    if (fr.isBlockScope) ent.isBlockScope = true;
    if (fr.closureVars && fr.closureVars.length > 0) ent.closureVars = fr.closureVars;
    if (fr.thisArg) ent.thisArg = fr.thisArg;
    stackSnapshot.push(ent);
  }
  if (blockFrame) {
    stackSnapshot.push({ name: blockFrame.name, variables: __serializeVars__(blockFrame.vars, heapObjects, visited), isBlockScope: true });
  }

  var snap = __outputOf__({
    step: __snapshots__.length,
    line: line,
    callStack: stackSnapshot,
    heap: __collectHeap__(stackSnapshot),
    condition: { expression: expression, result: !!value, line: line }
  });
  if (columnRange) snap.columnRange = columnRange;
  __snapshots__.push(snap);

  return value;
}

// ── Capture ──

// Each variable of a { name: value } object, serialized, except the runtime's own (__x__).
function __serializeVars__(vars, heapObjects, visited) {
  var entries = [];
  var keys = Object.keys(vars);
  for (var i = 0; i < keys.length; i++) {
    var name = keys[i];
    if (name.startsWith("__") && name.endsWith("__")) continue;
    try {
      entries.push({ name: name, value: __serializeValue__(vars[name], heapObjects, visited) });
    } catch(e) {
      entries.push({ name: name, value: { type: "string", value: "[error]" } });
    }
  }
  return entries;
}

// The step before a statement runs (#24). As CPython reports a line once while
// a frame stays on it, a statement on the line its frame last stepped at
// (\`a(); b();\`, \`if (n < 2) return n;\`) takes no step of its own; its
// variables still refresh the frames for the next step. The program's final
// capture (isFinal) is always a step.
function __capture__(line, vars, parentVarNames, closureVars, isFinal) {
  if (__snapshots__.length >= __MAX_SNAPSHOTS) { __stopped__ = true; throw __STOP__; }

  var columnRange = null;
  if (Array.isArray(line)) {
    columnRange = { startCol: line[1], endCol: line[2] };
    line = line[0];
  }

  var heapObjects = [];
  var visited = new Set();
  __updateFrames__(vars, parentVarNames, closureVars, heapObjects, visited);
  __refreshGlobals__(heapObjects, visited);

  var last = __snapshots__[__snapshots__.length - 1];
  var loops = typeof __loopCount === "number" ? __loopCount : 0;
  var sameDepth = last && last.callStack.length === __callStack__.length;
  if (isFinal) {
    // The final state marks the line that ran last, if the program's frame took that step.
    if (sameDepth) line = last.line;
  } else if (sameDepth && last.line === line && (last.condition || (!__framePushed__ && loops === __stepLoopCount__))) {
    // (A statement on its test's line, as in \`while (a < 3) a++;\`, is part of the test's step.)
    return;
  }
  __framePushed__ = false;
  __stepLoopCount__ = loops;

  // Re-serialize this context from live references so mutations are visible
  for (var ti = 0; ti < __callStack__.length; ti++) {
    if (__callStack__[ti].__rawThis !== undefined) {
      try {
        __callStack__[ti].thisArg = __serializeValue__(__callStack__[ti].__rawThis, heapObjects, visited);
      } catch(e) {}
    }
  }

  // Build snapshot of the full call stack
  var stackSnapshot = [];
  for (var j = 0; j < __callStack__.length; j++) {
    var frame = __callStack__[j];
    var entry = {
      name: frame.name,
      variables: frame.variables || []
    };
    if (frame.isBlockScope) entry.isBlockScope = true;
    if (frame.closureVars && frame.closureVars.length > 0) entry.closureVars = frame.closureVars;
    if (frame.thisArg) entry.thisArg = frame.thisArg;
    stackSnapshot.push(entry);
  }

  var snap = __outputOf__({
    step: __snapshots__.length,
    line: line,
    callStack: stackSnapshot,
    heap: __collectHeap__(stackSnapshot)
  });
  if (columnRange) snap.columnRange = columnRange;
  __snapshots__.push(snap);
}

// Set the frames' variables from a capture's: the top frame's, or, inside a
// block scope, the block frame's and its parent's (parentVarNames), and the
// closed-over variables of the nearest function frame.
function __updateFrames__(vars, parentVarNames, closureVars, heapObjects, visited) {
  // Update closure vars on the nearest function (non-block-scope) frame
  if (closureVars) {
    var funcFrame = null;
    for (var fi = __callStack__.length - 1; fi >= 0; fi--) {
      if (!__callStack__[fi].isBlockScope) {
        funcFrame = __callStack__[fi];
        break;
      }
    }
    if (funcFrame) {
      var closureEntries = [];
      var cKeys = Object.keys(closureVars);
      for (var ci = 0; ci < cKeys.length; ci++) {
        var cvName = cKeys[ci];
        if (cvName.startsWith("__") && cvName.endsWith("__")) continue;
        try {
          closureEntries.push({
            name: cvName,
            value: __serializeValue__(closureVars[cvName], heapObjects, visited)
          });
        } catch(e) {
          closureEntries.push({
            name: cvName,
            value: { type: "string", value: "[error]" }
          });
        }
      }
      funcFrame.closureVars = closureEntries;
    }
  }

  if (parentVarNames && __callStack__.length >= 2) {
    // Block-scope mode: distribute vars between the top (block) frame
    // and the parent frame beneath it.
    var parentSet = {};
    for (var p = 0; p < parentVarNames.length; p++) {
      parentSet[parentVarNames[p]] = true;
    }
    var blockVars = [];
    var parentVars = [];
    var keys = Object.keys(vars);
    for (var i = 0; i < keys.length; i++) {
      var vName = keys[i];
      if (vName.startsWith("__") && vName.endsWith("__")) continue;
      try {
        var entry = { name: vName, value: __serializeValue__(vars[vName], heapObjects, visited) };
      } catch(e) {
        var entry = { name: vName, value: { type: "string", value: "[error]" } };
      }
      if (parentSet[vName]) {
        parentVars.push(entry);
      } else {
        blockVars.push(entry);
      }
    }
    __callStack__[__callStack__.length - 1].variables = blockVars;
    __callStack__[__callStack__.length - 2].variables = parentVars;
  } else {
    // Normal mode: all vars go to the top frame
    var topFrame = __callStack__[__callStack__.length - 1];
    if (topFrame) {
      var serializedVars = [];
      var varKeys = Object.keys(vars);
      for (var i2 = 0; i2 < varKeys.length; i2++) {
        var name = varKeys[i2];
        if (name.startsWith("__") && name.endsWith("__")) continue;
        try {
          serializedVars.push({
            name: name,
            value: __serializeValue__(vars[name], heapObjects, visited)
          });
        } catch(e) {
          serializedVars.push({
            name: name,
            value: { type: "string", value: "[error]" }
          });
        }
      }
      topFrame.variables = serializedVars;
    }
  }
}

// ── Frame management ──

function __pushFrame__(name, params, isBlockScope, closureVars, thisVal) {
  var frame = { name: name, variables: [], isBlockScope: !!isBlockScope };
  // Serialize params as initial frame variables
  var heapObjects = [];
  var visited = new Set();
  var keys = Object.keys(params);
  for (var i = 0; i < keys.length; i++) {
    try {
      frame.variables.push({
        name: keys[i],
        value: __serializeValue__(params[keys[i]], heapObjects, visited)
      });
    } catch(e) {
      frame.variables.push({
        name: keys[i],
        value: { type: "string", value: "[error]" }
      });
    }
  }
  // Serialize closure variables from enclosing scope(s)
  if (closureVars) {
    var closureEntries = [];
    var cKeys = Object.keys(closureVars);
    for (var ci = 0; ci < cKeys.length; ci++) {
      try {
        closureEntries.push({
          name: cKeys[ci],
          value: __serializeValue__(closureVars[cKeys[ci]], heapObjects, visited)
        });
      } catch(e) {
        closureEntries.push({
          name: cKeys[ci],
          value: { type: "string", value: "[error]" }
        });
      }
    }
    if (closureEntries.length > 0) frame.closureVars = closureEntries;
  }
  // Store this context (skip global object and undefined)
  if (thisVal !== undefined && thisVal !== self) {
    frame.__rawThis = thisVal;
    try {
      frame.thisArg = __serializeValue__(thisVal, heapObjects, visited);
    } catch(e) {}
  }
  // A function entered on an empty stack after the script ended was called by the event loop.
  if (__scriptDone__ && __callStack__.length === 1 && !isBlockScope && !__nextLabel__) __nextLabel__ = "promise callback";
  __callStack__.push(frame);
  __framePushed__ = true;
  return frame;
}

// Take a frame, and every frame above it, off the stack, wherever it is now
// (#44). Each function's body and each loop with a block frame ends in a
// finally calling this, so the frame goes however the code is left: a return
// (already popped: nothing to do), break, continue, a labeled break, a throw.
// A suspended generator or async function that ends (a rejected await nothing
// caught, a generator's return()) drops its saved frames.
function __leave__(frame) {
  if (!frame) return;
  if (frame.__saved) { frame.__saved = null; return; }
  var at = __callStack__.lastIndexOf(frame);
  if (at > 0) __callStack__.length = at;
}

// At a yield or await, a generator's or async function's frames (its own and
// its loops') leave the stack, as a debugger shows them, and come back when it
// resumes, on top of whatever is running then (#44).
function __suspend__(frame, value) {
  var at = __callStack__.lastIndexOf(frame);
  if (at > 0) frame.__saved = __callStack__.splice(at);
  return value;
}
function __resume__(frame, value) {
  var saved = frame.__saved;
  if (saved) {
    if (__scriptDone__ && __callStack__.length === 1 && !__nextLabel__) __nextLabel__ = "resumed after await";
    frame.__saved = null;
    for (var i = 0; i < saved.length; i++) __callStack__.push(saved[i]);
    __framePushed__ = true;
  }
  return value;
}

function __popFrame__(retVal, line) {
  // When called from a wrapped \`return\` (line is provided), the user is
  // exiting the enclosing function. Any block-scope frames pushed by
  // for/while/do-while loops sitting between the return and the function
  // frame must also be popped — otherwise they leak across subsequent
  // visualizations.
  if (line !== undefined) {
    while (__callStack__.length > 1 && __callStack__[__callStack__.length - 1].isBlockScope) {
      __callStack__.pop();
    }
  }
  if (__callStack__.length > 1) {
    // Emit a snapshot showing the return value before popping the frame
    if (line !== undefined && __snapshots__.length < __MAX_SNAPSHOTS) {
      var heapObjects = [];
      var visited = new Set();
      var topFrame = __callStack__[__callStack__.length - 1];

      __refreshGlobals__(heapObjects, visited);
      // Copy existing variables and append the return value
      var retVars = (topFrame.variables || []).slice();
      retVars.push({
        name: "return \u21b5",
        value: __serializeValue__(retVal, heapObjects, visited)
      });

      // Re-serialize this context from live references
      for (var ti = 0; ti < __callStack__.length; ti++) {
        if (__callStack__[ti].__rawThis !== undefined) {
          try {
            __callStack__[ti].thisArg = __serializeValue__(__callStack__[ti].__rawThis, heapObjects, visited);
          } catch(e) {}
        }
      }

      var stackSnapshot = [];
      for (var j = 0; j < __callStack__.length; j++) {
        var frame = __callStack__[j];
        var entry2 = {
          name: frame.name,
          variables: j === __callStack__.length - 1 ? retVars : (frame.variables || [])
        };
        if (frame.isBlockScope) entry2.isBlockScope = true;
        if (frame.closureVars && frame.closureVars.length > 0) entry2.closureVars = frame.closureVars;
        if (frame.thisArg) entry2.thisArg = frame.thisArg;
        stackSnapshot.push(entry2);
      }
      __snapshots__.push(__outputOf__({
        step: __snapshots__.length,
        line: line,
        callStack: stackSnapshot,
        heap: __collectHeap__(stackSnapshot)
      }));
    }

    __callStack__.pop();
  }
  return retVal;
}

// ── The end of the script, and its callbacks (#45) ──

// The script's last step: the state when its synchronous code has run (all
// of it, if nothing is left to run). The program's timers and promise
// callbacks run after it, each step that starts one labeled.
function __endScript__(line) {
  if (line > 0) __capture__(line, typeof __globals__ === "function" ? __globals__() : {}, null, null, true);
  __scriptDone__ = true;
  __scriptEndStep__ = __snapshots__.length;
}

// Timers run by virtual time, so a 2-second timeout takes no time: in order
// of when they are due, then of when they were set, a delay below 1 ms being 1
// ms (as in Node). Each callback runs after the microtasks before it.
var __now__ = 0;
var __timers__ = [];
var __timerId__ = 0;
var __timerSeq__ = 0;
function __addTimer__(fn, ms, args, repeat) {
  ms = Number(ms);
  if (!(ms >= 1 && ms <= 2147483647)) ms = 1;
  var t = { id: ++__timerId__, fn: fn, args: args, due: __now__ + Math.floor(ms), seq: ++__timerSeq__, interval: repeat ? Math.floor(ms) : null };
  __timers__.push(t);
  return t.id;
}
function __clearTimer__(id) {
  for (var i = 0; i < __timers__.length; i++) if (__timers__[i].id === id) { __timers__.splice(i, 1); return; }
}
function __nextTimer__() {
  var best = null;
  for (var i = 0; i < __timers__.length; i++) {
    var t = __timers__[i];
    if (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq)) best = t;
  }
  return best;
}
var __hostSetTimeout__ = typeof setTimeout === "function" ? setTimeout : null;
(function () {
  var define = function (name, fn) { Object.defineProperty(self, name, { value: fn, writable: true, configurable: true, enumerable: false }); };
  define("setTimeout", function setTimeout(fn) { return __addTimer__(fn, arguments[1], Array.prototype.slice.call(arguments, 2), false); });
  define("setInterval", function setInterval(fn) { return __addTimer__(fn, arguments[1], Array.prototype.slice.call(arguments, 2), true); });
  define("clearTimeout", function clearTimeout(id) { __clearTimer__(id); });
  define("clearInterval", function clearInterval(id) { __clearTimer__(id); });
  if (typeof queueMicrotask === "function") {
    var hostQueueMicrotask = queueMicrotask;
    define("queueMicrotask", function queueMicrotask(fn) {
      hostQueueMicrotask(function () {
        __nextLabel__ = "queueMicrotask callback";
        try { fn(); } catch (e) { if (!__callbackError__) __callbackError__ = { error: e, kind: "callback" }; }
        __nextLabel__ = null;
      });
    });
  }
})();

// The first rejection nothing handled, and the first exception a callback didn't catch: each ends the run, as in Node.
var __unhandled__ = null;
var __callbackError__ = null;
if (typeof self.addEventListener === "function") {
  self.addEventListener("unhandledrejection", function (e) {
    if (!__unhandled__) __unhandled__ = { reason: e.reason };
    if (e.preventDefault) e.preventDefault();
  });
}

// Run a function in a new task, once the current one's microtasks have run.
var __hop__ = (function () {
  if (typeof MessageChannel === "function") {
    var channel = new MessageChannel();
    var queue = [];
    channel.port1.onmessage = function () { queue.shift()(); };
    return function (fn) { queue.push(fn); channel.port2.postMessage(null); };
  }
  return __hostSetTimeout__ ? function (fn) { __hostSetTimeout__(fn, 0); } : null;
})();

// After the script: let its microtasks run, then each timer that is due, and
// reply (done) when nothing is left, at the first uncaught exception or
// unhandled rejection, at the step cap, or at the time budget.
function __eventLoop__(done) {
  var started = Date.now();
  var finish = function (err, kind) { done(arguments.length === 0 ? __runResult__() : __runResult__(err, kind)); };
  if (!__hop__) { finish(); return; }
  var check = function () {
    if (__stopped__) return finish(__STOP__);
    if (typeof __loopCount === "number" && typeof __MAX_LOOPS === "number" && __loopCount > __MAX_LOOPS) {
      return finish(new Error("Infinite loop detected (exceeded " + __MAX_LOOPS + " iterations)"));
    }
    if (__callbackError__) return finish(__callbackError__.error, __callbackError__.kind);
    if (__unhandled__) return finish(__unhandled__.reason, "promise");
    if (Date.now() - started > __TIME_BUDGET_MS__) return finish(__TIME_LIMIT__);
    var t = __nextTimer__();
    if (!t) { __finalStep__(); return finish(); }
    __now__ = t.due;
    if (t.interval !== null) { t.due = __now__ + t.interval; t.seq = ++__timerSeq__; }
    else __clearTimer__(t.id);
    __nextLabel__ = t.interval !== null ? "setInterval callback" : "setTimeout callback";
    try {
      if (typeof t.fn === "function") t.fn.apply(undefined, t.args);
    } catch (e) {
      __nextLabel__ = null;
      return finish(e, "callback");
    }
    __nextLabel__ = null;
    tick();
  };
  // Two hops: one for the microtasks, one for the browser's unhandledrejection task.
  var tick = function () { __hop__(function () { __hop__(check); }); };
  tick();
}
self.__eventLoop__ = __eventLoop__;

// When callbacks ran after the script, the last step is the state after them all.
function __finalStep__() {
  if (__snapshots__.length <= __scriptEndStep__ || typeof __globals__ !== "function") return;
  var last = __snapshots__[__snapshots__.length - 1];
  try { __capture__(last.line, __globals__(), null, null, true); } catch (e) { /* the step cap */ }
}

// ── What the program sees of its instrumentation (#47) ──

// Each function's own text, by its instrumented text's key (the instrumenter's
// sourceKey; the program's first lines call these two).
var __sourceTextMap__ = new Map();
function __sourceTexts__(texts) {
  for (var key in texts) __sourceTextMap__.set(key, texts[key]);
}
function __sourceKey__(text) {
  var h1 = 0xdeadbeef;
  var h2 = 0x41c6ce57;
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return text.length + ":" + (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

// Function.prototype.toString gives a function's own text, not its
// instrumented one, and the runtime's functions the program can reach
// (setTimeout, console.log, toString itself) look like the browser's own.
var __looksNative__ = new WeakSet();
var __nativeToString__ = Function.prototype.toString;
(function () {
  var toString = function toString() {
    if (__looksNative__.has(this)) return "function " + (this.name || "") + "() { [native code] }";
    var text = __nativeToString__.call(this);
    var original = __sourceTextMap__.get(__sourceKey__(text));
    return original === undefined ? text : original;
  };
  __looksNative__.add(toString);
  Object.defineProperty(Function.prototype, "toString", { value: toString, writable: true, configurable: true, enumerable: false });
  ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "queueMicrotask", "structuredClone"].forEach(function (name) {
    if (typeof self[name] === "function") __looksNative__.add(self[name]);
  });
})();

// A DataCloneError quotes the function it couldn't clone: with its own text.
if (typeof structuredClone === "function") {
  (function () {
    var hostClone = structuredClone;
    var firstFunction = function (value, seen) {
      if (typeof value === "function") return value;
      if (value === null || typeof value !== "object" || seen.has(value)) return null;
      seen.add(value);
      var parts = value instanceof Map ? Array.from(value.keys()).concat(Array.from(value.values())) : value instanceof Set ? Array.from(value) : Object.keys(value).map(function (k) { return value[k]; });
      for (var i = 0; i < parts.length; i++) { var f = firstFunction(parts[i], seen); if (f) return f; }
      return null;
    };
    var clone = function structuredClone(value) {
      try {
        return hostClone.apply(this, arguments);
      } catch (e) {
        var fn = e && e.name === "DataCloneError" ? firstFunction(value, new Set()) : null;
        if (fn) {
          try {
            // (The browser may shorten the text it quotes, so the quote is found by its start.)
            var message = String(e.message);
            var raw = __nativeToString__.call(fn);
            var own = Function.prototype.toString.call(fn);
            var start = message.indexOf(raw.slice(0, 20));
            var end = message.lastIndexOf(" could not be cloned");
            if (raw !== own && start !== -1 && end > start) {
              Object.defineProperty(e, "message", { value: message.slice(0, start) + own + message.slice(end), writable: true, configurable: true, enumerable: false });
            }
          } catch (ignored) { /* leave the message */ }
        }
        throw e;
      }
    };
    Object.defineProperty(self, "structuredClone", { value: clone, writable: true, configurable: true, enumerable: false });
    __looksNative__.add(clone);
  })();
}

// The program's line for each line of the instrumented code, and where the
// instrumented code starts in the worker's script: a stack trace names the
// program's functions and lines (at add (main.js:3)), and leaves out the
// runtime's and the worker's frames. V8's Error.prepareStackTrace; other
// browsers keep their own stacks.
var __programLineMap__ = null;
var __programSite__ = null;
function __programLines__(map) {
  __programLineMap__ = map;
  if (typeof Error.captureStackTrace !== "function") return;
  var previous = Error.prepareStackTrace;
  var holder = {};
  Error.prepareStackTrace = function (e, sites) { return sites; };
  // (V8 makes the stack when it is first read: read it before putting prepareStackTrace back.)
  var sites;
  try { Error.captureStackTrace(holder, __programLines__); sites = holder.stack; } finally { Error.prepareStackTrace = previous; }
  if (!Array.isArray(sites) || !sites[0] || typeof sites[0].getLineNumber !== "function") return;
  __programSite__ = { base: sites[0].getLineNumber() - 1, file: sites[0].getFileName(), origin: sites[0].getEvalOrigin() };
  Error.prepareStackTrace = __prepareStackTrace__;
}
function __prepareStackTrace__(error, sites) {
  var header;
  try { header = Error.prototype.toString.call(error); } catch (e) { header = "Error"; }
  var out = header;
  for (var i = 0; i < sites.length; i++) {
    var site = sites[i];
    if (site.getFileName() !== __programSite__.file || site.getEvalOrigin() !== __programSite__.origin) continue;
    var line = __programLineMap__[site.getLineNumber() - __programSite__.base];
    if (!line) continue;
    var name = site.getFunctionName();
    // The program's top level runs as eval code: no function name there.
    if (name === "eval" && site.isEval()) name = null;
    out +="\\n    at " + (name ? (site.isConstructor() ? "new " : "") + name + " (main.js:" + line + ")" : "main.js:" + line);
  }
  return out;
}

// ── Console ──

// The program's console prints as Node does (inspect.ts). Each call's text
// becomes lines on its stream: log, info, debug, dir, table, count, group and
// time write to stdout; warn, error, trace and assert to stderr.
${CONSOLE_SOURCE}
function __write__(stream, text) {
  var lines = String(text).split("\\n");
  for (var i = 0; i < lines.length; i++) {
    __console__.push({ text: lines[i], stream: stream });
    if (stream === "stdout") __stdout__.push(lines[i]);
  }
  if (stream === "stderr") __stderrUsed__ = true;
}
Object.defineProperty(self, "console", { value: __makeConsole__(__write__), writable: true, configurable: true, enumerable: false });
Object.keys(console).forEach(function (name) { if (typeof console[name] === "function") __looksNative__.add(console[name]); });
`;
}
