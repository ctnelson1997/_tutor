/**
 * Static utility classes: Math, the primitive wrappers, Arrays, Objects,
 * System, String statics, and Collections.
 *
 * `callStaticMethod` returns `undefined` when the class/method pair is not
 * recognized, so the interpreter can fall through to its normal
 * "Unknown method" handling. `getStaticField` resolves constants like
 * `Math.PI` / `Integer.MAX_VALUE`.
 */

import {
  type JavaValue,
  isJavaArray,
  defaultValue,
  javaValueToNumber,
  javaValueToBoolean,
  javaValueToString,
  javaInt,
  javaDouble,
  javaLong,
  javaFloat,
  javaBool,
  javaChar,
  javaString,
  javaNull,
  qualifiedLibraryName,
} from '../types';
import {
  type NumericType,
  type NumericValue,
  isNumericType,
  unaryPromotion,
  binaryPromotion,
  convertNumber,
  negate,
  numericValue,
  parseIntegerText,
  parseFloatingText,
  rint,
  floatToString,
  compareFloating,
  INT_MIN,
  INT_MAX,
  LONG_MIN,
  LONG_MAX,
} from '../numeric';
import { JavaRuntimeError } from '../errors';
import { assignmentConversion } from '../references';
import { type StdlibContext, HaltSignal, StdlibError } from './context';
import {
  compareWith,
  isComparator,
  libraryComparator,
  valuesEqual,
  elementsOf,
  charArrayText,
} from './util';
import { javaFormat } from './format';
import { boxedHashCode, charRange } from './strings';
import { CHARACTER_TESTS, toUpperCaseChar, toLowerCaseChar, numericValue as characterValue } from './characters';
import { hashCodeOf } from './hashing';
import { comparing, functionStatic, optionalStatic } from './functional';
import { streamStatic } from './streams';
import { timSort } from './timsort';
import {
  callInstanceMethod,
  immutableList,
  immutableSet,
  immutableMap,
  immutableEntry,
  fixedSizeList,
  unmodifiableView,
  rewriteList,
} from './collections';

/** A numeric argument's type, or int for anything else (javac rejects that). */
function numericTypeOf(v: JavaValue | undefined): NumericType {
  return v?.kind === 'primitive' && isNumericType(v.javaType) ? v.javaType : 'int';
}

/** A numeric argument converted to `type`. */
function numberAs(v: JavaValue | undefined, type: NumericType): NumericValue {
  return v?.kind === 'primitive' && typeof v.value !== 'boolean' ? convertNumber(v.value, type) : convertNumber(javaValueToNumber(v ?? javaNull()), type);
}

export function getStaticField(className: string, field: string, ctx?: StdlibContext): JavaValue | undefined {
  switch (className) {
    case 'Locale': {
      // A Locale is its tag (#71); formatting ignores it and always uses the US conventions.
      const tags: Record<string, string> = { US: 'en_US', UK: 'en_GB', ENGLISH: 'en', ROOT: '', CANADA: 'en_CA' };
      if (ctx && field in tags) return { kind: 'objectRef', heapId: ctx.allocObject('Locale', new Map([['tag', javaString(tags[field])]])), className: 'Locale' };
      break;
    }
    case 'String':
      if (field === 'CASE_INSENSITIVE_ORDER' && ctx) return libraryComparator('caseInsensitive', undefined, ctx);
      break;
    case 'Math':
      if (field === 'PI') return javaDouble(Math.PI);
      if (field === 'E') return javaDouble(Math.E);
      if (field === 'TAU') return javaDouble(Math.PI * 2);
      break;
    case 'Integer':
      if (field === 'MAX_VALUE') return javaInt(INT_MAX);
      if (field === 'MIN_VALUE') return javaInt(INT_MIN);
      break;
    case 'Long':
      if (field === 'MAX_VALUE') return javaLong(LONG_MAX);
      if (field === 'MIN_VALUE') return javaLong(LONG_MIN);
      break;
    case 'Short':
      if (field === 'MAX_VALUE') return numericValue('short', 32767);
      if (field === 'MIN_VALUE') return numericValue('short', -32768);
      break;
    case 'Byte':
      if (field === 'MAX_VALUE') return numericValue('byte', 127);
      if (field === 'MIN_VALUE') return numericValue('byte', -128);
      break;
    case 'Double':
      if (field === 'MAX_VALUE') return javaDouble(Number.MAX_VALUE);
      if (field === 'MIN_VALUE') return javaDouble(Number.MIN_VALUE);
      if (field === 'POSITIVE_INFINITY') return javaDouble(Number.POSITIVE_INFINITY);
      if (field === 'NEGATIVE_INFINITY') return javaDouble(Number.NEGATIVE_INFINITY);
      if (field === 'NaN') return javaDouble(Number.NaN);
      break;
    case 'Float':
      if (field === 'MAX_VALUE') return javaFloat(3.4028235e38);
      if (field === 'MIN_VALUE') return javaFloat(1.4e-45);
      if (field === 'POSITIVE_INFINITY') return javaFloat(Number.POSITIVE_INFINITY);
      if (field === 'NEGATIVE_INFINITY') return javaFloat(Number.NEGATIVE_INFINITY);
      if (field === 'NaN') return javaFloat(Number.NaN);
      break;
    case 'Character':
      if (field === 'MAX_VALUE') return javaChar(65535);
      if (field === 'MIN_VALUE') return javaChar(0);
      break;
    case 'Boolean':
      if (field === 'TRUE') return javaBool(true);
      if (field === 'FALSE') return javaBool(false);
      break;
  }
  return undefined;
}

