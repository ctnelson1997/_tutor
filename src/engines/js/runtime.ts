/**
 * Runtime Helpers
 *
 * The JavaScript the worker runs before the program: the functions the
 * instrumented program calls, which record its steps.
 *  - __capture__(line, vars) — serialize state into a snapshot
 *  - __pushFrame__(name, params) — push a call stack frame
 *  - __popFrame__() — pop a call stack frame
 *  - the program's console (inspect.ts: Node's format, #43), writing
 *    stdout and stderr lines that each snapshot carries
 *  - Serialization logic for primitives, objects, arrays, functions
 *
 * It runs in a closure of its own (#87): its state is local to it, its
 * functions are non-enumerable properties of the global object (so
 * `console.log(this)` shows the program's globals only), and every built-in
 * it uses is the browser's own, taken when it loads, before the program runs
 * (primordials.ts). So a program declaring `class Date`, `function Map` or
 * `var self`, or replacing `Array.prototype.push`, changes nothing it does,
 * and drawing a step runs none of the program's code (#88): properties are
 * read by their descriptors, getters never called, proxies drawn as their
 * targets. The program itself runs as a script of its own (executor.ts).
 */

import { CONSOLE_SOURCE } from './inspect';
import { PRIMORDIALS_SOURCE } from './primordials';
import { SHARER_SOURCE } from './sharer';

/**
 * The runtime: an expression whose value is `{ runResult, eventLoop }`, the
 * two functions the worker calls once the program's script has run.
 */
