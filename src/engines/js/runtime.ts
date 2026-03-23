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
 *  - __logOutput__(level, ...args) — capture console output
 *  - Serialization logic for primitives, objects, arrays, functions
 */

/**
 * Returns the runtime preamble as a string of JavaScript to be
 * evaluated in the worker before the instrumented user code.
 */
export function getRuntimeCode(): string {
  // This is a self-contained JS string — no imports, no TypeScript.
  return `
// ══════════════════════════════════════
// JSTutor Runtime Helpers
// ══════════════════════════════════════

var __snapshots__ = [];
var __stdout__ = [];
var __callStack__ = [{ name: "Global", variables: {} }];
var __heapMap__ = new Map();  // object identity → heap ID
var __heapRegistry__ = {};   // heapId → most recent serialized HeapObject
var __heapCounter__ = 0;
var __MAX_SNAPSHOTS = 5000;

// Expose snapshots on the global scope so the worker can read them
self.__snapshots__ = __snapshots__;

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
      try {
        properties.push({
          key: keys[k],
          value: __serializeValue__(obj[keys[k]], heapObjects, visited)
        });
      } catch(e) {
        properties.push({
          key: keys[k],
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

function __condition__(value, line, expression) {
  if (__snapshots__.length >= __MAX_SNAPSHOTS) return value;

  var columnRange = null;
  if (Array.isArray(line)) {
    columnRange = { startCol: line[1], endCol: line[2] };
    line = line[0];
  }

  // Re-serialize this context from live references
  var heapObjects = [];
  var visited = new Set();
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

  var snap = {
    step: __snapshots__.length,
    line: line,
    callStack: stackSnapshot,
    heap: __collectHeap__(stackSnapshot),
    stdout: __stdout__.slice(),
    condition: { expression: expression, result: !!value, line: line }
  };
  if (columnRange) snap.columnRange = columnRange;
  __snapshots__.push(snap);

  return value;
}

// ── Capture ──

function __capture__(line, vars, parentVarNames, closureVars) {
  if (__snapshots__.length >= __MAX_SNAPSHOTS) return;

  var columnRange = null;
  if (Array.isArray(line)) {
    columnRange = { startCol: line[1], endCol: line[2] };
    line = line[0];
  }

  var heapObjects = [];
  var visited = new Set();

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

  var snap = {
    step: __snapshots__.length,
    line: line,
    callStack: stackSnapshot,
    heap: __collectHeap__(stackSnapshot),
    stdout: __stdout__.slice()
  };
  if (columnRange) snap.columnRange = columnRange;
  __snapshots__.push(snap);
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
}

function __popFrame__(retVal, line) {
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
      __snapshots__.push({
        step: __snapshots__.length,
        line: line,
        callStack: stackSnapshot,
        heap: __collectHeap__(stackSnapshot),
        stdout: __stdout__.slice()
      });
    }

    __callStack__.pop();
  }
  return retVal;
}

// ── Console capture ──

var __origConsole__ = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

console.log = function() {
  var args = Array.prototype.slice.call(arguments);
  var text = args.map(function(a) {
    if (typeof a === "object" && a !== null) {
      try { return JSON.stringify(a); } catch(e) { return String(a); }
    }
    return String(a);
  }).join(" ");
  __stdout__.push(text);
  __origConsole__.log.apply(null, arguments);
};

console.warn = function() {
  var args = Array.prototype.slice.call(arguments);
  var text = "[warn] " + args.map(String).join(" ");
  __stdout__.push(text);
  __origConsole__.warn.apply(null, arguments);
};

console.error = function() {
  var args = Array.prototype.slice.call(arguments);
  var text = "[error] " + args.map(String).join(" ");
  __stdout__.push(text);
  __origConsole__.error.apply(null, arguments);
};
`;
}