export function callStaticMethod(
  className: string,
  method: string,
  args: JavaValue[],
  ctx: StdlibContext,
): JavaValue | undefined {
  switch (className) {
    case 'Math': return mathMethod(method, args);
    case 'Integer': case 'Long': case 'Short': case 'Byte':
      return integerWrapper(className, method, args, ctx);
    case 'Double': case 'Float':
      return floatWrapper(className, method, args, ctx);
    case 'Boolean': return booleanWrapper(method, args, ctx);
    case 'Character': return characterWrapper(method, args);
    case 'String': return stringStatic(method, args, ctx);
    case 'System': return systemMethod(method, args, ctx);
    case 'Arrays': return arraysMethod(method, args, ctx);
    case 'Objects': return objectsMethod(method, args, ctx);
    case 'Collections': return collectionsMethod(method, args, ctx);
    case 'List': case 'Set': case 'Map':
      return factoryOf(className, method, args, ctx);
    case 'Comparator':
      if (method === 'naturalOrder') return libraryComparator('natural', undefined, ctx);
      if (method === 'reverseOrder') return libraryComparator('reverse', undefined, ctx);
      if (method === 'comparing' || method === 'comparingInt' || method === 'comparingDouble' || method === 'comparingLong') {
        return comparing(args[0], args[1], method, ctx);
      }
      break;
    case 'Function': case 'UnaryOperator': case 'Predicate': case 'BinaryOperator': case 'Entry':
      return functionStatic(className, method, args, ctx);
    case 'Optional': case 'OptionalInt': case 'OptionalDouble':
      return optionalStatic(className, method, args, ctx);
    case 'Stream': case 'IntStream': case 'DoubleStream': case 'Collectors':
      return streamStatic(className, method, args, ctx);
  }
  return undefined;
}

function mathMethod(method: string, args: JavaValue[]): JavaValue | undefined {
  const a = args.length > 0 ? javaValueToNumber(args[0]) : 0;
  const b = args.length > 1 ? javaValueToNumber(args[1]) : 0;
  switch (method) {
    case 'abs': {
      // abs keeps the (promoted) type: Math.abs(-5L) is a long. abs of the minimum int or long is itself.
      const type = unaryPromotion(numericTypeOf(args[0]));
      const x = numberAs(args[0], type);
      return numericValue(type, x < 0 || Object.is(x, -0) ? negate(x, type) : x);
    }
    case 'max': case 'min': {
      const type = binaryPromotion(numericTypeOf(args[0]), numericTypeOf(args[1]));
      const x = numberAs(args[0], type), y = numberAs(args[1], type);
      if (type === 'float' || type === 'double') {
        // Math.max and min treat NaN and -0.0 as Java does.
        return numericValue(type, method === 'max' ? Math.max(x as number, y as number) : Math.min(x as number, y as number));
      }
      return numericValue(type, (method === 'max' ? x > y : x < y) ? x : y);
    }
    case 'pow': return javaDouble(Math.pow(a, b));
    case 'sqrt': return javaDouble(Math.sqrt(a));
    case 'cbrt': return javaDouble(Math.cbrt(a));
    case 'hypot': return javaDouble(Math.hypot(a, b));
    case 'exp': return javaDouble(Math.exp(a));
    case 'log': return javaDouble(Math.log(a));
    case 'log10': return javaDouble(Math.log10(a));
    case 'floor': return javaDouble(Math.floor(a));
    case 'ceil': return javaDouble(Math.ceil(a));
    case 'rint': return javaDouble(rint(a));
    // Math.round(double) is a long and Math.round(float) an int, rounding half up.
    case 'round': return numericTypeOf(args[0]) === 'float'
      ? javaInt(convertNumber(Math.round(a), 'int') as number)
      : javaLong(convertNumber(Math.round(a), 'long') as bigint);
    case 'signum': return numericTypeOf(args[0]) === 'float' ? javaFloat(Math.sign(a)) : javaDouble(Math.sign(a));
    case 'random': return javaDouble(Math.random());
    case 'sin': return javaDouble(Math.sin(a));
    case 'cos': return javaDouble(Math.cos(a));
    case 'tan': return javaDouble(Math.tan(a));
    case 'asin': return javaDouble(Math.asin(a));
    case 'acos': return javaDouble(Math.acos(a));
    case 'atan': return javaDouble(Math.atan(a));
    case 'atan2': return javaDouble(Math.atan2(a, b));
    case 'toRadians': return javaDouble(a * Math.PI / 180);
    case 'toDegrees': return javaDouble(a * 180 / Math.PI);
    case 'floorDiv': case 'floorMod': return floorDivision(method, args);
    case 'PI': return javaDouble(Math.PI);
    case 'E': return javaDouble(Math.E);
  }
  return undefined;
}

