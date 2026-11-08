/**
 * Console formatting for the JS runtime (#43): Node's `util.inspect` and
 * `util.format`, and the console methods built on them, as a self-contained
 * script that runs in the worker before the program.
 *
 * JSTutor prints what `node` prints (the decision on #43), so the code follows
 * Node's lib/internal/util/inspect.js and lib/internal/console/constructor.js
 * (v24) rule for rule: the line breaking (80 columns, at most three levels
 * on one line), array grouping in columns, quoting, `<1 empty item>` holes,
 * `<ref *1>` / `[Circular *1]`, class names, `[Getter]`, depth 2, 100 items.
 * Where Node uses V8's internals the script can't reach, it does without:
 *   - a getter is never called (Node doesn't either, by default); neither is a
 *     `toJSON`, nor a `toString` except where Node calls it (`%s`, `%d`, `%j`
 *     on an object with one of its own);
 *   - a Promise's state can't be read synchronously: `Promise { <pending> }`
 *     unless the runtime saw it settle (`hooks.promiseState`, #92);
 *   - a proxy prints as its target (`hooks.proxyTarget`: the runtime keeps
 *     each proxy's target, #88);
 *   - an error prints its `name: message` and the stack frames are left out
 *     (the browser's frames point into instrumented code); the layout is the
 *     one Node gives an error with frames, minus the frame lines;
 *   - a Map or Set iterator's remaining items are unknown.
 * Chrome's DevTools print the same values differently (`(3) [1, 2, 3]`,
 * `{a: 1}`).
 *
 * Like the rest of the runtime, it uses the built-ins as they were before the
 * program ran (primordials.ts, #88): `$push(list, x)` for `list.push(x)`.
 *
 * Exposes `__inspect__(value, options)`, `__formatArgs__(args)` and
 * `__makeConsole__(write)`, which returns the console object; `write(stream,
 * text)` receives each call's text (without its newline).
 *
 * It is a string, not a function's source, because tsx and esbuild's
 * keepNames would add helpers to a function's text that the worker lacks.
 * No backticks or dollar-brace inside.
 */
import { PRIMORDIALS_SOURCE } from './primordials';