export function getRuntimeCode(): string {
  // A self-contained JS string — no imports, no TypeScript, no backticks or dollar-brace.
  return String.raw`(function () {
'use strict';
${PRIMORDIALS_SOURCE}

// ── Built-ins, as they were before the program ran (#87, #88) ──

var ObjectKeys = Object.keys, ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
var ObjectGetOwnPropertyNames = Object.getOwnPropertyNames, ObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
var ObjectGetPrototypeOf = Object.getPrototypeOf, ObjectDefineProperty = Object.defineProperty, ObjectCreate = Object.create;
var ObjectAssign = Object.assign, ArrayIsArray = Array.isArray, ReflectConstruct = Reflect.construct, ReflectGet = Reflect.get;
var isEnumerable = uncurryThis(Object.prototype.propertyIsEnumerable);
var objectToString = uncurryThis(Object.prototype.toString);
var functionToString = uncurryThis(Function.prototype.toString);
var errorToString = uncurryThis(Error.prototype.toString);
var StringPrototypeLastIndexOf = uncurryThis(String.prototype.lastIndexOf);
var symbolToString = uncurryThis(Symbol.prototype.toString);
var bigintToString = typeof BigInt === 'function' ? uncurryThis(BigInt.prototype.toString) : null;
var getter = function (proto, key) { var d = ObjectGetOwnPropertyDescriptor(proto, key); return d && d.get ? uncurryThis(d.get) : null; };
var DateNow = Date.now, dateGetTime = uncurryThis(Date.prototype.getTime);
var dateToISOString = uncurryThis(Date.prototype.toISOString), dateToString = uncurryThis(Date.prototype.toString);
var mapSize = getter(Map.prototype, 'size'), setSize = getter(Set.prototype, 'size');
var mapEntries = uncurryThis(Map.prototype.entries), setValues = uncurryThis(Set.prototype.values);
var mapIteratorNext = uncurryThis(ObjectGetPrototypeOf(new Map().entries()).next);
var setIteratorNext = uncurryThis(ObjectGetPrototypeOf(new Set().values()).next);
var regexpSource = getter(RegExp.prototype, 'source');
var REGEXP_FLAGS = [['hasIndices', 'd'], ['global', 'g'], ['ignoreCase', 'i'], ['multiline', 'm'], ['dotAll', 's'], ['unicode', 'u'], ['unicodeSets', 'v'], ['sticky', 'y']];
for (var rf = 0; rf < REGEXP_FLAGS.length; rf++) REGEXP_FLAGS[rf][2] = getter(RegExp.prototype, REGEXP_FLAGS[rf][0]);
var TypedArrayPrototype = ObjectGetPrototypeOf(Uint8Array.prototype);
var typedArrayTag = getter(TypedArrayPrototype, Symbol.toStringTag), typedArrayLength = getter(TypedArrayPrototype, 'length');
var DatePrototype = Date.prototype, RegExpPrototype = RegExp.prototype, ErrorPrototype = Error.prototype;
var MapPrototype = Map.prototype, SetPrototype = Set.prototype;
var errorIsError = typeof Error.isError === 'function' ? Error.isError : null;
var HostPromise = Promise, hostThen = Promise.prototype.then, promiseThen = uncurryThis(hostThen);
var HostProxy = Proxy, HostDate = Date;
var HostMessageChannel = global.MessageChannel, hostSetTimeout = global.setTimeout, hostQueueMicrotask = global.queueMicrotask;
var hostStructuredClone = global.structuredClone, hostFetch = global.fetch, HostResponse = global.Response;
var hostAddEventListener = global.addEventListener;
var hostPerformance = global.performance;
var perfNow = hostPerformance && typeof hostPerformance.now === 'function' ? uncurryThis(hostPerformance.now) : null;

// A non-enumerable property, as the browser's own globals are.
var define = function (target, name, value) {
  ObjectDefineProperty(target, name, { value: value, writable: true, configurable: true, enumerable: false });
};

// ── State ──

var snapshots = [];
// The console, by line: stdout's lines, and every line with its stream (the
// snapshot's console once the program has written to stderr).
var stdout = [];
var consoleLines = [];
var stderrUsed = false;
var outputChars = 0;
var callStack = [{ name: 'Global', variables: [] }];
var heapIds = new SafeWeakMap();      // object → heap id
var heapRegistry = ObjectCreate(null); // heap id → its latest drawing
var heapCounter = 0;
// Since the last step: was a frame pushed (a call, a loop's block), and how
// many loop iterations had begun. Either makes the next capture a step even
// on the line the frame last stepped at, as a call or a loop's backward jump
// is in CPython.
var framePushed = false;
var iterations = 0;
var stepIterations = 0;
// Loop iterations since the last step: a loop that takes no step (an empty
// body) is only stopped by this and the time budget (#91).
var sinceStep = 0;
var MAX_SNAPSHOTS = 5000;
var MAX_SILENT_ITERATIONS = 10000000;
var MAX_CONSOLE_LINES = 10000;
var MAX_CONSOLE_CHARS = 1000000;
// The time budget for the whole run, script and callbacks, before the worker's 10-second kill (#91).
var TIME_BUDGET_MS = 8500;
var runStart = DateNow();
// Why the run stopped early ('steps', 'time', 'loop', 'output'): once set, every
// step the program tries throws STOP again, so catching it doesn't let it run on.
var STOP = { tutorStop: true };
var stopReason = null;
// While a step is being recorded: the program's code, if the runtime ever ran
// some, takes no step and changes no frame (#88).
var busy = 0;
// After the script's synchronous code (#45): its timers and promise callbacks
// run before the reply. The step that starts a callback gets a label saying so.
var scriptDone = false;
var scriptEndStep = 0;
var nextLabel = null;
// Reads the program's top-level names (the instrumenter's __setGlobals__).
var globalsReader = null;
// Set by the program's close() (#92): no timer or callback runs after it.
var closed = false;

function stop(reason) {
  if (stopReason === null) stopReason = reason;
  throw STOP;
}
function timeUp() { return DateNow() - runStart > TIME_BUDGET_MS; }
// Before each step: the step cap, the time budget, and a run already stopped.
function going() {
  if (stopReason !== null) throw STOP;
  if (snapshots.length >= MAX_SNAPSHOTS) stop('steps');
  if (timeUp()) stop('time');
}

// Each step is recorded sharing what didn't change with the steps before it
// (sharer.ts, #49), so the reply's structured clone carries each unchanged
// frame, variable, heap object and console line once.
${SHARER_SOURCE}
function record(snap) {
  $push(snapshots, __shareSnapshot__(snap));
  sinceStep = 0;
}

// ── The reply ──

var LIMIT_MESSAGES = {
  steps: 'Stopped after ' + MAX_SNAPSHOTS + ' steps, the most that can be shown. Your code may contain an infinite loop.',
  loop: 'Infinite loop detected (a loop ran ' + MAX_SILENT_ITERATIONS + ' times without a step)',
  output: 'Stopped after ' + MAX_CONSOLE_LINES + ' lines of output, the most that can be shown.',
};
var CLOSED_MESSAGE = 'The program called close(), which ends the worker: nothing after it runs.';

// The worker's reply once the program has run: its steps, and why it stopped
// early if it did. Called with the thrown value when the program threw.
function runResult(err, kind) {
  var thrown = arguments.length > 0;
  busy++;
  try {
    finishOutput();
    var msg = { type: 'result', snapshots: snapshots };
    if (stopReason !== null) {
      msg.error = { kind: 'limit', message: stopReason === 'time'
        ? 'Stopped after ' + (TIME_BUDGET_MS / 1000) + ' seconds, the longest a run can take.' + (scriptDone ? ' A timer may keep running forever (a setInterval never cleared).' : ' Your code may run too long to show step by step.')
        : LIMIT_MESSAGES[stopReason] };
    } else if (!thrown) {
      if (closed) msg.error = { kind: 'error', message: CLOSED_MESSAGE };
      else if (snapshots.length >= MAX_SNAPSHOTS) msg.error = { kind: 'limit', message: 'Stopped recording after ' + MAX_SNAPSHOTS + ' steps, the most that can be shown.' };
    } else {
      var text = uncaughtText(err);
      // A rejected promise nothing handled ends the run as Node ends it; the browser says "(in promise)".
      msg.error = { kind: 'exception', message: text.message, stderr: (kind === 'promise' ? 'Uncaught (in promise) ' : 'Uncaught ') + text.trace };
    }
    return msg;
  } finally {
    busy--;
  }
}

// An uncaught value's text (#94): an error as name: message, with its stack on
// the console (its frames name the program's lines, #47); anything else as the
// console prints it ({ code: 404 }), a primitive as String() writes it. Never
// throws, whatever was thrown.
function uncaughtText(err) {
  var message;
  try {
    if (err !== null && typeof err === 'object' && objectToString(err) === '[object Error]') {
      message = String(err.name) + ': ' + String(err.message);
      var trace = message;
      try { if (typeof err.stack === 'string' && $indexOf(err.stack, message) === 0) trace = err.stack; } catch (e) { /* a stack getter that throws */ }
      return { message: message, trace: trace };
    }
    if (typeof err === 'symbol') message = symbolToString(err);
    else if (err !== null && (typeof err === 'object' || typeof err === 'function')) message = __inspect__(err);
    else message = String(err);
  } catch (e) {
    try { message = objectToString(err); } catch (e2) { message = 'a value that can\'t be shown'; }
  }
  return { message: message, trace: message };
}

// Output written after the last step (a finally block's, on the way out of an
// uncaught exception) gets one more step, the last, at the same place.
function finishOutput() {
  var last = snapshots[snapshots.length - 1];
  if (!last || snapshots.length >= MAX_SNAPSHOTS) return;
  if (last.stdout.length === stdout.length && (last.console ? last.console.length : last.stdout.length) === consoleLines.length) return;
  var snap = { step: snapshots.length, line: last.line, callStack: last.callStack, heap: last.heap };
  outputOf(snap);
  record(snap);
}

// A snapshot's console: stdout's lines, and once the program has used stderr, every line with its stream.
function outputOf(snap) {
  snap.stdout = $slice(stdout, 0);
  if (stderrUsed) snap.console = $slice(consoleLines, 0);
  if (nextLabel) { snap.label = nextLabel; nextLabel = null; }
  return snap;
}

// The Global frame shows each top-level name's current value at every step,
// inside functions too (a callback changing a global, #45): the reader the
// instrumenter gives __setGlobals__ reads them all.
function refreshGlobals(ctx) {
  if (callStack.length > 1 && globalsReader !== null) callStack[0].variables = serializeVars(globalsReader(), ctx);
}

// ── Drawing values (#48, #88, #93) ──

// A drawing's bookkeeping: the heap objects drawn so far, once each.
function newDrawing() { return { heap: [], visited: new SafeSet() }; }

function heapIdOf(obj) {
  var id = heapIds.get(obj);
  if (id === undefined) { id = String(++heapCounter); heapIds.set(obj, id); }
  return id;
}

function serializeValue(val, ctx) {
  if (val === null) return { type: 'null', value: null };
  if (val === undefined) return { type: 'undefined', value: null };
  var t = typeof val;
  // NaN, the infinities and -0 say what they are (#48): JSON has no such numbers, and -0 prints as 0.
  if (t === 'number') {
    if (val !== val) return { type: t, value: val, display: 'NaN' };
    if (val === Infinity || val === -Infinity) return { type: t, value: val, display: val > 0 ? 'Infinity' : '-Infinity' };
    if (val === 0 && 1 / val < 0) return { type: t, value: val, display: '-0' };
    return { type: t, value: val };
  }
  if (t === 'boolean') return { type: t, value: val };
  if (t === 'string') return { type: 'string', value: val };
  if (t === 'symbol') return { type: 'symbol', value: symbolToString(val) };
  // A BigInt says it is one: 10n, not 10 (#93).
  if (t === 'bigint') { var digits = bigintToString(val); return { type: 'bigint', value: digits, display: digits + 'n' }; }
  if (t === 'object' || t === 'function') {
    // A proxy is drawn as its target, running none of its traps, as Node's console shows it (#88).
    var obj = val;
    while (proxyTargets.has(obj) && proxyTargets.get(obj) !== null) obj = proxyTargets.get(obj);
    var heapId = heapIdOf(obj);
    if (!ctx.visited.has(obj)) {
      ctx.visited.add(obj);
      $push(ctx.heap, serializeHeapObject(obj, heapId, ctx));
    }
    return { type: 'ref', heapId: heapId };
  }
  return { type: 'undefined', value: null };
}

// Never throws: an object that can't be read is still drawn, so no reference to it dangles (#88).
function serializeHeapObject(obj, heapId, ctx) {
  var heapObj;
  try {
    heapObj = drawObject(obj, heapId, ctx);
  } catch (e) {
    heapObj = { id: heapId, objectType: 'object', label: '[unreadable]', properties: [] };
  }
  heapRegistry[heapId] = heapObj;
  return heapObj;
}

function drawObject(obj, heapId, ctx) {
  var properties = [];
  var card = function (objectType, label) { return { id: heapId, objectType: objectType, label: label, properties: properties }; };
  // The global object is a card of its own, not the browser's thousands of names (#87).
  if (obj === global) return card('object', 'globalThis');
  if (proxyTargets.has(obj)) return card('object', 'Revoked Proxy');
  if (ArrayIsArray(obj)) {
    drawElements(obj, obj.length, properties, ctx);
    return card('array', '');
  }
  if (typeof obj === 'function') {
    // A class's static members, and a function's own properties (fib.cache), are drawn on its card (#93).
    drawOwnProperties(obj, properties, ctx);
    drawPrivateFields(obj, obj, properties, ctx);
    return card('function', functionName(obj) || 'anonymous');
  }
  var kind = builtinKind(obj);
  // A typed array is drawn as an array, its first 100 elements: not every index at every step (#91).
  if (kind === 'typedArray') {
    drawElements(obj, typedArrayLength(obj), properties, ctx);
    return card('array', typedArrayTag(obj));
  }
  if (kind === 'date') {
    var time = dateGetTime(obj);
    return card('date', time !== time ? 'Invalid Date' : dateToISOString(obj));
  }
  if (kind === 'regexp') {
    var flags = '';
    for (var f = 0; f < REGEXP_FLAGS.length; f++) if (REGEXP_FLAGS[f][2] !== null && REGEXP_FLAGS[f][2](obj)) flags += REGEXP_FLAGS[f][1];
    return card('regexp', '/' + regexpSource(obj) + '/' + flags);
  }
  if (kind === 'error') {
    // Its stack isn't read: V8 writes a stack's text the first time it is read,
    // from the error's name then, which a step taken before a constructor sets
    // the name would freeze (#47). Its message, unless a getter (#88).
    var message = dataProperty(obj, 'message');
    $push(properties, { key: 'message', value: message.found ? serializeValue(message.value, ctx) : { type: 'string', value: message.accessor ? '<getter>' : '' } });
    drawOwnProperties(obj, properties, ctx, ['message', 'stack']);
    return card('error', constructorName(obj) || 'Error');
  }
  if (kind === 'map') {
    // The first 50 entries (and how many more), read from the map itself, not its forEach (#88, #93).
    var mapIterator = mapEntries(obj);
    for (var m = 0; m < 50; m++) {
      var entry = mapIteratorNext(mapIterator);
      if (entry.done) break;
      var k = entry.value[0];
      // The key is drawn as a value too, so an object key is a reference to its object (#48).
      var keyValue = serializeValue(k, ctx);
      $push(properties, {
        key: keyValue.type === 'ref' ? '#' + keyValue.heapId : typeof k === 'symbol' ? symbolToString(k) : String(k),
        keyValue: keyValue,
        value: serializeValue(entry.value[1], ctx),
      });
    }
    moreMarker(mapSize(obj) - 50, properties);
    return card('map', '');
  }
  if (kind === 'set') {
    var setIterator = setValues(obj);
    for (var s = 0; s < 50; s++) {
      var item = setIteratorNext(setIterator);
      if (item.done) break;
      $push(properties, { key: String(s), value: serializeValue(item.value, ctx) });
    }
    moreMarker(setSize(obj) - 50, properties);
    return card('set', '');
  }
  // An object: its class if it has one, its own enumerable properties, and its private fields (#93).
  var name = constructorName(obj);
  drawOwnProperties(obj, properties, ctx);
  drawPrivateFields(obj, obj, properties, ctx);
  return name && name !== 'Object' ? card('class', name) : card('object', '');
}

// What kind of built-in an object is, by the prototypes it inherits from,
// confirmed by the built-in's own check (a Date made in a subclass is a date;
// an object inheriting from Date.prototype isn't).
function builtinKind(obj) {
  for (var p = ObjectGetPrototypeOf(obj); p !== null; p = ObjectGetPrototypeOf(p)) {
    if (p === TypedArrayPrototype) return typedArrayTag(obj) !== undefined ? 'typedArray' : null;
    if (p === DatePrototype) return brand(dateGetTime, obj) ? 'date' : null;
    if (p === RegExpPrototype) return brand(regexpSource, obj) ? 'regexp' : null;
    if (p === MapPrototype) return brand(mapSize, obj) ? 'map' : null;
    if (p === SetPrototype) return brand(setSize, obj) ? 'set' : null;
    if (p === ErrorPrototype) return errorIsError === null || errorIsError(obj) ? 'error' : null;
  }
  return null;
}
function brand(check, v) { try { check(v); return true; } catch (e) { return false; } }

// An array's or typed array's first 100 elements, read by their descriptors:
// a hole is drawn as empty, a getter isn't called (#48).
function drawElements(obj, length, properties, ctx) {
  for (var i = 0; i < length && i < 100; i++) {
    var cell = ObjectGetOwnPropertyDescriptor(obj, i);
    var value = !cell ? { type: 'empty', value: null, display: 'empty' }
      : !('value' in cell) ? { type: 'string', value: accessorText(cell) }
      : serializeValue(cell.value, ctx);
    $push(properties, { key: String(i), value: value });
  }
  moreMarker(length - 100, properties);
}

// "(N more)" after the entries drawn: arrays after 100, objects, maps and sets after 50 (#93).
function moreMarker(more, properties) {
  if (more > 0) $push(properties, { key: '...', value: { type: 'string', value: '(' + more + ' more)' } });
}

function accessorText(desc) { return desc.get && desc.set ? '<accessor>' : desc.get ? '<getter>' : '<setter>'; }

// An object's own enumerable properties, Symbol keys included as [Symbol(id)]
// (#48), the first 50, by their descriptors: a getter is drawn, never called.
function drawOwnProperties(obj, properties, ctx, skip) {
  var keys = ObjectKeys(obj);
  var symbols = ObjectGetOwnPropertySymbols(obj);
  for (var sk = 0; sk < symbols.length; sk++) if (isEnumerable(obj, symbols[sk])) $push(keys, symbols[sk]);
  var shown = 0;
  var more = 0;
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    if (skip && $indexOf(skip, key) !== -1) continue;
    if (shown === 50) { more++; continue; }
    var desc = ObjectGetOwnPropertyDescriptor(obj, key);
    if (!desc) continue;
    var keyText = typeof key === 'symbol' ? '[' + symbolToString(key) + ']' : key;
    $push(properties, { key: keyText, value: 'value' in desc ? serializeValue(desc.value, ctx) : { type: 'string', value: accessorText(desc) } });
    shown++;
  }
  moreMarker(more, properties);
}

// A data property's value, up the prototype chain, never calling a getter.
function dataProperty(obj, key) {
  for (var p = obj; p !== null && p !== undefined; p = ObjectGetPrototypeOf(p)) {
    var d = ObjectGetOwnPropertyDescriptor(p, key);
    if (!d) continue;
    return 'value' in d ? { found: true, value: d.value } : { found: false, accessor: true };
  }
  return { found: false, accessor: false };
}

// A function's name, unless a static getter computes it.
function functionName(fn) {
  var d = ObjectGetOwnPropertyDescriptor(fn, 'name');
  return d && typeof d.value === 'string' ? d.value : '';
}

// The name of the class an object was made by, as obj.constructor.name reads
// it: the first constructor up its prototype chain (an anonymous class has
// none). A built-in getter (Iterator.prototype's) runs no program code, so it
// is followed; a program's getter isn't called.
function constructorName(obj) {
  for (var p = ObjectGetPrototypeOf(obj); p !== null; p = ObjectGetPrototypeOf(p)) {
    var d = ObjectGetOwnPropertyDescriptor(p, 'constructor');
    if (!d) continue;
    var ctor = 'value' in d ? d.value : isNative(d.get) ? ReflectApply(d.get, obj, []) : undefined;
    return typeof ctor === 'function' ? functionName(ctor) || null : null;
  }
  return null;
}
function isNative(fn) {
  if (typeof fn !== 'function' || looksNative.has(fn)) return false;
  try { return $test(/\{\s*\[native code\]\s*\}$/, functionToString(fn)); } catch (e) { return false; }
}

// Private fields (#93): each class with some gives the runtime a reader for
// each (__privateNames__, from a static block the instrumenter adds). An
// object shows those of every class it was made by; a class its static ones.
var privateReaders = new SafeWeakMap();
var ABSENT = { absent: true };
function drawPrivateFields(obj, target, properties, ctx) {
  var classes = [];
  if (typeof obj === 'function') $push(classes, obj);
  else {
    for (var p = ObjectGetPrototypeOf(obj); p !== null; p = ObjectGetPrototypeOf(p)) {
      var d = ObjectGetOwnPropertyDescriptor(p, 'constructor');
      if (d && typeof d.value === 'function' && privateReaders.has(d.value)) $unshift(classes, d.value);
    }
  }
  for (var c = 0; c < classes.length; c++) {
    var readers = privateReaders.get(classes[c]);
    if (!readers) continue;
    var names = ObjectKeys(readers);
    for (var n = 0; n < names.length; n++) {
      var value;
      try { value = readers[names[n]](target, ABSENT); } catch (e) { value = ABSENT; }
      if (value !== ABSENT) $push(properties, { key: names[n], value: serializeValue(value, ctx) });
    }
  }
}
function privateNames(cls, readers) {
  if (typeof cls === 'function') privateReaders.set(cls, readers);
}

// ── Heap collection ──

// Walk all frames in a stack snapshot and collect every referenced
// HeapObject (transitively through object properties) from the registry.
function collectHeap(stackSnapshot) {
  var seen = ObjectCreate(null);
  var result = [];
  function visit(val) {
    if (!val || val.type !== 'ref') return;
    if (seen[val.heapId]) return;
    seen[val.heapId] = true;
    var obj = heapRegistry[val.heapId];
    if (obj) {
      $push(result, obj);
      for (var p = 0; p < obj.properties.length; p++) {
        visit(obj.properties[p].value);
        if (obj.properties[p].keyValue) visit(obj.properties[p].keyValue);
      }
    }
  }
  for (var f = 0; f < stackSnapshot.length; f++) {
    var vars = stackSnapshot[f].variables;
    for (var v = 0; vars && v < vars.length; v++) visit(vars[v].value);
    var cvars = stackSnapshot[f].closureVars;
    for (var cv = 0; cvars && cv < cvars.length; cv++) visit(cvars[cv].value);
    if (stackSnapshot[f].thisArg) visit(stackSnapshot[f].thisArg);
  }
  return result;
}

// ── Steps ──

// Each variable of a { name: value } object, serialized.
function serializeVars(vars, ctx) {
  var entries = [];
  var keys = ObjectKeys(vars);
  for (var i = 0; i < keys.length; i++) {
    $push(entries, { name: keys[i], value: serializeValue(vars[keys[i]], ctx) });
  }
  return entries;
}

// Re-serialize every frame's this from its live reference, so mutations are visible.
function refreshThis(ctx) {
  for (var ti = 0; ti < callStack.length; ti++) {
    if (callStack[ti].rawThis !== undefined) callStack[ti].thisArg = serializeValue(callStack[ti].rawThis, ctx);
  }
}

// The call stack as a step shows it; the top frame's variables replaced by topVariables if given.
function stackSnapshot(topVariables) {
  var out = [];
  for (var j = 0; j < callStack.length; j++) {
    var frame = callStack[j];
    var entry = { name: frame.name, variables: topVariables && j === callStack.length - 1 ? topVariables : frame.variables || [] };
    if (frame.isBlockScope) entry.isBlockScope = true;
    if (frame.closureVars && frame.closureVars.length > 0) entry.closureVars = frame.closureVars;
    if (frame.thisArg) entry.thisArg = frame.thisArg;
    $push(out, entry);
  }
  return out;
}

// A test's step (#24): it refreshes the variables the test sees, as a capture
// does, so the step shows the current state with the test's result.
// blockFrame ({ name, vars }) is a for loop's let/const variables, whose frame
// is pushed in the loop body: the step shows them in a frame of their own.
function condition(value, line, expression, vars, parentVarNames, blockFrame) {
  if (busy) return value;
  going();
  var columnRange = null;
  if (ArrayIsArray(line)) {
    columnRange = { startCol: line[1], endCol: line[2] };
    line = line[0];
  }
  busy++;
  try {
    var ctx = newDrawing();
    if (vars) updateFrames(vars, parentVarNames, ctx);
    refreshGlobals(ctx);
    refreshThis(ctx);
    var stack = stackSnapshot();
    if (blockFrame) $push(stack, { name: blockFrame.name, variables: serializeVars(blockFrame.vars, ctx), isBlockScope: true });
    var snap = outputOf({ step: snapshots.length, line: line, callStack: stack, heap: collectHeap(stack), condition: { expression: expression, result: !!value, line: line } });
    if (columnRange) snap.columnRange = columnRange;
    record(snap);
  } finally {
    busy--;
  }
  return value;
}

// The step before a statement runs (#24). As CPython reports a line once while
// a frame stays on it, a statement on the line its frame last stepped at
// (a(); b();, if (n < 2) return n;) takes no step of its own; its variables
// still refresh the frames for the next step. The final capture is always a step.
function capture(line, vars, parentVarNames) {
  if (busy) return;
  going();
  takeStep(line, vars, parentVarNames, false);
}

function takeStep(line, vars, parentVarNames, isFinal) {
  var columnRange = null;
  if (ArrayIsArray(line)) {
    columnRange = { startCol: line[1], endCol: line[2] };
    line = line[0];
  }
  busy++;
  try {
    var ctx = newDrawing();
    updateFrames(vars, parentVarNames, ctx);
    refreshGlobals(ctx);
    var last = snapshots[snapshots.length - 1];
    var sameDepth = last && last.callStack.length === callStack.length;
    if (isFinal) {
      // The final state marks the line that ran last, if the program's frame took that step.
      if (sameDepth) line = last.line;
    } else if (sameDepth && last.line === line && (last.condition || (!framePushed && iterations === stepIterations))) {
      // (A statement on its test's line, as in while (a < 3) a++;, is part of the test's step.)
      return;
    }
    framePushed = false;
    stepIterations = iterations;
    refreshThis(ctx);
    var stack = stackSnapshot();
    var snap = outputOf({ step: snapshots.length, line: line, callStack: stack, heap: collectHeap(stack) });
    if (columnRange) snap.columnRange = columnRange;
    record(snap);
  } finally {
    busy--;
  }
}

// Set the frames' variables from a capture's: the top frame's, or, inside a
// block scope, the block frame's and its parent's (parentVarNames); and the
// closed-over variables of the nearest function frame, from its reader.
function updateFrames(vars, parentVarNames, ctx) {
  for (var fi = callStack.length - 1; fi > 0; fi--) {
    var fnFrame = callStack[fi];
    if (fnFrame.isBlockScope) continue;
    if (fnFrame.closure) fnFrame.closureVars = serializeVars(fnFrame.closure(), ctx);
    break;
  }
  if (!vars) return;
  if (parentVarNames && callStack.length >= 2) {
    // Block-scope mode: distribute vars between the top (block) frame and the parent frame beneath it.
    var parentSet = ObjectCreate(null);
    for (var p = 0; p < parentVarNames.length; p++) parentSet[parentVarNames[p]] = true;
    var blockVars = [];
    var parentVars = [];
    var keys = ObjectKeys(vars);
    for (var i = 0; i < keys.length; i++) {
      var entry = { name: keys[i], value: serializeValue(vars[keys[i]], ctx) };
      $push(parentSet[keys[i]] ? parentVars : blockVars, entry);
    }
    callStack[callStack.length - 1].variables = blockVars;
    callStack[callStack.length - 2].variables = parentVars;
  } else {
    callStack[callStack.length - 1].variables = serializeVars(vars, ctx);
  }
}

// ── Frames ──

// A frame the program's code would push while a step is being recorded: never on the stack.
var DETACHED = { name: '', variables: [] };

// closure: a function reading the variables the function closes over (#90),
// made inside it by the instrumenter, each read in a try (one may still be in
// its temporal dead zone). thisVal: its this, unless it is an arrow function.
function pushFrame(name, params, isBlockScope, closure, thisVal) {
  if (busy) return DETACHED;
  var frame = { name: name, variables: [], isBlockScope: !!isBlockScope };
  busy++;
  try {
    var ctx = newDrawing();
    frame.variables = serializeVars(params, ctx);
    if (typeof closure === 'function') {
      frame.closure = closure;
      frame.closureVars = serializeVars(closure(), ctx);
    }
    // Its this, unless it is the global object or there is none.
    if (thisVal !== undefined && thisVal !== global) {
      frame.rawThis = thisVal;
      frame.thisArg = serializeValue(thisVal, ctx);
    }
  } finally {
    busy--;
  }
  // A function entered on an empty stack after the script ended was called by the event loop.
  if (scriptDone && callStack.length === 1 && !isBlockScope && !nextLabel) nextLabel = 'promise callback';
  $push(callStack, frame);
  framePushed = true;
  return frame;
}

// A derived class's constructor has its this once super() returns (#93): super(…)'s value.
function thisReady(frame, value) {
  if (frame && frame !== DETACHED) frame.rawThis = value;
  return value;
}

// Take a frame, and every frame above it, off the stack, wherever it is now
// (#44). Each function's body and each loop with a block frame ends in a
// finally calling this, so the frame goes however the code is left: a return
// (already popped: nothing to do), break, continue, a labeled break, a throw.
// A suspended generator or async function that ends (a rejected await nothing
// caught, a generator's return()) drops its saved frames.
function leave(frame) {
  if (!frame || frame === DETACHED) return;
  if (frame.saved) { frame.saved = null; return; }
  var at = $lastIndexOf(callStack, frame);
  if (at > 0) callStack.length = at;
}

// At a yield or await, a generator's or async function's frames (its own and
// its loops') leave the stack, as a debugger shows them, and come back when it
// resumes, on top of whatever is running then (#44).
function suspend(frame, value) {
  if (busy || frame === DETACHED) return value;
  var at = $lastIndexOf(callStack, frame);
  if (at > 0) frame.saved = $splice(callStack, at);
  return value;
}
function resume(frame, value) {
  if (busy || frame === DETACHED) return value;
  var saved = frame.saved;
  if (saved) {
    if (scriptDone && callStack.length === 1 && !nextLabel) nextLabel = 'resumed after await';
    frame.saved = null;
    for (var i = 0; i < saved.length; i++) $push(callStack, saved[i]);
    framePushed = true;
  }
  return value;
}

// A return: with its line, a step showing the returned value, then the frame
// leaves. Any block frames of loops between the return and its function's
// frame leave with it.
function popFrame(retVal, line) {
  if (busy) return retVal;
  if (stopReason === null && timeUp()) stop('time');
  if (line !== undefined) {
    while (callStack.length > 1 && callStack[callStack.length - 1].isBlockScope) callStack.length--;
  }
  if (callStack.length > 1) {
    if (line !== undefined && stopReason === null && snapshots.length < MAX_SNAPSHOTS) {
      busy++;
      try {
        var ctx = newDrawing();
        refreshGlobals(ctx);
        var top = callStack[callStack.length - 1];
        var retVars = $slice(top.variables || [], 0);
        $push(retVars, { name: 'return ↵', value: serializeValue(retVal, ctx) });
        refreshThis(ctx);
        var stack = stackSnapshot(retVars);
        record(outputOf({ step: snapshots.length, line: line, callStack: stack, heap: collectHeap(stack) }));
      } finally {
        busy--;
      }
    }
    callStack.length--;
  }
  return retVal;
}

// Each loop iteration (the loop guard, #91): a loop that takes no step stops
// after MAX_SILENT_ITERATIONS, and every loop at the time budget.
function loop() {
  if (busy) return;
  if (stopReason !== null) throw STOP;
  iterations++;
  if (++sinceStep > MAX_SILENT_ITERATIONS) stop('loop');
  if ((iterations & 1023) === 0 && timeUp()) stop('time');
}

// ── The end of the script, and its callbacks (#45) ──

function setGlobals(reader) { globalsReader = reader; }

// The script's last step: the state when its synchronous code has run (all
// of it, if nothing is left to run). The program's timers and promise
// callbacks run after it, each step that starts one labeled.
function endScript(line) {
  if (line > 0) {
    going();
    takeStep(line, globalsReader !== null ? globalsReader() : {}, null, true);
  }
  scriptDone = true;
  scriptEndStep = snapshots.length;
}

// Timers run by virtual time, so a 2-second timeout takes no time: in order
// of when they are due, then of when they were set, a delay below 1 ms being 1
// ms (as in Node). Each callback runs after the microtasks before it.
var virtualNow = 0;
var timers = [];
var timerId = 0;
var timerSeq = 0;
function addTimer(fn, ms, args, repeat) {
  ms = Number(ms);
  if (!(ms >= 1 && ms <= 2147483647)) ms = 1;
  var t = { id: ++timerId, fn: fn, args: args, due: virtualNow + Math.floor(ms), seq: ++timerSeq, interval: repeat ? Math.floor(ms) : null };
  $push(timers, t);
  return t.id;
}
function clearTimer(id) {
  for (var i = 0; i < timers.length; i++) if (timers[i].id === id) { $splice(timers, i, 1); return; }
}
function nextTimer() {
  var best = null;
  for (var i = 0; i < timers.length; i++) {
    var t = timers[i];
    if (!best || t.due < best.due || (t.due === best.due && t.seq < best.seq)) best = t;
  }
  return best;
}

// The clock the program reads moves with virtual time too (#92): Date.now(),
// new Date(), performance.now() and console.time are ahead of the real
// clock by the time the timers skipped.
function clock() { return DateNow() + virtualNow; }

// The first rejection nothing handled, and the first exception a callback
// didn't catch (a timer's, or a task of the program's own, like a
// MessageChannel's handler): each ends the run, as in Node.
var unhandled = null;
var callbackError = null;
if (typeof hostAddEventListener === 'function') {
  ReflectApply(hostAddEventListener, global, ['unhandledrejection', function (e) {
    if (!unhandled) unhandled = { reason: e.reason };
    if (e.preventDefault) e.preventDefault();
  }]);
  ReflectApply(hostAddEventListener, global, ['error', function (e) {
    if (!callbackError) callbackError = { error: e.error, kind: 'callback' };
    if (e.preventDefault) e.preventDefault();
  }]);
}

// Network requests in flight (#92): the event loop waits for them, up to the time budget.
var pendingIO = 0;

// Run a function in a new task, once the current one's microtasks have run.
var hop = (function () {
  if (typeof HostMessageChannel === 'function') {
    var channel = new HostMessageChannel();
    var queue = [];
    channel.port1.onmessage = function () { var fn = queue[0]; $splice(queue, 0, 1); fn(); };
    var postToPort = uncurryThis(channel.port2.postMessage);
    return function (fn) { $push(queue, fn); postToPort(channel.port2, null); };
  }
  return typeof hostSetTimeout === 'function' ? function (fn) { hostSetTimeout(fn, 0); } : null;
})();

// After the script: let its microtasks run, then each timer that is due, and
// reply (done) when nothing is left, at the first uncaught exception or
// unhandled rejection, at a limit, or once the program called close().
function eventLoop(done) {
  var finish = function (err, kind) { done(arguments.length === 0 ? runResult() : runResult(err, kind)); };
  if (!hop) { finish(); return; }
  var check = function () {
    if (stopReason !== null) return finish();
    if (callbackError) return finish(callbackError.error, callbackError.kind);
    if (unhandled) return finish(unhandled.reason, 'promise');
    if (timeUp()) { stopReason = 'time'; return finish(); }
    if (closed) { finalStep(); return finish(); }
    var t = nextTimer();
    // While a request is in flight, virtual time doesn't run ahead of the real clock: wait for it.
    if (pendingIO > 0 && (!t || t.due > DateNow() - runStart)) {
      hostSetTimeout(tick, 4);
      return;
    }
    if (!t) { finalStep(); return finish(); }
    virtualNow = t.due;
    if (t.interval !== null) { t.due = virtualNow + t.interval; t.seq = ++timerSeq; }
    else clearTimer(t.id);
    nextLabel = t.interval !== null ? 'setInterval callback' : 'setTimeout callback';
    try {
      if (typeof t.fn === 'function') ReflectApply(t.fn, undefined, t.args);
    } catch (e) {
      nextLabel = null;
      return finish(e, 'callback');
    }
    nextLabel = null;
    tick();
  };
  // Two hops: one for the microtasks, one for the browser's unhandledrejection task.
  var tick = function () { hop(function () { hop(check); }); };
  tick();
}

// When callbacks ran after the script, the last step is the state after them all.
function finalStep() {
  if (snapshots.length <= scriptEndStep || globalsReader === null) return;
  var last = snapshots[snapshots.length - 1];
  try { going(); takeStep(last.line, globalsReader(), null, true); } catch (e) { /* a limit */ }
}

// ── The globals the program sees ──

// Function.prototype.toString gives a function's own text, not its
// instrumented one (#47), and the runtime's functions the program can reach
// (setTimeout, console.log, toString itself) look like the browser's own.
var looksNative = new SafeWeakSet();
var sourceTextMap = new SafeMap();
function sourceTexts(texts) {
  var keys = ObjectKeys(texts);
  for (var i = 0; i < keys.length; i++) sourceTextMap.set(keys[i], texts[keys[i]]);
}
function sourceKey(text) {
  var h1 = 0xdeadbeef;
  var h2 = 0x41c6ce57;
  for (var i = 0; i < text.length; i++) {
    var c = $charCodeAt(text, i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return text.length + ':' + (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}
var nativeLooking = function (fn) { looksNative.add(fn); return fn; };
define(Function.prototype, 'toString', nativeLooking(function toString() {
  if (looksNative.has(this)) return 'function ' + functionName(this) + '() { [native code] }';
  var text = functionToString(this);
  var original = sourceTextMap.get(sourceKey(text));
  return original === undefined ? text : original;
}));
var defineGlobal = function (name, value) { define(global, name, nativeLooking(value)); };

defineGlobal('setTimeout', function setTimeout(fn) { return addTimer(fn, arguments[1], $slice(arguments, 2), false); });
defineGlobal('setInterval', function setInterval(fn) { return addTimer(fn, arguments[1], $slice(arguments, 2), true); });
defineGlobal('clearTimeout', function clearTimeout(id) { clearTimer(id); });
defineGlobal('clearInterval', function clearInterval(id) { clearTimer(id); });
if (typeof hostQueueMicrotask === 'function') {
  defineGlobal('queueMicrotask', function queueMicrotask(fn) {
    hostQueueMicrotask(function () {
      nextLabel = 'queueMicrotask callback';
      try { fn(); } catch (e) { if (!callbackError) callbackError = { error: e, kind: 'callback' }; }
      nextLabel = null;
    });
  });
}
defineGlobal('close', function close() { closed = true; });

// The clock (#92).
var VirtualDate = new HostProxy(HostDate, {
  construct: function (target, args, newTarget) {
    return ReflectConstruct(HostDate, args.length === 0 ? [clock()] : args, newTarget === VirtualDate ? HostDate : newTarget);
  },
  apply: function () { return dateToString(new HostDate(clock())); },
});
define(HostDate, 'now', nativeLooking(function now() { return clock(); }));
define(DatePrototype, 'constructor', VirtualDate);
defineGlobal('Date', VirtualDate);
if (perfNow !== null) define(hostPerformance, 'now', nativeLooking(function now() { return perfNow(hostPerformance) + virtualNow; }));

// Proxies are drawn and printed as their targets (#88): each one's target is kept.
var proxyTargets = new SafeWeakMap();
var TrackedProxy = function Proxy(target, handler) {
  if (new.target === undefined) throw new TypeError("Constructor Proxy requires 'new'");
  var proxy = new HostProxy(target, handler);
  proxyTargets.set(proxy, target);
  return proxy;
};
define(TrackedProxy, 'revocable', nativeLooking(function revocable(target, handler) {
  var made = HostProxy.revocable(target, handler);
  proxyTargets.set(made.proxy, target);
  return { proxy: made.proxy, revoke: nativeLooking([function () { proxyTargets.set(made.proxy, null); made.revoke(); }][0]) };
}));
ObjectDefineProperty(TrackedProxy, 'prototype', { value: undefined });
defineGlobal('Proxy', TrackedProxy);

// Promises' states (#92), for the console: a promise made by Promise.resolve
// or Promise.reject, settled by its executor's resolve or reject, or seen
// settled by a then callback. (An async function's promise isn't seen until
// a then callback runs.)
var promiseStates = new SafeWeakMap();
function settle(p, rejected, value) { if (!promiseStates.has(p)) promiseStates.set(p, { rejected: rejected, value: value }); }
// Whether resolving with a value waits for it (a thenable): its then, found without running a getter.
function thenable(v) {
  if (v === null || (typeof v !== 'object' && typeof v !== 'function')) return false;
  if (proxyTargets.has(v)) return true;
  for (var o = v; o !== null; o = ObjectGetPrototypeOf(o)) {
    var d = ObjectGetOwnPropertyDescriptor(o, 'then');
    if (d) return !('value' in d) || typeof d.value === 'function';
  }
  return false;
}
var TrackedPromise;
var promiseStatics = new SafeMap();
var hostThis = function (receiver) { return receiver === TrackedPromise ? HostPromise : receiver; };
promiseStatics.set('resolve', nativeLooking(function resolve(value) {
  var p = ReflectApply(HostPromise.resolve, hostThis(this), [value]);
  if (p !== value && !thenable(value)) settle(p, false, value);
  return p;
}));
promiseStatics.set('reject', nativeLooking(function reject(reason) {
  var p = ReflectApply(HostPromise.reject, hostThis(this), [reason]);
  settle(p, true, reason);
  return p;
}));
$forEach(ObjectGetOwnPropertyNames(HostPromise), function (name) {
  var d = ObjectGetOwnPropertyDescriptor(HostPromise, name);
  if (promiseStatics.has(name) || !d || typeof d.value !== 'function') return;
  var hostStatic = d.value;
  // (Called on the global Promise, a static runs as on the browser's, so its promises are made as the browser makes them.)
  var wrapper = { m: function () { return ReflectApply(hostStatic, hostThis(this), arguments); } }.m;
  ObjectDefineProperty(wrapper, 'name', { value: name });
  promiseStatics.set(name, nativeLooking(wrapper));
});
TrackedPromise = new HostProxy(HostPromise, {
  construct: function (target, args, newTarget) {
    var executor = args[0];
    var made = null;
    var early = null;
    var once = false;
    var note = function (rejected, value) { if (made) settle(made, rejected, value); else early = { rejected: rejected, value: value }; };
    var promise = ReflectConstruct(HostPromise, typeof executor !== 'function' ? args : [function (resolve, reject) {
      var fns = [
        function (value) { if (!once) { once = true; if (!thenable(value)) note(false, value); } return resolve(value); },
        function (reason) { if (!once) { once = true; note(true, reason); } return reject(reason); },
      ];
      nativeLooking(fns[0]);
      nativeLooking(fns[1]);
      return ReflectApply(executor, undefined, fns);
    }], newTarget === TrackedPromise ? HostPromise : newTarget);
    made = promise;
    if (early) settle(promise, early.rejected, early.value);
    return promise;
  },
  get: function (target, key, receiver) {
    return promiseStatics.has(key) ? promiseStatics.get(key) : ReflectGet(target, key, receiver);
  },
});
define(HostPromise.prototype, 'then', nativeLooking(function then(onFulfilled, onRejected) {
  var p = this;
  return ReflectApply(hostThen, p, [
    typeof onFulfilled === 'function' ? function (value) { settle(p, false, value); return ReflectApply(onFulfilled, undefined, [value]); } : onFulfilled,
    typeof onRejected === 'function' ? function (reason) { settle(p, true, reason); return ReflectApply(onRejected, undefined, [reason]); } : onRejected,
  ]);
}));
defineGlobal('Promise', TrackedPromise);

// Requests in flight keep the event loop waiting (#92): fetch, and reading a response's body.
function trackIO(start) {
  pendingIO++;
  var settled = false;
  var done = function () { if (!settled) { settled = true; pendingIO--; } };
  var request;
  try { request = start(); } catch (e) { done(); throw e; }
  return new HostPromise(function (resolve, reject) {
    promiseThen(request, function (value) { done(); resolve(value); }, function (reason) { done(); reject(reason); });
  });
}
if (typeof hostFetch === 'function') {
  defineGlobal('fetch', function fetch(input) {
    var args = arguments;
    return trackIO(function () { return ReflectApply(hostFetch, global, args); });
  });
}
if (typeof HostResponse === 'function') {
  $forEach(['text', 'json', 'arrayBuffer', 'blob', 'formData', 'bytes'], function (name) {
    var d = ObjectGetOwnPropertyDescriptor(HostResponse.prototype, name);
    if (!d || typeof d.value !== 'function') return;
    var method = d.value;
    var wrapper = { m: function () { var self = this; var args = arguments; return trackIO(function () { return ReflectApply(method, self, args); }); } }.m;
    ObjectDefineProperty(wrapper, 'name', { value: name });
    define(HostResponse.prototype, name, nativeLooking(wrapper));
  });
}

// A DataCloneError quotes the function it couldn't clone: with its own text.
if (typeof hostStructuredClone === 'function') {
  var firstFunction = function (value, seen) {
    if (typeof value === 'function') return value;
    if (value === null || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    var parts = [];
    var kind = builtinKind(value);
    if (kind === 'map') {
      var it = mapEntries(value);
      for (var e = mapIteratorNext(it); !e.done; e = mapIteratorNext(it)) { $push(parts, e.value[0]); $push(parts, e.value[1]); }
    } else if (kind === 'set') {
      var si = setValues(value);
      for (var v = setIteratorNext(si); !v.done; v = setIteratorNext(si)) $push(parts, v.value);
    } else {
      var keys = ObjectKeys(value);
      for (var k = 0; k < keys.length; k++) { var d = ObjectGetOwnPropertyDescriptor(value, keys[k]); if (d && 'value' in d) $push(parts, d.value); }
    }
    for (var i = 0; i < parts.length; i++) { var f = firstFunction(parts[i], seen); if (f) return f; }
    return null;
  };
  defineGlobal('structuredClone', function structuredClone(value) {
    try {
      return ReflectApply(hostStructuredClone, this, arguments);
    } catch (e) {
      var fn = e && e.name === 'DataCloneError' ? firstFunction(value, new SafeSet()) : null;
      if (fn) {
        try {
          // (The browser may shorten the text it quotes, so the quote is found by its start.)
          var message = String(e.message);
          var raw = functionToString(fn);
          var own = ReflectApply(Function.prototype.toString, fn, []);
          var start = $indexOf(message, $slice(raw, 0, 20));
          var end = StringPrototypeLastIndexOf(message, ' could not be cloned');
          if (raw !== own && start !== -1 && end > start) {
            ObjectDefineProperty(e, 'message', { value: $slice(message, 0, start) + own + $slice(message, end), writable: true, configurable: true, enumerable: false });
          }
        } catch (ignored) { /* leave the message */ }
      }
      throw e;
    }
  });
}

// ── Stack traces (#47) ──

// The program's line for each line of its script, and where its script is:
// a stack trace names the program's functions and lines (at add (main.js:3)),
// and leaves out the runtime's and the worker's frames. V8's
// Error.prepareStackTrace; other browsers keep their own stacks.
var programLineMap = null;
var programSite = null;
function programLines(map) {
  programLineMap = map;
  if (typeof Error.captureStackTrace !== 'function') return;
  var previous = Error.prepareStackTrace;
  var holder = {};
  Error.prepareStackTrace = function (e, sites) { return sites; };
  // (V8 makes the stack when it is first read: read it before putting prepareStackTrace back.)
  var sites;
  try { Error.captureStackTrace(holder, programLines); sites = holder.stack; } finally { Error.prepareStackTrace = previous; }
  if (!ArrayIsArray(sites) || !sites[0] || typeof sites[0].getLineNumber !== 'function') return;
  programSite = { base: sites[0].getLineNumber() - 1, file: sites[0].getFileName(), origin: sites[0].getEvalOrigin() };
  Error.prepareStackTrace = prepareStackTrace;
}
function prepareStackTrace(error, sites) {
  var header;
  try { header = errorToString(error); } catch (e) { header = 'Error'; }
  var out = header;
  for (var i = 0; i < sites.length; i++) {
    var site = sites[i];
    if (site.getFileName() !== programSite.file || site.getEvalOrigin() !== programSite.origin) continue;
    var line = programLineMap[site.getLineNumber() - programSite.base];
    if (!line) continue;
    var name = site.getFunctionName();
    out += '\n    at ' + (name ? (site.isConstructor() ? 'new ' : '') + name + ' (main.js:' + line + ')' : 'main.js:' + line);
  }
  return out;
}

// ── Console ──

// The program's console prints as Node does (inspect.ts). Each call's text
// becomes lines on its stream: log, info, debug, dir, table, count, group and
// time write to stdout; warn, error, trace and assert to stderr. At most
// MAX_CONSOLE_LINES lines and MAX_CONSOLE_CHARS characters, then the run stops (#91).
${CONSOLE_SOURCE}
__tutorFormat__.hooks.now = function () { return (perfNow !== null ? perfNow(hostPerformance) : DateNow()) + virtualNow; };
__tutorFormat__.hooks.promiseState = function (p) { return promiseStates.get(p); };
__tutorFormat__.hooks.proxyTarget = function (v) { return proxyTargets.has(v) ? proxyTargets.get(v) : undefined; };
function write(stream, text) {
  if (stopReason !== null) throw STOP;
  var lines = $split(String(text), '\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (outputChars + line.length > MAX_CONSOLE_CHARS) line = $slice(line, 0, MAX_CONSOLE_CHARS - outputChars);
    outputChars += line.length;
    $push(consoleLines, { text: line, stream: stream });
    if (stream === 'stdout') $push(stdout, line);
    if (consoleLines.length >= MAX_CONSOLE_LINES || outputChars >= MAX_CONSOLE_CHARS) break;
  }
  if (stream === 'stderr') stderrUsed = true;
  if (consoleLines.length >= MAX_CONSOLE_LINES || outputChars >= MAX_CONSOLE_CHARS) stop('output');
}
var programConsole = __makeConsole__(write);
$forEach(ObjectKeys(programConsole), function (name) { if (typeof programConsole[name] === 'function') nativeLooking(programConsole[name]); });
define(global, 'console', programConsole);

// ── The functions the instrumented program calls ──

var exposed = {
  __capture__: capture, __condition__: condition, __pushFrame__: pushFrame, __popFrame__: popFrame,
  __leave__: leave, __suspend__: suspend, __resume__: resume, __thisReady__: thisReady, __loop__: loop,
  __endScript__: endScript, __setGlobals__: setGlobals, __privateNames__: privateNames,
  __programLines__: programLines, __sourceTexts__: sourceTexts,
};
$forEach(ObjectKeys(exposed), function (name) {
  ObjectDefineProperty(global, name, { value: exposed[name], writable: false, configurable: true, enumerable: false });
});

return { runResult: runResult, eventLoop: eventLoop };
})()`;
}