/** Math.floorDiv and Math.floorMod on ints or longs: division rounding toward negative infinity, and its remainder. */
function floorDivision(method: 'floorDiv' | 'floorMod', args: JavaValue[]): JavaValue {
  const type = binaryPromotion(numericTypeOf(args[0]), numericTypeOf(args[1])) === 'long' ? 'long' : 'int';
  const x = numberAs(args[0], type), y = numberAs(args[1], type);
  if (y === 0 || y === 0n) throw new JavaRuntimeError('ArithmeticException', '/ by zero', 0);
  if (type === 'long') {
    const a = x as bigint, b = y as bigint, remainder = a % b;
    const adjust = remainder !== 0n && (remainder < 0n) !== (b < 0n);
    return javaLong(method === 'floorDiv' ? a / b - (adjust ? 1n : 0n) : adjust ? remainder + b : remainder);
  }
  const a = x as number, b = y as number;
  return javaInt(method === 'floorDiv' ? Math.floor(a / b) | 0 : a - Math.floor(a / b) * b);
}

/**
 * Integer, Long, Short and Byte statics. Long's methods work on longs; the
 * others on ints, except that parse and valueOf give the class's own type.
 */
function integerWrapper(cls: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const type = cls === 'Long' ? 'long' : cls === 'Short' ? 'short' : cls === 'Byte' ? 'byte' : 'int';
  const work = type === 'long' ? 'long' : 'int';
  const str = args.length > 0 ? javaValueToString(args[0], ctx.heap) : '';
  const x = numberAs(args[0], work), y = numberAs(args[1], work);
  const result = (v: NumericValue) => numericValue(work, v);
  const radix = args.length > 1 ? javaValueToNumber(args[1]) | 0 : 10;
  const unsigned = (r: number) => javaString(typeof x === 'bigint' ? BigInt.asUintN(64, x).toString(r) : ((x as number) >>> 0).toString(r));
  switch (method) {
    case 'parseInt': case 'parseLong': case 'parseShort': case 'parseByte':
      if (args[0]?.kind === 'null') throw new JavaRuntimeError('NumberFormatException', 'Cannot parse null string: null', 0);
      return numericValue(type, parseIntegerText(str, radix, type));
    case 'valueOf':
      if (args[0]?.kind === 'string') return numericValue(type, parseIntegerText(str, radix, type));
      return numericValue(type, numberAs(args[0], type));
    case 'toString':
      return javaString(args.length > 1 ? x.toString(radix) : String(x));
    case 'toBinaryString': return unsigned(2);
    case 'toHexString': return unsigned(16);
    case 'toOctalString': return unsigned(8);
    // Short.compare and Byte.compare return the difference; Integer's and Long's return -1, 0 or 1.
    case 'compare': return javaInt(type === 'short' || type === 'byte' ? (x as number) - (y as number) : x < y ? -1 : x > y ? 1 : 0);
    case 'max': return result(x > y ? x : y);
    case 'min': return result(x < y ? x : y);
    case 'sum': return result(typeof x === 'bigint' ? BigInt.asIntN(64, x + (y as bigint)) : ((x as number) + (y as number)) | 0);
    case 'signum': return javaInt(x > 0 ? 1 : x < 0 ? -1 : 0);
    case 'hashCode': return javaInt(boxedHashCode(numericValue(work, x)));
    case 'bitCount': {
      let bits = typeof x === 'bigint' ? BigInt.asUintN(64, x) : BigInt((x as number) >>> 0);
      let count = 0;
      while (bits) { count += Number(bits & 1n); bits >>= 1n; }
      return javaInt(count);
    }
    case 'MAX_VALUE': case 'MIN_VALUE': return getStaticField(cls, method);
  }
  return undefined;
}



/** Double and Float statics; Float's work on floats. */
function floatWrapper(cls: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const type = cls === 'Float' ? 'float' : 'double';
  const a = numberAs(args[0], type) as number;
  const b = numberAs(args[1], type) as number;
  const result = (v: number) => numericValue(type, type === 'float' ? Math.fround(v) : v);
  switch (method) {
    case 'parseDouble': case 'parseFloat': case 'valueOf': {
      if (method === 'valueOf' && args[0]?.kind !== 'string' && args[0]?.kind !== 'null') return result(a);
      // Java's grammar, not JavaScript's parseFloat, which reads a prefix (#65): "3.5abc" is a NumberFormatException.
      if (args[0]?.kind !== 'string') throw new JavaRuntimeError('NullPointerException', 'Cannot invoke "String.trim()" because "in" is null', 0);
      return result(parseFloatingText(args[0].value, type));
    }
    case 'toString': return javaString(type === 'float' ? floatToString(a) : javaValueToString(javaDouble(a), ctx.heap));
    case 'isNaN': return javaBool(Number.isNaN(a));
    case 'isInfinite': return javaBool(!Number.isFinite(a) && !Number.isNaN(a));
    case 'isFinite': return javaBool(Number.isFinite(a));
    case 'hashCode': return javaInt(boxedHashCode(numericValue(type, a)));
    case 'compare': return javaInt(compareFloating(a, b));
    case 'max': return result(Math.max(a, b));
    case 'min': return result(Math.min(a, b));
    case 'sum': return result(a + b);
    case 'MAX_VALUE': case 'MIN_VALUE': case 'POSITIVE_INFINITY': case 'NEGATIVE_INFINITY': case 'NaN':
      return getStaticField(cls, method);
  }
  return undefined;
}

