/**
 * The built-ins the JS runtime uses, captured when it loads, before the
 * program runs (#87, #88), as Node's own code uses "primordials".
 *
 * The program's top-level `let`, `const` and `class` declarations share the
 * global scope with every script the worker runs, and its functions and
 * `var`s are properties of the global object, so a program declaring
 * `class Date`, `const Math` or `function Map` would otherwise change what
 * the runtime's code finds. Each global the runtime uses is a local variable
 * of the same name here, so it keeps the browser's own. And a program can
 * replace a built-in's methods (`Array.prototype.push = …`, a polyfill of
 * `String.prototype.startsWith`): the runtime calls the methods it needs
 * through the helpers below (`$push(list, x)` for `list.push(x)`), which are
 * the browser's own methods taken before the program ran, and its maps and
 * sets (`new SafeMap()`) have those methods as their own.
 *
 * A string included at the top of a function's body (the runtime's, and the
 * console's in inspect.ts). No backticks or dollar-brace inside.
 */
export const PRIMORDIALS_SOURCE = String.raw`
  var global = globalThis;
  var Object = global.Object, Array = global.Array, Function = global.Function, String = global.String;
  var Number = global.Number, Boolean = global.Boolean, Symbol = global.Symbol, BigInt = global.BigInt;
  var Math = global.Math, JSON = global.JSON, Reflect = global.Reflect, Proxy = global.Proxy, Promise = global.Promise;
  var Map = global.Map, Set = global.Set, WeakMap = global.WeakMap, WeakSet = global.WeakSet;
  var Date = global.Date, RegExp = global.RegExp, Error = global.Error, TypeError = global.TypeError;
  var ArrayBuffer = global.ArrayBuffer, DataView = global.DataView, Uint8Array = global.Uint8Array;
  var parseInt = global.parseInt, parseFloat = global.parseFloat, isNaN = global.isNaN;
  var ReflectApply = Reflect.apply;
  var uncurryThis = function (fn) { return Function.prototype.call.bind(fn); };
  var ArrayPrototype = Array.prototype, StringPrototype = String.prototype;
  var ArrayPrototypeSlice = uncurryThis(ArrayPrototype.slice);
  var ArrayPrototypeIndexOf = uncurryThis(ArrayPrototype.indexOf);
  var StringPrototypeSlice = uncurryThis(StringPrototype.slice);
  var StringPrototypeIndexOf = uncurryThis(StringPrototype.indexOf);
  var RegExpPrototypeExec = uncurryThis(RegExp.prototype.exec);
  // A method of either a string or an array, by what it is called on.
  var stringOrArray = function (forString, forArray) {
    return function (receiver) {
      return ReflectApply(typeof receiver === 'string' ? forString : forArray, receiver, ArrayPrototypeSlice(arguments, 1));
    };
  };
  var arrayMethod = function (fn) { return function (receiver) { return ReflectApply(fn, receiver, ArrayPrototypeSlice(arguments, 1)); }; };
  var $push = function (list, value) {
    if (arguments.length === 2) { list[list.length] = value; return list.length; }
    return ReflectApply(ArrayPrototype.push, list, ArrayPrototypeSlice(arguments, 1));
  };
  var $pop = uncurryThis(ArrayPrototype.pop);
  var $slice = function (receiver, start, end) {
    return typeof receiver === 'string' ? StringPrototypeSlice(receiver, start, end) : ArrayPrototypeSlice(receiver, start, end);
  };
  var $indexOf = function (receiver, value, from) {
    return typeof receiver === 'string' ? StringPrototypeIndexOf(receiver, value, from) : ArrayPrototypeIndexOf(receiver, value, from);
  };
  var $concat = stringOrArray(StringPrototype.concat, ArrayPrototype.concat);
  var $join = uncurryThis(ArrayPrototype.join);
  var $map = uncurryThis(ArrayPrototype.map);
  var $forEach = uncurryThis(ArrayPrototype.forEach);
  var $splice = arrayMethod(ArrayPrototype.splice);
  var $unshift = arrayMethod(ArrayPrototype.unshift);
  var $lastIndexOf = uncurryThis(ArrayPrototype.lastIndexOf);
  var $replace = uncurryThis(StringPrototype.replace);
  var $split = uncurryThis(StringPrototype.split);
  var $repeat = uncurryThis(StringPrototype.repeat);
  var $padStart = uncurryThis(StringPrototype.padStart);
  var $padEnd = uncurryThis(StringPrototype.padEnd);
  var $charCodeAt = uncurryThis(StringPrototype.charCodeAt);
  var $codePointAt = uncurryThis(StringPrototype.codePointAt);
  var $toFixed = uncurryThis(Number.prototype.toFixed);
  var $exec = RegExpPrototypeExec;
  var $test = function (regexp, text) { return RegExpPrototypeExec(regexp, text) !== null; };
  // Maps and sets whose methods are their own, the browser's.
  var safeCollection = function (Base, names) {
    var proto = Object.create(Base.prototype);
    for (var i = 0; i < names.length; i++) {
      Object.defineProperty(proto, names[i], Object.getOwnPropertyDescriptor(Base.prototype, names[i]));
    }
    return function () { return Object.setPrototypeOf(new Base(), proto); };
  };
  var SafeMap = safeCollection(Map, ['get', 'set', 'has', 'delete', 'clear', 'forEach', 'size']);
  var SafeSet = safeCollection(Set, ['add', 'has', 'delete', 'clear', 'forEach', 'size']);
  var SafeWeakMap = safeCollection(WeakMap, ['get', 'set', 'has', 'delete']);
  var SafeWeakSet = safeCollection(WeakSet, ['add', 'has', 'delete']);
`;
