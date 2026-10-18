/**
 * Globals a browser worker has that a `vm` context lacks, written to run
 * inside the context, so the objects they make belong to the program's realm
 * as they would in a browser (a host function's results fail the program's
 * `instanceof Set`). Used by the golden recorder and the worker harness alike.
 */

/** `structuredClone`, after the HTML spec's algorithm: primitives, wrappers, Date, RegExp, Map, Set, errors, arrays, plain objects, typed arrays and ArrayBuffers, keeping shared and circular references. */
export const STRUCTURED_CLONE_SOURCE = String.raw`
Object.defineProperty(globalThis, 'structuredClone', { writable: true, configurable: true, enumerable: false, value: (function () {
  var toTag = function (v) { return Object.prototype.toString.call(v).slice(8, -1); };
  var dataCloneError = function (v) {
    var text = typeof v === 'function' ? Function.prototype.toString.call(v) : typeof v === 'symbol' ? v.toString() : toTag(v) + ' object';
    var message = text + ' could not be cloned.';
    try { return new DOMException(message, 'DataCloneError'); } catch (e) { var err = new Error(message); err.name = 'DataCloneError'; return err; }
  };
  var ERRORS = { EvalError: EvalError, RangeError: RangeError, ReferenceError: ReferenceError, SyntaxError: SyntaxError, TypeError: TypeError, URIError: URIError };
  function clone(v, seen) {
    if (typeof v === 'symbol' || typeof v === 'function') throw dataCloneError(v);
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return seen.get(v);
    var tag = toTag(v);
    var out;
    switch (tag) {
      case 'Boolean': out = Object(Boolean.prototype.valueOf.call(v)); break;
      case 'Number': out = Object(Number.prototype.valueOf.call(v)); break;
      case 'String': out = Object(String.prototype.valueOf.call(v)); break;
      case 'BigInt': out = Object(BigInt.prototype.valueOf.call(v)); break;
      case 'Date': out = new Date(Date.prototype.getTime.call(v)); break;
      case 'RegExp': out = new RegExp(v.source, v.flags); break;
      case 'ArrayBuffer': out = ArrayBuffer.prototype.slice.call(v, 0); break;
      case 'Map':
        out = new Map(); seen.set(v, out);
        Map.prototype.forEach.call(v, function (x, k) { out.set(clone(k, seen), clone(x, seen)); });
        return out;
      case 'Set':
        out = new Set(); seen.set(v, out);
        Set.prototype.forEach.call(v, function (x) { out.add(clone(x, seen)); });
        return out;
      case 'Error': {
        var Ctor = ERRORS[v.name] || Error;
        out = Object.create(Ctor.prototype); seen.set(v, out);
        var message = Object.getOwnPropertyDescriptor(v, 'message');
        if (message) Object.defineProperty(out, 'message', { value: String(v.message), writable: true, configurable: true, enumerable: false });
        if ('stack' in v) Object.defineProperty(out, 'stack', { value: String(v.stack), writable: true, configurable: true, enumerable: false });
        if (Object.getOwnPropertyDescriptor(v, 'cause')) Object.defineProperty(out, 'cause', { value: clone(v.cause, seen), writable: true, configurable: true, enumerable: false });
        return out;
      }
      case 'Array':
        out = new Array(v.length); seen.set(v, out);
        Object.keys(v).forEach(function (k) { out[k] = clone(v[k], seen); });
        return out;
      case 'Object':
      case 'Arguments':
        out = {}; seen.set(v, out);
        Object.keys(v).forEach(function (k) { out[k] = clone(v[k], seen); });
        return out;
      default:
        if (ArrayBuffer.isView(v) && typeof globalThis[tag] === 'function') { out = new globalThis[tag](v); break; }
        throw dataCloneError(v);
    }
    seen.set(v, out);
    return out;
  }
  return function structuredClone(value) {
    if (arguments.length === 0) throw new TypeError("Failed to execute 'structuredClone' on 'WorkerGlobalScope': 1 argument required, but only 0 present.");
    return clone(value, new Map());
  };
})() });
`;