function booleanWrapper(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const str = args.length > 0 ? javaValueToString(args[0], ctx.heap) : '';
  const a = args.length > 0 ? javaValueToBoolean(args[0]) : false;
  const b = args.length > 1 ? javaValueToBoolean(args[1]) : false;
  switch (method) {
    case 'parseBoolean': return javaBool(str.toLowerCase() === 'true');
    case 'valueOf': return javaBool(args[0]?.kind === 'string' ? str.toLowerCase() === 'true' : a);
    case 'toString': return javaString(a ? 'true' : 'false');
    case 'hashCode': return javaInt(a ? 1231 : 1237);
    case 'compare': return javaInt(a === b ? 0 : a ? 1 : -1);
    case 'logicalAnd': return javaBool(a && b);
    case 'logicalOr': return javaBool(a || b);
    case 'logicalXor': return javaBool(a !== b);
  }
  return undefined;
}

/** Character's statics (#66): Unicode's tests and single-character case mappings, as the JDK defines them (characters.ts). */
function characterWrapper(method: string, args: JavaValue[]): JavaValue | undefined {
  const code = args.length > 0 ? Math.trunc(javaValueToNumber(args[0])) : 0;
  const ch = String.fromCharCode(code);
  // Own properties only: CHARACTER_TESTS.toString is Object's (Character.toString and valueOf broke on it).
  const test = Object.hasOwn(CHARACTER_TESTS, method) ? CHARACTER_TESTS[method] : undefined;
  if (test) return javaBool(test(code));
  // A char in, a char out; a code point (int) in, an int out.
  const sameKind = (v: number) => (args[0]?.kind === 'primitive' && args[0].javaType === 'int' ? javaInt(v) : javaChar(v));
  switch (method) {
    case 'toUpperCase': return sameKind(toUpperCaseChar(code));
    case 'toLowerCase': return sameKind(toLowerCaseChar(code));
    case 'getNumericValue': return javaInt(characterValue(code));
    case 'valueOf': return { ...javaChar(code), boxed: true };
    case 'toString': return javaString(args[0]?.kind === 'primitive' && args[0].javaType === 'int' ? String.fromCodePoint(code) : ch);
    case 'hashCode': return javaInt(code);
    case 'compare': return javaInt(code - Math.trunc(javaValueToNumber(args[1])));
  }
  return undefined;
}

function stringStatic(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  switch (method) {
    case 'format': {
      // format(Locale, …) formats as the US does, whatever the locale (#71).
      if (args[0]?.kind === 'objectRef' && args[0].className === 'Locale') args = args.slice(1);
      if (args[0]?.kind === 'null') throw new JavaRuntimeError('NullPointerException', 'Cannot invoke "String.length()" because "s" is null', 0);
      const fmt = javaValueToString(args[0], ctx.heap);
      return javaString(javaFormat(fmt, args.slice(1), ctx.heap, ctx.stringify));
    }
    case 'valueOf': case 'copyValueOf': {
      if (args.length === 0) return javaString('null');
      if (args[0].kind === 'string') return args[0]; // String.valueOf(s) is s itself
      const chars = charArrayText(args[0], ctx); // String.valueOf(char[]) is the characters, valueOf(char[], offset, count) some of them
      if (chars !== undefined && args.length >= 3) return javaString(charRange(chars, args[1], args[2]));
      return javaString(chars ?? (ctx.stringify ? ctx.stringify(args[0]) : javaValueToString(args[0], ctx.heap)));
    }
    case 'join': {
      if (args[0]?.kind === 'null') throw new JavaRuntimeError('NullPointerException', 'Cannot invoke "java.lang.CharSequence.toString()" because "delimiter" is null', 0);
      const delim = javaValueToString(args[0], ctx.heap);
      const rest = args.slice(1);
      if (rest.length === 1 && rest[0].kind === 'null') throw new StdlibError('NullPointerException');
      // join(delim, array) or join(delim, a, b, c)
      let parts: JavaValue[] = rest;
      if (rest.length === 1 && rest[0].kind === 'arrayRef') {
        const arr = ctx.heap.get(rest[0].heapId);
        if (arr && isJavaArray(arr)) parts = arr.elements;
      } else if (rest.length === 1 && rest[0].kind === 'objectRef') {
        parts = elementsOf(rest[0], ctx) ?? parts;
      }
      return javaString(parts.map(p => javaValueToString(p, ctx.heap)).join(delim));
    }
  }
  return undefined;
}

function systemMethod(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  switch (method) {
    case 'currentTimeMillis': return javaLong(BigInt(Date.now()));
    case 'nanoTime': return javaLong(BigInt(Date.now()) * 1000000n + BigInt(Math.trunc(ctx.random() * 1e6)));
    case 'lineSeparator': return javaString('\n');
    case 'exit': throw new HaltSignal();
    case 'arraycopy':
      arraycopy(args[0], javaValueToNumber(args[1]) | 0, args[2], javaValueToNumber(args[3]) | 0, javaValueToNumber(args[4]) | 0, ctx);
      return javaNull();
  }
  return undefined;
}