export const CONSOLE_SOURCE = String.raw`
var __tutorFormat__ = (function () {
  'use strict';
${PRIMORDIALS_SOURCE}
  // What the runtime tells the console (#87, #92): a promise's state if it saw
  // it settle, a proxy's target, and the clock console.time reads.
  var hooks = { promiseState: null, proxyTarget: null, now: null };
  var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  var getOwnPropertyNames = Object.getOwnPropertyNames;
  var getOwnPropertySymbols = Object.getOwnPropertySymbols;
  var getPrototypeOf = Object.getPrototypeOf;
  var objectKeys = Object.keys;
  var isArray = Array.isArray;
  var call = Function.prototype.call;
  var uncurry = function (fn) { return call.bind(fn); };
  var hasOwn = uncurry(Object.prototype.hasOwnProperty);
  var isEnumerable = uncurry(Object.prototype.propertyIsEnumerable);
  var objectToString = uncurry(Object.prototype.toString);
  var functionToString = function (f) { return Function.prototype.toString.call(f); };
  var nativeFunctionToString = uncurry(Function.prototype.toString);
  var hasInstance = uncurry(Function.prototype[Symbol.hasInstance]);
  var symbolToString = uncurry(Symbol.prototype.toString);
  var getter = function (proto, key) { return uncurry(getOwnPropertyDescriptor(proto, key).get); };
  var mapSize = getter(Map.prototype, 'size');
  var setSize = getter(Set.prototype, 'size');
  var mapForEach = uncurry(Map.prototype.forEach);
  var setForEach = uncurry(Set.prototype.forEach);
  var weakMapHas = uncurry(WeakMap.prototype.has);
  var weakSetHas = uncurry(WeakSet.prototype.has);
  var dateGetTime = uncurry(Date.prototype.getTime);
  var dateToISOString = uncurry(Date.prototype.toISOString);
  var dateToString = uncurry(Date.prototype.toString);
  var regexpSource = getter(RegExp.prototype, 'source');
  var regexpFlags = getter(RegExp.prototype, 'flags');
  var typedArrayProto = getPrototypeOf(Uint8Array.prototype);
  var typedArrayTag = getter(typedArrayProto, Symbol.toStringTag);
  var typedArrayLength = getter(typedArrayProto, 'length');
  var arrayBufferByteLength = getter(ArrayBuffer.prototype, 'byteLength');
  var dataViewByteLength = getter(DataView.prototype, 'byteLength');
  var numberValueOf = uncurry(Number.prototype.valueOf);
  var stringValueOf = uncurry(String.prototype.valueOf);
  var booleanValueOf = uncurry(Boolean.prototype.valueOf);
  var bigintValueOf = typeof BigInt === 'function' ? uncurry(BigInt.prototype.valueOf) : null;
  var symbolValueOf = uncurry(Symbol.prototype.valueOf);
  var jsonStringify = JSON.stringify;
  var StringCtor = String;
  var NumberCtor = Number;
  var parseIntFn = parseInt;
  var parseFloatFn = parseFloat;
  // Node's builtInObjects: the capitalized globals, taken before the program declares any.
  // The global object's own names before the program ran: printing it shows only the program's (a browser worker has own ones, as postMessage, #87).
  var hostGlobalNames = new SafeSet();
  $forEach(getOwnPropertyNames(global), function (name) { hostGlobalNames.add(name); });
  var builtInObjects = new SafeSet();
  $forEach(getOwnPropertyNames(globalThis), function (name) { if ($test(/^[A-Z][a-zA-Z0-9]+$/, name)) builtInObjects.add(name); });

  function brand(check, v) { try { check(v); return true; } catch (e) { return false; } }
  function isMap(v) { return brand(mapSize, v); }
  function isSet(v) { return brand(setSize, v); }
  function isWeakMap(v) { try { weakMapHas(v, {}); return true; } catch (e) { return false; } }
  function isWeakSet(v) { try { weakSetHas(v, {}); return true; } catch (e) { return false; } }
  function isDate(v) { return brand(dateGetTime, v); }
  function isRegExp(v) { return v !== RegExp.prototype && brand(regexpSource, v); }
  function isTypedArray(v) { return typedArrayTag(v) !== undefined; }
  function isArrayBuffer(v) { return brand(arrayBufferByteLength, v); }
  function isDataView(v) { return brand(dataViewByteLength, v); }
  // Object.prototype.toString's tag, unless that would call a program's Symbol.toStringTag getter.
  function tagOf(v) {
    try {
      for (var p = v; p !== null && p !== undefined; p = getPrototypeOf(p)) {
        var d = getOwnPropertyDescriptor(p, Symbol.toStringTag);
        if (!d) continue;
        if (!('value' in d) && !isNative(d.get)) return '';
        break;
      }
      return $slice(objectToString(v), 8, -1);
    } catch (e) { return ''; }
  }
  function isError(v) { return typeof Error.isError === 'function' ? Error.isError(v) : tagOf(v) === 'Error'; }
  function isPromise(v) { return tagOf(v) === 'Promise'; }
  function isArguments(v) { return tagOf(v) === 'Arguments'; }
  function isNative(fn) {
    try { return $test(/\{\s*\[native code\]\s*\}$/, nativeFunctionToString(fn)); } catch (e) { return false; }
  }

  // A property's value without running the program's code: a data property up
  // the chain, or a built-in getter's result; a program's getter gives undefined.
  function safeGet(obj, key) {
    for (var p = obj; p !== null && p !== undefined; p = getPrototypeOf(p)) {
      var d = getOwnPropertyDescriptor(p, key);
      if (!d) continue;
      if ('value' in d) return d.value;
      if (typeof d.get === 'function' && isNative(d.get)) { try { return d.get.call(obj); } catch (e) { return undefined; } }
      return undefined;
    }
    return undefined;
  }
  function functionName(fn) {
    var d = getOwnPropertyDescriptor(fn, 'name');
    return d && 'value' in d ? d.value : '';
  }

  // ── Strings ──
  var META = [];
  for (var c = 0; c < 32; c++) META[c] = '\\x' + (c < 16 ? '0' : '') + c.toString(16).toUpperCase();
  META[8] = '\\b'; META[9] = '\\t'; META[10] = '\\n'; META[12] = '\\f'; META[13] = '\\r';
  META[39] = "\\'"; META[92] = '\\\\';
  for (var c2 = 127; c2 < 160; c2++) META[c2] = '\\x' + c2.toString(16).toUpperCase();

  // A string as Node quotes it: single quotes, else double, else backticks, escaping what needs it.
  function strEscape(str) {
    var quote = "'";
    if ($indexOf(str, "'") !== -1) {
      if ($indexOf(str, '"') === -1) quote = '"';
      else if ($indexOf(str, '\x60') === -1 && $indexOf(str, '$' + '{') === -1) quote = '\x60';
    }
    var result = '';
    var last = 0;
    for (var i = 0; i < str.length; i++) {
      var point = $charCodeAt(str, i);
      if ((point === 39 && quote === "'") || point === 92 || point < 32 || (point > 126 && point < 160)) {
        result += $slice(str, last, i) + META[point];
        last = i + 1;
      } else if (point >= 0xd800 && point <= 0xdfff) {
        if (point <= 0xdbff && i + 1 < str.length) {
          var next = $charCodeAt(str, i + 1);
          if (next >= 0xdc00 && next <= 0xdfff) { i++; continue; }
        }
        result += $slice(str, last, i) + '\\u' + point.toString(16);
        last = i + 1;
      }
    }
    if (last !== str.length) result += $slice(str, last);
    return quote + result + quote;
  }

  // Columns a string takes in a terminal (wide East Asian characters and emoji count 2, combining marks 0).
  function isFullWidth(code) {
    return code >= 0x1100 && (code <= 0x115f || code === 0x2329 || code === 0x232a ||
      (code >= 0x2e80 && code <= 0x3247 && code !== 0x303f) || (code >= 0x3250 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0xa4c6) || (code >= 0xa960 && code <= 0xa97c) || (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe10 && code <= 0xfe19) || (code >= 0xfe30 && code <= 0xfe6b) ||
      (code >= 0xff01 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) || (code >= 0x1b000 && code <= 0x1b001) ||
      (code >= 0x1f200 && code <= 0x1f251) || (code >= 0x1f300 && code <= 0x1f64f) || (code >= 0x1f900 && code <= 0x1f9ff) ||
      (code >= 0x20000 && code <= 0x3fffd));
  }
  function isZeroWidth(code) {
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0x300 && code <= 0x36f) ||
      (code >= 0x200b && code <= 0x200f) || (code >= 0x20d0 && code <= 0x20ff) || (code >= 0xfe00 && code <= 0xfe0f) ||
      (code >= 0xfe20 && code <= 0xfe2f) || (code >= 0xe0100 && code <= 0xe01ef);
  }
  function stringWidth(str) {
    var width = 0;
    for (var i = 0; i < str.length; i++) {
      var code = $codePointAt(str, i);
      if (code > 0xffff) i++;
      if (isFullWidth(code)) width += 2;
      else if (!isZeroWidth(code)) width++;
    }
    return width;
  }

  // ── Primitives ──
  function formatNumber(n) { return n === 0 && 1 / n < 0 ? '-0' : StringCtor(n); }
  function formatPrimitive(value, ctx) {
    var type = typeof value;
    if (type === 'string') {
      var trailer = '';
      if (value.length > ctx.maxStringLength) {
        var remaining = value.length - ctx.maxStringLength;
        value = $slice(value, 0, ctx.maxStringLength);
        trailer = '... ' + remaining + ' more character' + (remaining > 1 ? 's' : '');
      }
      if (value.length > 16 && value.length > ctx.breakLength - ctx.indentationLvl - 4) {
        var pieces = $split(value, /(?<=\n)/);
        if (pieces.length > 1) {
          var sep = ' +\n' + $repeat(' ', ctx.indentationLvl + 2);
          return $join($map(pieces, strEscape), sep) + trailer;
        }
      }
      return strEscape(value) + trailer;
    }
    if (type === 'number') return formatNumber(value);
    if (type === 'bigint') return StringCtor(value) + 'n';
    if (type === 'boolean') return StringCtor(value);
    if (type === 'undefined') return 'undefined';
    return symbolToString(value);
  }

  // ── Names and keys ──
  function getConstructorName(obj, ctx, recurseTimes) {
    // The worker's global object prints as a vm context's does under Node: a plain object of the program's globals.
    if (obj === global) return 'Object';
    var firstProto;
    var tmp = obj;
    while (obj) {
      var d = getOwnPropertyDescriptor(obj, 'constructor');
      if (d !== undefined && typeof d.value === 'function' && functionName(d.value) !== '') {
        var match = false;
        try { match = hasInstance(d.value, tmp); } catch (e) { match = false; }
        if (match) return StringCtor(functionName(d.value));
      }
      obj = getPrototypeOf(obj);
      if (firstProto === undefined) firstProto = obj;
    }
    if (firstProto === null) return null;
    var res = tagOf(tmp) || 'Object';
    if (recurseTimes > ctx.depth && ctx.depth !== null) return res + ' <Complex prototype>';
    var protoConstr = getConstructorName(firstProto, ctx, recurseTimes + 1);
    if (protoConstr === null) return res + ' <' + inspect(firstProto, { depth: -1 }) + '>';
    return res + ' <' + protoConstr + '>';
  }

  function getPrefix(constructor, tag, fallback, size) {
    size = size || '';
    if (constructor === null) {
      if (tag !== '' && fallback !== tag) return '[' + fallback + size + ': null prototype] [' + tag + '] ';
      return '[' + fallback + size + ': null prototype] ';
    }
    if (tag !== '' && constructor !== tag) return constructor + size + ' [' + tag + '] ';
    return constructor + size + ' ';
  }

  function getKeys(value, showHidden) {
    if (value === global) {
      var programKeys = [];
      var own = objectKeys(value);
      for (var g = 0; g < own.length; g++) if (!hostGlobalNames.has(own[g])) $push(programKeys, own[g]);
      return programKeys;
    }
    var keys;
    var symbols = getOwnPropertySymbols(value);
    if (showHidden) {
      keys = getOwnPropertyNames(value);
      if (symbols.length !== 0) keys = $concat(keys, symbols);
    } else {
      keys = objectKeys(value);
      for (var i = 0; i < symbols.length; i++) if (isEnumerable(value, symbols[i])) $push(keys, symbols[i]);
    }
    return keys;
  }

  function isIndex(key) { return $test(/^(0|[1-9][0-9]*)$/, key) && +key <= 4294967294; }
  function getOwnNonIndexProperties(value, showHidden) {
    var names = showHidden ? getOwnPropertyNames(value) : objectKeys(value);
    var out = [];
    for (var i = 0; i < names.length; i++) if (!isIndex(names[i])) $push(out, names[i]);
    var symbols = getOwnPropertySymbols(value);
    for (var j = 0; j < symbols.length; j++) if (showHidden || isEnumerable(value, symbols[j])) $push(out, symbols[j]);
    return out;
  }

  function toStringTag(value) {
    if (value === global) return '';
    var tag = safeGet(value, Symbol.toStringTag);
    if (typeof tag !== 'string') return '';
    // Only list the tag if it isn't an own enumerable property, which is printed anyway.
    if (tag !== '' && isEnumerable(value, Symbol.toStringTag)) return '';
    return tag;
  }

  // ── Objects ──
  var kObjectType = 0;
  var kArrayType = 1;
  var kArrayExtrasType = 2;
  // An error's stack frames: Node prints them, JSTutor can't (they would point into instrumented code). They take part in the layout as one line, removed at the end.
  var FRAME = '    at ';

  function formatValue(ctx, value, recurseTimes, typedArray) {
    if (typeof value !== 'object' && typeof value !== 'function') return formatPrimitive(value, ctx);
    if (value === null) return 'null';
    // A proxy prints as its target, as Node prints it (showProxy off), running none of its traps.
    while (hooks.proxyTarget !== null) {
      var target = hooks.proxyTarget(value);
      if (target === undefined) break;
      if (target === null) return '<Revoked Proxy>';
      value = target;
    }
    if ($indexOf(ctx.seen, value) !== -1) {
      var index = 1;
      if (ctx.circular === undefined) {
        ctx.circular = new SafeMap();
        ctx.circular.set(value, index);
      } else {
        index = ctx.circular.get(value);
        if (index === undefined) {
          index = ctx.circular.size + 1;
          ctx.circular.set(value, index);
        }
      }
      return '[Circular *' + index + ']';
    }
    return formatRaw(ctx, value, recurseTimes, typedArray);
  }

  function formatRaw(ctx, value, recurseTimes, typedArray) {
    var keys;
    var constructor = getConstructorName(value, ctx, recurseTimes);
    var tag = toStringTag(value);
    // A class whose name already says the tag (CountingMap, MapX; not Maps or Map2) isn't tagged again.
    if (tag !== '' && constructor !== null && constructor !== tag) {
      for (var at = $indexOf(constructor, tag); at !== -1; at = $indexOf(constructor, tag, at + 1)) {
        var after = constructor.charAt(at + tag.length);
        if (after === '' || (after >= 'A' && after <= 'Z')) { tag = ''; break; }
      }
    }
    var base = '';
    var formatter = function () { return []; };
    var braces;
    var noIterator = true;
    var extrasType = kObjectType;
    var hasIterator = false;
    try { hasIterator = Symbol.iterator in value; } catch (e) { hasIterator = false; }
    if (hasIterator || constructor === null) {
      noIterator = false;
      if (isArray(value)) {
        var prefix = (constructor !== 'Array' || tag !== '') ? getPrefix(constructor, tag, 'Array', '(' + value.length + ')') : '';
        keys = getOwnNonIndexProperties(value, ctx.showHidden);
        braces = [prefix + '[', ']'];
        if (value.length === 0 && keys.length === 0) return braces[0] + ']';
        extrasType = kArrayExtrasType;
        formatter = formatArray;
      } else if (isSet(value)) {
        var size = setSize(value);
        var setPrefix = getPrefix(constructor, tag, 'Set', '(' + size + ')');
        keys = getKeys(value, ctx.showHidden);
        formatter = formatSet;
        if (size === 0 && keys.length === 0) return setPrefix + '{}';
        braces = [setPrefix + '{', '}'];
      } else if (isMap(value)) {
        var msize = mapSize(value);
        var mapPrefix = getPrefix(constructor, tag, 'Map', '(' + msize + ')');
        keys = getKeys(value, ctx.showHidden);
        formatter = formatMap;
        if (msize === 0 && keys.length === 0) return mapPrefix + '{}';
        braces = [mapPrefix + '{', '}'];
      } else if (isTypedArray(value)) {
        keys = getOwnNonIndexProperties(value, ctx.showHidden);
        var fallback = '';
        if (constructor === null) fallback = typedArrayTag(value);
        var tlen = typedArrayLength(value);
        var tprefix = getPrefix(constructor, tag, fallback, '(' + tlen + ')');
        braces = [tprefix + '[', ']'];
        if (tlen === 0 && keys.length === 0 && !ctx.showHidden) return braces[0] + ']';
        formatter = formatTypedArray;
        extrasType = kArrayExtrasType;
      } else if (tag === 'Map Iterator' || tag === 'Set Iterator') {
        keys = getKeys(value, ctx.showHidden);
        braces = ['[' + tag + '] {', '}'];
        formatter = function () { return ['<items unknown>']; };
      } else {
        noIterator = true;
      }
    }
    if (noIterator) {
      keys = getKeys(value, ctx.showHidden);
      braces = ['{', '}'];
      if (typeof value === 'function') {
        base = getFunctionBase(value, constructor, tag);
        if (keys.length === 0) return base;
      } else if (constructor === 'Object') {
        if (isArguments(value)) braces[0] = '[Arguments] {';
        else if (tag !== '') braces[0] = getPrefix(constructor, tag, 'Object') + '{';
        if (keys.length === 0) return braces[0] + '}';
      } else if (isRegExp(value)) {
        base = '/' + regexpSource(value) + '/' + regexpFlags(value);
        var rprefix = getPrefix(constructor, tag, 'RegExp');
        if (rprefix !== 'RegExp ') base = rprefix + base;
        if (keys.length === 0 || (recurseTimes > ctx.depth && ctx.depth !== null)) return base;
      } else if (isDate(value)) {
        base = isNaN(dateGetTime(value)) ? dateToString(value) : dateToISOString(value);
        var dprefix = getPrefix(constructor, tag, 'Date');
        if (dprefix !== 'Date ') base = dprefix + base;
        if (keys.length === 0) return base;
      } else if (isError(value)) {
        base = formatError(value, constructor, tag, ctx, keys);
        if (keys.length === 0) return base;
      } else if (isArrayBuffer(value)) {
        var aprefix = getPrefix(constructor, tag, 'ArrayBuffer');
        if (typedArray === undefined) formatter = formatArrayBuffer;
        else if (keys.length === 0) return aprefix + '{ byteLength: ' + formatNumber(arrayBufferByteLength(value)) + ' }';
        braces[0] = aprefix + '{';
        $unshift(keys, 'byteLength');
      } else if (isDataView(value)) {
        braces[0] = getPrefix(constructor, tag, 'DataView') + '{';
        $unshift(keys, 'byteLength', 'byteOffset', 'buffer');
      } else if (isPromise(value)) {
        braces[0] = getPrefix(constructor, tag, 'Promise') + '{';
        formatter = formatPromise;
      } else if (isWeakSet(value)) {
        braces[0] = getPrefix(constructor, tag, 'WeakSet') + '{';
        formatter = function () { return ['<items unknown>']; };
      } else if (isWeakMap(value)) {
        braces[0] = getPrefix(constructor, tag, 'WeakMap') + '{';
        formatter = function () { return ['<items unknown>']; };
      } else if (isBoxed(value)) {
        base = getBoxedBase(value, ctx, keys, constructor, tag);
        if (keys.length === 0) return base;
      } else {
        if (keys.length === 0) return getPrefix(constructor, tag, 'Object') + '{}';
        braces[0] = getPrefix(constructor, tag, 'Object') + '{';
      }
    }
    if (recurseTimes > ctx.depth && ctx.depth !== null) {
      var name = $slice(getPrefix(constructor, tag, 'Object'), 0, -1);
      if (constructor !== null) name = '[' + name + ']';
      return name;
    }
    recurseTimes += 1;
    $push(ctx.seen, value);
    ctx.currentDepth = recurseTimes;
    var output;
    try {
      output = formatter(ctx, value, recurseTimes);
      for (var i = 0; i < keys.length; i++) $push(output, formatProperty(ctx, value, recurseTimes, keys[i], extrasType));
    } catch (err) {
      $pop(ctx.seen);
      return '[' + (constructor || 'Object') + ': Inspection interrupted]';
    }
    if (ctx.circular !== undefined) {
      var index = ctx.circular.get(value);
      if (index !== undefined) {
        var reference = '<ref *' + index + '>';
        base = base === '' ? reference : reference + ' ' + base;
      }
    }
    $pop(ctx.seen);
    return reduceToSingleString(ctx, output, base, braces, extrasType, recurseTimes, value);
  }

  function getFunctionBase(value, constructor, tag) {
    var stringified = '';
    try { stringified = functionToString(value); } catch (e) { stringified = ''; }
    if ($slice(stringified, 0, 5) === 'class' && $slice(stringified, -1) === '}') {
      var slice = $slice(stringified, 5, -1);
      var bracketIndex = $indexOf(slice, '{');
      if (bracketIndex !== -1 && ($indexOf($slice(slice, 0, bracketIndex), '(') === -1 ||
          $test(/^\s*(?:[^{]*?\s)?extends\s/, $replace(slice, /(\/\/.*?\n)|(\/\*(.|\n)*?\*\/)/g, '')))) {
        return getClassBase(value, constructor, tag);
      }
    }
    var type = 'Function';
    var fnTag = tagOf(value);
    if (fnTag === 'GeneratorFunction') type = 'GeneratorFunction';
    else if (fnTag === 'AsyncFunction') type = 'AsyncFunction';
    else if (fnTag === 'AsyncGeneratorFunction') type = 'AsyncGeneratorFunction';
    var base = '[' + type;
    if (constructor === null) base += ' (null prototype)';
    var name = functionName(value);
    if (name === '') base += ' (anonymous)';
    else base += ': ' + name;
    base += ']';
    if (constructor !== type && constructor !== null) base += ' ' + constructor;
    if (tag !== '' && constructor !== tag) base += ' [' + tag + ']';
    return base;
  }

  function getClassBase(value, constructor, tag) {
    var name = (hasOwn(value, 'name') && functionName(value)) || '(anonymous)';
    var base = 'class ' + name;
    if (constructor !== 'Function' && constructor !== null) base += ' [' + constructor + ']';
    if (tag !== '' && constructor !== tag) base += ' [' + tag + ']';
    if (constructor !== null) {
      var superName = functionName(getPrototypeOf(value) || {});
      if (superName) base += ' extends ' + superName;
    } else {
      base += ' extends [null prototype]';
    }
    return '[' + base + ']';
  }

  function isBoxed(v) {
    return brand(numberValueOf, v) || brand(stringValueOf, v) || brand(booleanValueOf, v) ||
      (bigintValueOf !== null && brand(bigintValueOf, v)) || brand(symbolValueOf, v);
  }
  function getBoxedBase(value, ctx, keys, constructor, tag) {
    var fn;
    var type;
    if (brand(numberValueOf, value)) { fn = numberValueOf; type = 'Number'; }
    else if (brand(stringValueOf, value)) { fn = stringValueOf; type = 'String'; $splice(keys, 0, stringValueOf(value).length); }
    else if (brand(booleanValueOf, value)) { fn = booleanValueOf; type = 'Boolean'; }
    else if (bigintValueOf !== null && brand(bigintValueOf, value)) { fn = bigintValueOf; type = 'BigInt'; }
    else { fn = symbolValueOf; type = 'Symbol'; }
    var base = '[' + type;
    if (type !== constructor) base += constructor === null ? ' (null prototype)' : ' (' + constructor + ')';
    base += ': ' + formatPrimitive(fn(value), { maxStringLength: Infinity, breakLength: Infinity, indentationLvl: 0 }) + ']';
    if (tag !== '' && tag !== constructor) base += ' [' + tag + ']';
    return base;
  }

  // Error.prototype.toString, from data properties: what V8's stack starts with.
  function errorHeader(err) {
    var name = safeGet(err, 'name');
    var message = safeGet(err, 'message');
    name = name === undefined ? 'Error' : StringCtor(name);
    message = message === undefined ? '' : StringCtor(message);
    if (name === '') return message;
    if (message === '') return name;
    return name + ': ' + message;
  }

  function formatError(err, constructor, tag, ctx, keys) {
    var nameValue = safeGet(err, 'name');
    var name = nameValue != null ? StringCtor(nameValue) : 'Error';
    // An error with no stack frames (one V8 made in a callback, as Promise.any's AggregateError) is bracketed, as Node prints it.
    var stack = errorHeader(err) + (hasStackFrames(err) ? '\n' + FRAME : '');
    // Node leaves out name, message and stack when the stack already shows them.
    $forEach(['name', 'message', 'stack'], function (key) {
      var index = $indexOf(keys, key);
      if (index !== -1) {
        var v = safeGet(err, key);
        if (typeof v !== 'string' || $indexOf(stack, v) !== -1) $splice(keys, index, 1);
      }
    });
    if ('cause' in err && $indexOf(keys, 'cause') === -1) $push(keys, 'cause');
    if (isArray(safeGet(err, 'errors')) && $indexOf(keys, 'errors') === -1) $push(keys, 'errors');
    stack = improveStack(stack, constructor, name, tag);
    var message = safeGet(err, 'message');
    var pos = (message && $indexOf(stack, message)) || -1;
    if (pos !== -1) pos += message.length;
    if ($indexOf(stack, '\n    at', pos) === -1) stack = '[' + stack + ']';
    if (ctx.indentationLvl !== 0) stack = $replace(stack, /\n/g, '\n' + $repeat(' ', ctx.indentationLvl));
    return stack;
  }

  // Whether the error's stack names a frame: V8's ("    at "), or another browser's ("f@file:1:2").
  function hasStackFrames(err) {
    var stack = safeGet(err, 'stack');
    if (typeof stack !== 'string') return true;
    return $indexOf(stack, '\n    at ') !== -1 || $test(/@[^\n]*:\d+:\d+/, stack);
  }

  function improveStack(stack, constructor, name, tag) {
    var len = name.length;
    if (constructor === null || ($slice(name, -5) === 'Error' && $slice(stack, 0, len) === name &&
        (stack.length === len || stack[len] === ':' || stack[len] === '\n'))) {
      var fallback = 'Error';
      if (constructor === null) {
        var start = $exec(/^([A-Z][a-z_ A-Z0-9[\]()-]+)(?::|\n\s+at)/, stack) || $exec(/^([a-z_A-Z0-9-]*Error)$/, stack);
        fallback = (start && start[1]) || '';
        len = fallback.length;
        fallback = fallback || 'Error';
      }
      var prototype = $slice(getPrefix(constructor, tag, fallback), 0, -1);
      if (name !== prototype) {
        if ($indexOf(prototype, name) !== -1) {
          if (len === 0) stack = prototype + ': ' + stack;
          else stack = prototype + $slice(stack, len);
        } else {
          stack = prototype + ' [' + name + ']' + $slice(stack, len);
        }
      }
    }
    return stack;
  }

  function formatArray(ctx, value, recurseTimes) {
    var valLen = value.length;
    var len = Math.min(Math.max(0, ctx.maxArrayLength), valLen);
    var remaining = valLen - len;
    var output = [];
    for (var i = 0; i < len; i++) {
      if (!hasOwn(value, i)) return formatSpecialArray(ctx, value, recurseTimes, len, output, i);
      $push(output, formatProperty(ctx, value, recurseTimes, i, kArrayType));
    }
    if (remaining > 0) $push(output, remainingText(remaining));
    return output;
  }
  function remainingText(remaining) { return '... ' + remaining + ' more item' + (remaining > 1 ? 's' : ''); }

  function formatSpecialArray(ctx, value, recurseTimes, maxLength, output, i) {
    var keys = objectKeys(value);
    var index = i;
    for (; i < keys.length && output.length < maxLength; i++) {
      var key = keys[i];
      var tmp = +key;
      if (tmp > 4294967294) break;
      if (StringCtor(index) !== key) {
        if (!$test(/^(0|[1-9][0-9]*)$/, key)) break;
        var emptyItems = tmp - index;
        $push(output, '<' + emptyItems + ' empty item' + (emptyItems > 1 ? 's' : '') + '>');
        index = tmp;
        if (output.length === maxLength) break;
      }
      $push(output, formatProperty(ctx, value, recurseTimes, key, kArrayType));
      index++;
    }
    var remaining = value.length - index;
    if (output.length !== maxLength) {
      if (remaining > 0) $push(output, '<' + remaining + ' empty item' + (remaining > 1 ? 's' : '') + '>');
    } else if (remaining > 0) {
      $push(output, remainingText(remaining));
    }
    return output;
  }

  function formatTypedArray(ctx, value) {
    var length = typedArrayLength(value);
    var maxLength = Math.min(Math.max(0, ctx.maxArrayLength), length);
    var remaining = length - maxLength;
    var output = [];
    for (var i = 0; i < maxLength; ++i) {
      var v = value[i];
      $push(output, typeof v === 'number' ? formatNumber(v) : StringCtor(v) + 'n');
    }
    if (remaining > 0) $push(output, remainingText(remaining));
    return output;
  }

  function formatArrayBuffer(ctx, value) {
    var bytes = new Uint8Array(value);
    var hex = [];
    var n = Math.min(ctx.maxArrayLength, bytes.length);
    for (var i = 0; i < n; i++) $push(hex, (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16));
    var str = $join(hex, ' ');
    var remaining = bytes.length - ctx.maxArrayLength;
    if (remaining > 0) str += ' ... ' + remaining + ' more byte' + (remaining > 1 ? 's' : '');
    return ['[Uint8Contents]: <' + str + '>'];
  }

  function formatSet(ctx, value, recurseTimes) {
    var length = setSize(value);
    var maxLength = Math.min(Math.max(0, ctx.maxArrayLength), length);
    var remaining = length - maxLength;
    var output = [];
    ctx.indentationLvl += 2;
    var i = 0;
    setForEach(value, function (v) {
      if (i >= maxLength) return;
      $push(output, formatValue(ctx, v, recurseTimes));
      i++;
    });
    if (remaining > 0) $push(output, remainingText(remaining));
    ctx.indentationLvl -= 2;
    return output;
  }

  function formatMap(ctx, value, recurseTimes) {
    var length = mapSize(value);
    var maxLength = Math.min(Math.max(0, ctx.maxArrayLength), length);
    var remaining = length - maxLength;
    var output = [];
    ctx.indentationLvl += 2;
    var i = 0;
    mapForEach(value, function (v, k) {
      if (i >= maxLength) return;
      $push(output, formatValue(ctx, k, recurseTimes) + ' => ' + formatValue(ctx, v, recurseTimes));
      i++;
    });
    if (remaining > 0) $push(output, remainingText(remaining));
    ctx.indentationLvl -= 2;
    return output;
  }

  function formatPromise(ctx, value, recurseTimes) {
    var state = hooks.promiseState !== null ? hooks.promiseState(value) : undefined;
    if (!state) return ['<pending>'];
    ctx.indentationLvl += 2;
    var str = formatValue(ctx, state.value, recurseTimes);
    ctx.indentationLvl -= 2;
    return [state.rejected ? '<rejected> ' + str : str];
  }

  function formatProperty(ctx, value, recurseTimes, key, type) {
    var name;
    var str;
    // (A key with no own property is one Node adds, like an ArrayBuffer's byteLength: shown as hidden.)
    var desc = getOwnPropertyDescriptor(value, key) || { value: value[key], enumerable: false };
    if (desc.value !== undefined) {
      ctx.indentationLvl += 2;
      str = formatValue(ctx, desc.value, recurseTimes);
      ctx.indentationLvl -= 2;
    } else if (desc.get !== undefined) {
      str = desc.set !== undefined ? '[Getter/Setter]' : '[Getter]';
    } else if (desc.set !== undefined) {
      str = '[Setter]';
    } else {
      str = 'undefined';
    }
    if (type === kArrayType) return str;
    if (typeof key === 'symbol') {
      name = $replace(symbolToString(key), /[\x00-\x1f\x27\x5c\x7f-\x9f]/g, function (ch) { return META[$charCodeAt(ch, 0)]; });
    } else if (key === '__proto__') {
      name = "['__proto__']";
    } else if (desc.enumerable === false) {
      name = '[' + $replace(key, /[\x00-\x1f\x27\x5c\x7f-\x9f]/g, function (ch) { return META[$charCodeAt(ch, 0)]; }) + ']';
    } else if ($test(/^[a-zA-Z_][a-zA-Z_0-9]*$/, key)) {
      name = key;
    } else {
      name = strEscape(key);
    }
    return name + ': ' + str;
  }

  function groupArrayElements(ctx, output, value) {
    var totalLength = 0;
    var maxLength = 0;
    var i = 0;
    var outputLength = output.length;
    if (ctx.maxArrayLength < output.length) outputLength--;
    var separatorSpace = 2;
    var dataLen = new Array(outputLength);
    for (; i < outputLength; i++) {
      var len = stringWidth(output[i]);
      dataLen[i] = len;
      totalLength += len + separatorSpace;
      if (maxLength < len) maxLength = len;
    }
    var actualMax = maxLength + separatorSpace;
    if (actualMax * 3 + ctx.indentationLvl < ctx.breakLength &&
        (totalLength / actualMax > 5 || maxLength <= 6)) {
      var approxCharHeights = 2.5;
      var averageBias = Math.sqrt(actualMax - totalLength / output.length);
      var biasedMax = Math.max(actualMax - 3 - averageBias, 1);
      var columns = Math.min(
        Math.round(Math.sqrt(approxCharHeights * biasedMax * outputLength) / biasedMax),
        Math.floor((ctx.breakLength - ctx.indentationLvl) / actualMax),
        ctx.compact * 4,
        15
      );
      if (columns <= 1) return output;
      var tmp = [];
      var maxLineLength = [];
      for (var col = 0; col < columns; col++) {
        var lineLength = 0;
        for (var j = col; j < output.length; j += columns) if (dataLen[j] > lineLength) lineLength = dataLen[j];
        $push(maxLineLength, lineLength + separatorSpace);
      }
      var padStart = true;
      if (value !== undefined) {
        for (var k = 0; k < output.length; k++) {
          var d = getOwnPropertyDescriptor(value, k);
          var item = d && 'value' in d ? d.value : undefined;
          if (typeof item !== 'number' && typeof item !== 'bigint') { padStart = false; break; }
        }
      }
      for (var row = 0; row < outputLength; row += columns) {
        var max = Math.min(row + columns, outputLength);
        var str = '';
        var m = row;
        for (; m < max - 1; m++) {
          var padding = maxLineLength[m - row] + output[m].length - dataLen[m];
          str += padStart ? $padStart((output[m] + ', '), padding, ' ') : $padEnd((output[m] + ', '), padding, ' ');
        }
        if (padStart) {
          var lastPadding = maxLineLength[m - row] + output[m].length - dataLen[m] - separatorSpace;
          str += $padStart(output[m], lastPadding, ' ');
        } else {
          str += output[m];
        }
        $push(tmp, str);
      }
      if (ctx.maxArrayLength < output.length) $push(tmp, output[outputLength]);
      output = tmp;
    }
    return output;
  }

  function isBelowBreakLength(ctx, output, start, base) {
    var totalLength = output.length + start;
    if (totalLength + output.length > ctx.breakLength) return false;
    for (var i = 0; i < output.length; i++) {
      totalLength += output[i].length;
      if (totalLength > ctx.breakLength) return false;
    }
    return base === '' || $indexOf(base, '\n') === -1;
  }

  function reduceToSingleString(ctx, output, base, braces, extrasType, recurseTimes, value) {
    var entries = output.length;
    if (extrasType === kArrayExtrasType && entries > 6) output = groupArrayElements(ctx, output, value);
    if (ctx.currentDepth - recurseTimes < ctx.compact && entries === output.length) {
      var start = output.length + ctx.indentationLvl + braces[0].length + base.length + 10;
      if (isBelowBreakLength(ctx, output, start, base)) {
        var joined = $join(output, ', ');
        if ($indexOf(joined, '\n') === -1) return (base ? base + ' ' : '') + braces[0] + ' ' + joined + ' ' + braces[1];
      }
    }
    var indentation = '\n' + $repeat(' ', ctx.indentationLvl);
    return (base ? base + ' ' : '') + braces[0] + indentation + '  ' + $join(output, ',' + indentation + '  ') + indentation + braces[1];
  }

  // ── Entry points ──
  function inspect(value, opts) {
    opts = opts || {};
    var ctx = {
      seen: [],
      indentationLvl: 0,
      currentDepth: 0,
      circular: undefined,
      depth: opts.depth === undefined ? 2 : opts.depth,
      showHidden: !!opts.showHidden,
      maxArrayLength: opts.maxArrayLength === undefined ? 100 : (opts.maxArrayLength === null ? Infinity : opts.maxArrayLength),
      maxStringLength: opts.maxStringLength === undefined ? 10000 : (opts.maxStringLength === null ? Infinity : opts.maxStringLength),
      breakLength: opts.breakLength === undefined ? 80 : opts.breakLength,
      compact: 3,
    };
    if (ctx.depth === Infinity) ctx.depth = null;
    var text;
    try {
      text = formatValue(ctx, value, 0);
    } catch (e) {
      text = '[object]';
    }
    return $indexOf(text, '') === -1 ? text : $replace(text, /\n *at /g, '');
  }

  // For %s, whether an object is inspected (true) or printed by String() (false): String() when the program gave it a toString or Symbol.toPrimitive of its own.
  function isBuiltInOwner(owner) {
    var d = getOwnPropertyDescriptor(owner, 'constructor');
    return d !== undefined && typeof d.value === 'function' && builtInObjects.has(functionName(d.value));
  }
  function hasBuiltInToString(value) {
    for (var p = value; p !== null; p = getPrototypeOf(p)) {
      if (hasOwn(p, Symbol.toPrimitive)) { if (!isBuiltInOwner(p)) return false; break; }
    }
    var toStr;
    try { toStr = value.toString; } catch (e) { return true; }
    if (typeof toStr !== 'function') return true;
    if (hasOwn(value, 'toString')) return false;
    var pointer = value;
    do { pointer = getPrototypeOf(pointer); } while (pointer !== null && !hasOwn(pointer, 'toString'));
    if (pointer === null) return true;
    return isBuiltInOwner(pointer);
  }

  function tryStringify(arg) {
    try { return jsonStringify(arg); } catch (err) {
      if (err && $test(/circular/i, StringCtor(err.message))) return '[Circular]';
      throw err;
    }
  }

  // util.format: printf-style substitutions in a first string argument, then the rest, inspected and joined by spaces.
  function formatArgs(args, inspectOptions) {
    var first = args[0];
    var a = 0;
    var str = '';
    var join = '';
    if (typeof first === 'string') {
      if (args.length === 1) return first;
      var tempStr;
      var lastPos = 0;
      for (var i = 0; i < first.length - 1; i++) {
        if ($charCodeAt(first, i) === 37) {
          var nextChar = $charCodeAt(first, ++i);
          if (a + 1 !== args.length) {
            switch (nextChar) {
              case 115: {
                var tempArg = args[++a];
                if (typeof tempArg === 'number') tempStr = formatNumber(tempArg);
                else if (typeof tempArg === 'bigint') tempStr = StringCtor(tempArg) + 'n';
                else if (typeof tempArg !== 'object' || tempArg === null || !hasBuiltInToString(tempArg)) tempStr = StringCtor(tempArg);
                else tempStr = inspect(tempArg, { depth: 0 });
                break;
              }
              case 106:
                tempStr = tryStringify(args[++a]);
                break;
              case 100: {
                var tempNum = args[++a];
                if (typeof tempNum === 'bigint') tempStr = StringCtor(tempNum) + 'n';
                else if (typeof tempNum === 'symbol') tempStr = 'NaN';
                else tempStr = formatNumber(NumberCtor(tempNum));
                break;
              }
              case 79:
                tempStr = inspect(args[++a], inspectOptions);
                break;
              case 111:
                tempStr = inspect(args[++a], { showHidden: true, depth: 4 });
                break;
              case 105: {
                var tempInteger = args[++a];
                if (typeof tempInteger === 'bigint') tempStr = StringCtor(tempInteger) + 'n';
                else if (typeof tempInteger === 'symbol') tempStr = 'NaN';
                else tempStr = formatNumber(parseIntFn(tempInteger));
                break;
              }
              case 102: {
                var tempFloat = args[++a];
                if (typeof tempFloat === 'symbol') tempStr = 'NaN';
                else tempStr = formatNumber(parseFloatFn(tempFloat));
                break;
              }
              case 99:
                a += 1;
                tempStr = '';
                break;
              case 37:
                str += $slice(first, lastPos, i);
                lastPos = i + 1;
                continue;
              default:
                continue;
            }
            if (lastPos !== i - 1) str += $slice(first, lastPos, i - 1);
            str += tempStr;
            lastPos = i + 1;
          } else if (nextChar === 37) {
            str += $slice(first, lastPos, i);
            lastPos = i + 1;
          }
        }
      }
      if (lastPos !== 0) {
        a++;
        join = ' ';
        if (lastPos < first.length) str += $slice(first, lastPos);
      }
    }
    while (a < args.length) {
      var value = args[a];
      str += join;
      str += typeof value !== 'string' ? inspect(value, inspectOptions) : value;
      join = ' ';
      a++;
    }
    return str;
  }

  // ── console.table (Node 24's cli_table: left-aligned cells) ──
  function renderRow(row, columnWidths) {
    var out = '│ ';
    for (var i = 0; i < row.length; i++) {
      var cell = row[i];
      out += cell + $repeat(' ', columnWidths[i] - stringWidth(cell));
      if (i !== row.length - 1) out += ' │ ';
    }
    return out + ' │';
  }
  function renderTable(head, columns) {
    var rows = [];
    var columnWidths = $map(head, stringWidth);
    var longestColumn = Math.max.apply(null, $map(columns, function (a) { return a.length; }));
    for (var i = 0; i < head.length; i++) {
      var column = columns[i];
      for (var j = 0; j < longestColumn; j++) {
        if (rows[j] === undefined) rows[j] = [];
        var value = rows[j][i] = hasOwn(column, j) ? column[j] : '';
        columnWidths[i] = Math.max(columnWidths[i] || 0, stringWidth(value));
      }
    }
    var divider = $map(columnWidths, function (w) { return $repeat('─', w + 2); });
    var result = '┌' + $join(divider, '┬') + '┐\n' + renderRow(head, columnWidths) + '\n' + '├' + $join(divider, '┼') + '┤\n';
    for (var r = 0; r < rows.length; r++) result += renderRow(rows[r], columnWidths) + '\n';
    return result + '└' + $join(divider, '┴') + '┘';
  }
  function tableText(tabularData, properties) {
    var _inspect = function (v) {
      var depth = v !== null && typeof v === 'object' && !isArray(v) && objectKeys(v).length > 2 ? -1 : 0;
      return inspect(v, { depth: depth, maxArrayLength: 3, breakLength: Infinity });
    };
    var getIndexArray = function (length) { var out = []; for (var i = 0; i < length; i++) $push(out, _inspect(i)); return out; };
    if (isMap(tabularData)) {
      var keys = [];
      var values = [];
      mapForEach(tabularData, function (v, k) { $push(keys, _inspect(k)); $push(values, _inspect(v)); });
      return renderTable(['(iteration index)', 'Key', 'Values'], [getIndexArray(keys.length), keys, values]);
    }
    if (isSet(tabularData)) {
      var setValues = [];
      setForEach(tabularData, function (v) { $push(setValues, _inspect(v)); });
      return renderTable(['(iteration index)', 'Values'], [getIndexArray(setValues.length), setValues]);
    }
    var map = Object.create(null);
    var hasPrimitives = false;
    var valuesKeyArray = [];
    var indexKeyArray = objectKeys(tabularData);
    for (var i = 0; i < indexKeyArray.length; i++) {
      var item = tabularData[indexKeyArray[i]];
      var primitive = item === null || (typeof item !== 'function' && typeof item !== 'object');
      if (properties === undefined && primitive) {
        hasPrimitives = true;
        valuesKeyArray[i] = _inspect(item);
      } else {
        var itemKeys = properties || objectKeys(item);
        for (var k = 0; k < itemKeys.length; k++) {
          var key = itemKeys[k];
          if (map[key] === undefined) map[key] = [];
          if ((primitive && properties) || !hasOwn(item, key)) map[key][i] = '';
          else map[key][i] = _inspect(item[key]);
        }
      }
    }
    var head = objectKeys(map);
    var columns = $map(head, function (key) { return map[key]; });
    if (hasPrimitives) { $push(head, 'Values'); $push(columns, valuesKeyArray); }
    $unshift(head, '(index)');
    $unshift(columns, indexKeyArray);
    return renderTable(head, columns);
  }

  // console.time's elapsed time, as Node formats it.
  function formatTime(ms) {
    var hours = 0;
    var minutes = 0;
    var seconds = 0;
    if (ms >= 1000) {
      if (ms >= 60000) {
        if (ms >= 3600000) { hours = Math.floor(ms / 3600000); ms = ms % 3600000; }
        minutes = Math.floor(ms / 60000);
        ms = ms % 60000;
      }
      seconds = ms / 1000;
    }
    var pad = function (v) { return $slice(('0' + v), -2); };
    if (hours !== 0 || minutes !== 0) {
      var parts = $split($toFixed(seconds, 3), '.');
      var res = hours !== 0 ? hours + ':' + pad(minutes) : minutes;
      return res + ':' + pad(parts[0]) + '.' + parts[1] + ' (' + (hours !== 0 ? 'h:m' : '') + 'm:ss.mmm)';
    }
    if (seconds !== 0) return $toFixed(seconds, 3) + 's';
    return NumberCtor($toFixed(ms, 3)) + 'ms';
  }

  // The console the program sees: each method writes its text through write(stream, text), as Node's Console does.
  function makeConsole(write) {
    var groupIndent = '';
    var counts = new SafeMap();
    var timers = new SafeMap();
    var hostNow = typeof performance !== 'undefined' && performance.now ? uncurryThis(performance.now) : null;
    var now = function () { return hooks.now !== null ? hooks.now() : hostNow !== null ? hostNow(performance) : Date.now(); };
    var out = function (stream, text) {
      if (groupIndent.length !== 0) text = groupIndent + $replace(text, /\n/g, '\n' + groupIndent);
      write(stream, text);
    };
    var con = {
      log: function () { out('stdout', formatArgs(arguments)); },
      warn: function () { out('stderr', formatArgs(arguments)); },
      dir: function (object, options) { out('stdout', inspect(object, options || {})); },
      time: function (label) {
        label = label === undefined ? 'default' : StringCtor(label);
        if (!timers.has(label)) timers.set(label, now());
      },
      timeEnd: function (label) {
        label = label === undefined ? 'default' : StringCtor(label);
        if (!timers.has(label)) return;
        out('stdout', label + ': ' + formatTime(now() - timers.get(label)));
        timers.delete(label);
      },
      timeLog: function (label) {
        label = label === undefined ? 'default' : StringCtor(label);
        if (!timers.has(label)) return;
        var data = $slice(arguments, 1);
        out('stdout', label + ': ' + formatTime(now() - timers.get(label)) + (data.length ? ' ' + formatArgs(data) : ''));
      },
      trace: function () {
        var text = formatArgs(arguments);
        out('stderr', 'Trace' + (text ? ': ' + text : ''));
      },
      assert: function (expression) {
        if (!expression) {
          var args = $slice(arguments, 1);
          if (args.length !== 0 && typeof args[0] === 'string') args[0] = 'Assertion failed: ' + args[0];
          else $unshift(args, 'Assertion failed');
          out('stderr', formatArgs(args));
        }
      },
      clear: function () {},
      count: function (label) {
        label = label === undefined ? 'default' : StringCtor(label);
        var n = (counts.get(label) || 0) + 1;
        counts.set(label, n);
        out('stdout', label + ': ' + n);
      },
      countReset: function (label) {
        label = label === undefined ? 'default' : StringCtor(label);
        counts.delete(label);
      },
      group: function () {
        if (arguments.length > 0) out('stdout', formatArgs(arguments));
        groupIndent += '  ';
      },
      groupEnd: function () { groupIndent = $slice(groupIndent, 0, groupIndent.length - 2); },
      table: function (tabularData, properties) {
        if (tabularData === null || typeof tabularData !== 'object') { out('stdout', formatArgs([tabularData])); return; }
        out('stdout', tableText(tabularData, properties));
      },
    };
    con.info = con.log;
    con.debug = con.log;
    con.dirxml = con.log;
    con.error = con.warn;
    con.groupCollapsed = con.group;
    return con;
  }

  return { inspect: inspect, formatArgs: formatArgs, makeConsole: makeConsole, hooks: hooks };
})();
var __inspect__ = __tutorFormat__.inspect;
var __formatArgs__ = __tutorFormat__.formatArgs;
var __makeConsole__ = __tutorFormat__.makeConsole;
`;
