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
  } else if (err instanceof Error && err.message.indexOf("Infinite loop detected") === 0) {
    msg.error = { kind: "limit", message: err.message };
  } else {
    var text = err instanceof Error ? err.name + ": " + err.message : String(err);
    msg.error = { kind: "exception", message: text, stderr: "Uncaught " + text };
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
  return snap;
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
  if (t === "number" || t === "boolean") return { type: t, value: val };
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
      properties.push({
        key: String(i),
        value: __serializeValue__(obj[i], heapObjects, visited)
      });
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
    objectType = "error";
    label = obj.constructor.name;
    properties.push({ key: "message", value: { type: "string", value: obj.message } });
    if (obj.stack) {
      properties.push({ key: "stack", value: { type: "string", value: obj.stack.slice(0, 200) } });
    }
  } else if (obj instanceof Map) {
    objectType = "map";
    var idx = 0;
    obj.forEach(function(v, k) {
      if (idx < 50) {
        properties.push({
          key: String(k),
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
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length && k < 50; k++) {
      var ki = keys[k];
      // Skip accessor properties (get/set). Invoking the getter would run
      // user code, which would re-enter serialization via __pushFrame__ /
      // __capture__ and recurse without bound (the getter accesses \`this\`,
      // which is the object being serialized).
      var desc;
      try { desc = Object.getOwnPropertyDescriptor(obj, ki); } catch(e) {}
      if (desc && (desc.get || desc.set)) {
        var label = desc.get && desc.set ? "<accessor>" : desc.get ? "<getter>" : "<setter>";
        properties.push({ key: ki, value: { type: "string", value: label } });
        continue;
      }
      try {
        properties.push({
          key: ki,
          value: __serializeValue__(obj[ki], heapObjects, visited)
        });
      } catch(e) {
        properties.push({
          key: ki,
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
  if (__snapshots__.length >= __MAX_SNAPSHOTS) throw __STOP__;

  var columnRange = null;
  if (Array.isArray(line)) {
    columnRange = { startCol: line[1], endCol: line[2] };
    line = line[0];
  }

  // Re-serialize this context from live references
  var heapObjects = [];
  var visited = new Set();
  if (vars) __updateFrames__(vars, parentVarNames, closureVars, heapObjects, visited);
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
  if (__snapshots__.length >= __MAX_SNAPSHOTS) throw __STOP__;

  var columnRange = null;
  if (Array.isArray(line)) {
    columnRange = { startCol: line[1], endCol: line[2] };
    line = line[0];
  }

  var heapObjects = [];
  var visited = new Set();
  __updateFrames__(vars, parentVarNames, closureVars, heapObjects, visited);

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
`;
}