function arraysMethod(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  if (method === 'stream') return streamStatic('Arrays', 'stream', args, ctx);
  const arrOf = (v: JavaValue) => (v?.kind === 'arrayRef' ? ctx.heap.get(v.heapId) : undefined);
  switch (method) {
    case 'toString': {
      // Elements print with their own toString() (#21).
      const arr = arrOf(args[0]);
      if (!arr || !isJavaArray(arr)) return javaString(args[0]?.kind === 'null' ? 'null' : '[]');
      return javaString('[' + arr.elements.map(e => text(e, ctx)).join(', ') + ']');
    }
    case 'deepToString': {
      const deep = (v: JavaValue): string => {
        if (v.kind === 'arrayRef') {
          const a = ctx.heap.get(v.heapId);
          if (a && isJavaArray(a)) return '[' + a.elements.map(deep).join(', ') + ']';
        }
        return text(v, ctx);
      };
      return javaString(deep(args[0]));
    }
    case 'hashCode': {
      const arr = arrOf(args[0]);
      if (!arr || !isJavaArray(arr)) return javaInt(0);
      return javaInt(arr.elements.reduce((h, e) => (Math.imul(31, h) + hashCodeOf(e, ctx)) | 0, 1));
    }
    case 'sort': {
      // Arrays.sort(a), (a, cmp), (a, from, to) and (a, from, to, cmp).
      const arr = arrOf(args[0]);
      const cmp = isComparator(args[args.length - 1], ctx) ? args[args.length - 1] : undefined;
      const ranged = args.length >= 3;
      if (arr && isJavaArray(arr)) {
        if (ranged) {
          const from = javaValueToNumber(args[1]) | 0, to = javaValueToNumber(args[2]) | 0;
          rangeCheck(arr.elements.length, from, to);
          timSort(arr.elements, from, to, (a, b) => compareWith(cmp, a, b, ctx));
        } else {
          // Java's TimSort, whose comparisons a comparator or compareTo sees (#69).
          timSort(arr.elements, 0, arr.elements.length, (a, b) => compareWith(cmp, a, b, ctx));
        }
      }
      return javaNull();
    }
    case 'fill': {
      const arr = arrOf(args[0]);
      if (arr && isJavaArray(arr)) {
        if (args.length >= 4) {
          const from = javaValueToNumber(args[1]) | 0, to = javaValueToNumber(args[2]) | 0;
          rangeCheck(arr.elements.length, from, to);
          const value = stored(args[3], arr.elementType, ctx);
          for (let i = from; i < to; i++) arr.elements[i] = value;
        } else {
          const value = stored(args[1], arr.elementType, ctx);
          for (let i = 0; i < arr.elements.length; i++) arr.elements[i] = value;
        }
      }
      return javaNull();
    }
    case 'copyOf': case 'copyOfRange': {
      // A new array of the length asked for, then System.arraycopy of what the original has there, as the JDK does it (#67).
      const arr = arrOf(args[0]);
      if (!arr || !isJavaArray(arr)) throw new StdlibError('NullPointerException');
      const from = method === 'copyOf' ? 0 : javaValueToNumber(args[1]) | 0;
      const to = method === 'copyOf' ? javaValueToNumber(args[1]) | 0 : javaValueToNumber(args[2]) | 0;
      if (method === 'copyOf' && to < 0) throw new StdlibError(`NegativeArraySizeException: ${to}`);
      if (from > to) throw new StdlibError(`IllegalArgumentException: ${from} > ${to}`);
      const copy: JavaValue = { kind: 'arrayRef', heapId: ctx.allocArray(arr.elementType, Array.from({ length: to - from }, () => defaultValue(arr.elementType))) };
      arraycopy(args[0], from, copy, 0, Math.min(arr.elements.length - from, to - from), ctx);
      return copy;
    }
    case 'equals': case 'deepEquals': {
      // equals compares elements with equals(); deepEquals compares nested arrays by their elements too.
      const same = (a: JavaValue, b: JavaValue): boolean => {
        const x = arrOf(a), y = arrOf(b);
        if (!x || !isJavaArray(x) || !y || !isJavaArray(y)) return a.kind === 'null' && b.kind === 'null';
        if (x.elements.length !== y.elements.length) return false;
        return x.elements.every((e, i) => (method === 'deepEquals' && e.kind === 'arrayRef' && y.elements[i].kind === 'arrayRef'
          ? same(e, y.elements[i])
          : e.kind === 'null' ? y.elements[i].kind === 'null' : valuesEqual(e, y.elements[i], ctx)));
      };
      return javaBool(same(args[0], args[1]));
    }
    case 'binarySearch': {
      // (a, key), (a, key, cmp), (a, from, to, key) and (a, from, to, key, cmp)
      const arr = arrOf(args[0]);
      if (!arr || !isJavaArray(arr)) throw new StdlibError('NullPointerException');
      const ranged = args.length >= 4;
      const from = ranged ? javaValueToNumber(args[1]) | 0 : 0;
      const to = ranged ? javaValueToNumber(args[2]) | 0 : arr.elements.length;
      rangeCheck(arr.elements.length, from, to);
      const found = javaValueToNumber(binarySearch(arr.elements.slice(from, to), args[ranged ? 3 : 1], args[ranged ? 4 : 2], ctx));
      return javaInt(found >= 0 ? found + from : found - from);
    }
    case 'asList': {
      // A fixed-size list backed by the array (#21): Arrays.asList(array) writes through to it.
      // An int[] isn't an array of objects, so Arrays.asList(ints) is a list holding the one array.
      const a = args.length === 1 ? arrOf(args[0]) : undefined;
      if (a && isJavaArray(a) && !isPrimitiveType(a.elementType)) return fixedSizeList(args[0], ctx);
      return fixedSizeList({ kind: 'arrayRef', heapId: ctx.allocArray('Object', args.slice()) }, ctx);
    }
  }
  return undefined;
}

function objectsMethod(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  switch (method) {
    case 'equals': return javaBool(valuesEqual(args[0], args[1], ctx));
    case 'hashCode': return javaInt(hashCodeOf(args[0], ctx));
    case 'hash': {
      // Arrays.hashCode of the varargs array (#63): Objects.hash(1, 2) is 994; a null array's is 0.
      const values = varargValues(args, 0, ctx);
      if (!values) return javaInt(0);
      let h = 1;
      for (const a of values) h = (Math.imul(31, h) + hashCodeOf(a, ctx)) | 0;
      return javaInt(h);
    }
    case 'isNull': return javaBool(args[0]?.kind === 'null');
    case 'nonNull': return javaBool(args[0]?.kind !== 'null');
    case 'requireNonNull':
      if (args[0]?.kind === 'null') {
        throw new StdlibError(args.length > 1 ? `NullPointerException: ${javaValueToString(args[1], ctx.heap)}` : 'NullPointerException');
      }
      return args[0];
    case 'toString':
      return javaString(args[0]?.kind === 'null'
        ? (args.length > 1 ? javaValueToString(args[1], ctx.heap) : 'null')
        : text(args[0], ctx));
  }
  return undefined;
}

/** A value as String.valueOf prints it, with a user class's own toString(). */
const text = (value: JavaValue, ctx: StdlibContext) => (ctx.stringify ? ctx.stringify(value) : javaValueToString(value, ctx.heap));

const isPrimitiveType = (type: string) => ['int', 'long', 'short', 'byte', 'char', 'double', 'float', 'boolean'].includes(type);

/** A type as Java names it in a message: `int`, `java.lang.String`, `Main$Point`, `java.lang.Object[]`. */
function javaTypeName(type: string, ctx: StdlibContext): string {
  if (type.endsWith('[]')) return javaTypeName(type.slice(0, -2), ctx) + '[]';
  if (isPrimitiveType(type)) return type;
  const binary = ctx.binaryName?.(type) ?? type;
  return binary === type ? qualifiedLibraryName(type) : binary;
}

/**
 * System.arraycopy as the JVM checks it (#67): a null array is a
 * NullPointerException; then the arrays' types (both of one primitive type,
 * or both of objects); then the positions and length, with HotSpot's
 * messages; an array never changes its length. Objects are checked one by
 * one against the destination's element type, those before a mismatch
 * copied (an ArrayStoreException). Overlapping ranges copy as if through a
 * temporary array.
 */
export function arraycopy(src: JavaValue, srcPos: number, dest: JavaValue, destPos: number, length: number, ctx: StdlibContext): void {
  if (src?.kind === 'null' || dest?.kind === 'null') throw new StdlibError('NullPointerException');
  const typeOf = (v: JavaValue) => (v.kind === 'string' ? 'java.lang.String' : v.kind === 'objectRef' ? javaTypeName(v.className, ctx) : v.kind === 'primitive' ? v.javaType : 'Object');
  const s = src?.kind === 'arrayRef' ? ctx.heap.get(src.heapId) : undefined;
  const d = dest?.kind === 'arrayRef' ? ctx.heap.get(dest.heapId) : undefined;
  if (!s || !isJavaArray(s)) throw new StdlibError(`ArrayStoreException: arraycopy: source type ${typeOf(src)} is not an array`);
  if (!d || !isJavaArray(d)) throw new StdlibError(`ArrayStoreException: arraycopy: destination type ${typeOf(dest)} is not an array`);
  const kind = (a: { elementType: string }) => (isPrimitiveType(a.elementType) ? a.elementType : 'object array');
  if ((isPrimitiveType(s.elementType) || isPrimitiveType(d.elementType)) && s.elementType !== d.elementType) {
    throw new StdlibError(`ArrayStoreException: arraycopy: type mismatch: can not copy ${kind(s)}[] into ${kind(d)}[]`);
  }
  const bounds = (message: string) => new StdlibError(`ArrayIndexOutOfBoundsException: arraycopy: ${message}`);
  if (srcPos < 0) throw bounds(`source index ${srcPos} out of bounds for ${kind(s)}[${s.elements.length}]`);
  if (destPos < 0) throw bounds(`destination index ${destPos} out of bounds for ${kind(d)}[${d.elements.length}]`);
  if (length < 0) throw bounds(`length ${length} is negative`);
  if (srcPos + length > s.elements.length) throw bounds(`last source index ${srcPos + length} out of bounds for ${kind(s)}[${s.elements.length}]`);
  if (destPos + length > d.elements.length) throw bounds(`last destination index ${destPos + length} out of bounds for ${kind(d)}[${d.elements.length}]`);
  const copy = s.elements.slice(srcPos, srcPos + length);
  for (let i = 0; i < copy.length; i++) {
    if (!isPrimitiveType(d.elementType) && ctx.storeCheck?.(copy[i], d.elementType) !== undefined) {
      throw new StdlibError(`ArrayStoreException: arraycopy: element type mismatch: can not cast one of the elements of ${javaTypeName(s.elementType, ctx)}[] to the type of the destination array, ${javaTypeName(d.elementType, ctx)}`);
    }
    d.elements[destPos + i] = copy[i];
  }
}

/** Arrays.rangeCheck (#67): from after to is an IllegalArgumentException, either end outside the array an ArrayIndexOutOfBoundsException. */
function rangeCheck(length: number, from: number, to: number): void {
  if (from > to) throw new StdlibError(`IllegalArgumentException: fromIndex(${from}) > toIndex(${to})`);
  if (from < 0) throw new StdlibError(`ArrayIndexOutOfBoundsException: Array index out of range: ${from}`);
  if (to > length) throw new StdlibError(`ArrayIndexOutOfBoundsException: Array index out of range: ${to}`);
}

/** A value an array of this element type takes, or Java's ArrayStoreException naming the value's class (#67). */
function stored(value: JavaValue, elementType: string, ctx: StdlibContext): JavaValue {
  const refused = isPrimitiveType(elementType) ? undefined : ctx.storeCheck?.(value, elementType);
  if (refused !== undefined) throw new StdlibError(`ArrayStoreException: ${refused}`);
  return assignmentConversion(value, elementType);
}

/**
 * A variable-arity parameter's values, from position `from` (#63): the binder
 * packs a call's variable arguments into one array (or passes the array the
 * call gives), so they arrive as that array, whose elements they are;
 * undefined for a null array. Spread values (the stdlib's own callers and
 * tests) are taken as they are.
 */
function varargValues(args: JavaValue[], from: number, ctx: StdlibContext): JavaValue[] | undefined {
  if (args.length === from + 1) {
    const last = args[from];
    if (last.kind === 'null') return undefined;
    const arr = last.kind === 'arrayRef' ? ctx.heap.get(last.heapId) : undefined;
    if (arr && isJavaArray(arr) && !isPrimitiveType(arr.elementType)) return arr.elements;
  }
  return args.slice(from);
}

/** A collection's elements, for the methods that only read it; null is a NullPointerException. */
function listArg(value: JavaValue | undefined, ctx: StdlibContext): JavaValue[] {
  const els = elementsOf(value, ctx);
  if (!els) throw new StdlibError('NullPointerException');
  return els;
}

/** Collections.binarySearch and Arrays.binarySearch: the index, or -(insertion point) - 1. */
function binarySearch(els: JavaValue[], key: JavaValue, cmp: JavaValue | undefined, ctx: StdlibContext): JavaValue {
  let lo = 0, hi = els.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const c = compareWith(cmp, els[mid], key, ctx);
    if (c < 0) lo = mid + 1;
    else if (c > 0) hi = mid - 1;
    else return javaInt(mid);
  }
  return javaInt(-(lo + 1));
}

/** `c.contains(e)`, through the collection's own contains(). */
const contains = (c: JavaValue, e: JavaValue, ctx: StdlibContext) => javaValueToBoolean(callInstanceMethod(c, 'contains', [e], ctx) ?? javaBool(false));

function collectionsMethod(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const index = (v: JavaValue) => javaValueToNumber(v) | 0;
  switch (method) {
    case 'sort':
      // list.sort(cmp): an immutable list refuses it, and ArrayList counts it as a change.
      if (args[0]?.kind !== 'objectRef') throw new StdlibError('NullPointerException');
      callInstanceMethod(args[0], 'sort', [args[1] ?? javaNull()], ctx);
      return javaNull();
    case 'reverseOrder':
      return libraryComparator('reverse', args[0], ctx);
    case 'reverse':
      rewriteList(args[0], ctx, els => els.reverse());
      return javaNull();
    case 'shuffle':
      // Java's: for i = size down to 2, swap i - 1 with rnd.nextInt(i), from the Random given (#68), so a seeded shuffle is the JDK's.
      rewriteList(args[0], ctx, els => {
        for (let i = els.length; i > 1; i--) {
          const j = args[1] ? javaValueToNumber(callInstanceMethod(args[1], 'nextInt', [javaInt(i)], ctx)!) : Math.floor(ctx.random() * i);
          [els[i - 1], els[j]] = [els[j], els[i - 1]];
        }
        return els;
      });
      return javaNull();
    case 'swap':
      rewriteList(args[0], ctx, els => {
        const i = index(args[1]), j = index(args[2]);
        for (const k of [i, j]) {
          if (k < 0 || k >= els.length) throw new StdlibError(`IndexOutOfBoundsException: Index ${k} out of bounds for length ${els.length}`);
        }
        [els[i], els[j]] = [els[j], els[i]];
        return els;
      });
      return javaNull();
    case 'fill':
      rewriteList(args[0], ctx, els => els.map(() => args[1]));
      return javaNull();
    case 'rotate':
      rewriteList(args[0], ctx, els => {
        const n = els.length;
        if (n === 0) return els;
        const d = ((index(args[1]) % n) + n) % n;
        return [...els.slice(n - d), ...els.slice(0, n - d)];
      });
      return javaNull();
    case 'max': case 'min': {
      const els = listArg(args[0], ctx);
      if (!els.length) throw new StdlibError('NoSuchElementException');
      const sign = method === 'max' ? 1 : -1;
      return els.reduce((m, e) => (sign * compareWith(args[1], e, m, ctx) > 0 ? e : m));
    }
    case 'frequency': {
      const o = args[1];
      return javaInt(listArg(args[0], ctx).filter(e => (o.kind === 'null' ? e.kind === 'null' : valuesEqual(o, e, ctx))).length);
    }
    case 'disjoint':
      return javaBool(!listArg(args[0], ctx).some(e => contains(args[1], e, ctx)));
    case 'nCopies': {
      const n = index(args[0]);
      if (n < 0) throw new StdlibError(`IllegalArgumentException: List length = ${n}`);
      return immutableList(Array.from({ length: n }, () => args[1]), ctx);
    }
    case 'emptyList': return immutableList([], ctx);
    case 'emptySet': return immutableSet([], false, ctx);
    case 'emptyMap': return immutableMap([], [], false, ctx);
    case 'singletonList': return immutableList([args[0]], ctx);
    case 'singleton': return immutableSet([args[0]], false, ctx);
    case 'singletonMap': return immutableMap([args[0]], [args[1]], false, ctx);
    case 'binarySearch': return binarySearch(listArg(args[0], ctx), args[1], args[2], ctx);
    case 'unmodifiableList': case 'unmodifiableSet': case 'unmodifiableMap': case 'unmodifiableCollection':
    case 'unmodifiableSortedSet': case 'unmodifiableSortedMap': case 'unmodifiableNavigableSet': case 'unmodifiableNavigableMap':
      return unmodifiableView(args[0], ctx);
    case 'synchronizedList': case 'synchronizedSet': case 'synchronizedMap':
      return args[0]; // one thread, so the collection itself
    case 'addAll': {
      // Collections.addAll(c, elements...): each element of the varargs array (#63) through c.add().
      const elements = varargValues(args, 1, ctx);
      if (args[0]?.kind !== 'objectRef' || !elements) throw new StdlibError('NullPointerException');
      let changed = false;
      for (const e of elements) changed = javaValueToBoolean(callInstanceMethod(args[0], 'add', [e], ctx) ?? javaBool(false)) || changed;
      return javaBool(changed);
    }
  }
  return undefined;
}

/**
 * List.of, Set.of, Map.of, their copyOf, and Map.entry: immutable (#21).
 * They refuse null, and Set.of and Map.of refuse duplicates.
 */
function factoryOf(className: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const requireNonNull = (values: JavaValue[]) => {
    if (values.some(v => v.kind === 'null')) throw new StdlibError('NullPointerException');
    return values;
  };
  if (className === 'Map' && method === 'entry') {
    const [key, value] = requireNonNull(args.slice(0, 2));
    return immutableEntry(key, value, ctx);
  }
  if (method === 'copyOf') {
    if (className === 'Map') {
      if (args[0]?.kind !== 'objectRef') throw new StdlibError('NullPointerException');
      const keys = (elementsOf(callInstanceMethod(args[0], 'keySet', [], ctx), ctx) ?? []).slice();
      const values = keys.map(k => callInstanceMethod(args[0], 'get', [k], ctx)!);
      return immutableMap(requireNonNull(keys), requireNonNull(values), false, ctx);
    }
    const items = requireNonNull(listArg(args[0], ctx).slice());
    return className === 'List' ? immutableList(items, ctx) : className === 'Set' ? immutableSet(items, false, ctx) : undefined;
  }
  if (method !== 'of') return undefined;
  if (className === 'Map') {
    const keys: JavaValue[] = [], values: JavaValue[] = [];
    for (let i = 0; i + 1 < args.length; i += 2) { keys.push(args[i]); values.push(args[i + 1]); }
    return immutableMap(requireNonNull(keys), requireNonNull(values), true, ctx);
  }
  // List.of(array) has the array's elements (its varargs parameter).
  const arr = args.length === 1 && args[0].kind === 'arrayRef' ? ctx.heap.get(args[0].heapId) : undefined;
  const items = arr && isJavaArray(arr) && !isPrimitiveType(arr.elementType) ? arr.elements.slice() : args.slice();
  if (className === 'List') return immutableList(requireNonNull(items), ctx);
  if (className === 'Set') return immutableSet(requireNonNull(items), true, ctx);
  return undefined;
}
