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
  type JavaPrimitive,
  isJavaArray,
  javaValueToNumber,
  javaValueToBoolean,
  javaValueToString,
  javaInt,
  javaDouble,
  javaBool,
  javaChar,
  javaString,
  javaNull,
} from '../types';
import { type StdlibContext, HaltSignal, StdlibError } from './context';
import {
  compareValues,
  valuesEqual,
  javaEquals,
  backingArray,
  allocCollection,
  allocMap,
} from './util';
import { javaFormat } from './format';

const INT_MAX = 2147483647;
const INT_MIN = -2147483648;

function longVal(value: number): JavaPrimitive {
  return { kind: 'primitive', javaType: 'long', value };
}

/** Preserve int/long/double result typing for Math.abs/max/min. */
function numResult(args: JavaValue[], value: number): JavaValue {
  if (args.some(a => a?.kind === 'primitive' && (a.javaType === 'double' || a.javaType === 'float'))) {
    return javaDouble(value);
  }
  if (args.some(a => a?.kind === 'primitive' && a.javaType === 'long')) return longVal(value);
  return javaInt(value);
}

function toRadix(n: number, radix: number): string {
  return (n < 0 ? '-' : '') + Math.abs(Math.trunc(n)).toString(radix);
}

function hashOf(v: JavaValue, heap: StdlibContext['heap']): number {
  if (v.kind === 'null') return 0;
  if (v.kind === 'primitive') {
    if (typeof v.value === 'boolean') return v.value ? 1231 : 1237;
    return Math.trunc(v.value) | 0;
  }
  const s = javaValueToString(v, heap);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export function getStaticField(className: string, field: string): JavaValue | undefined {
  switch (className) {
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
      // Not exactly representable in float64; use the closest double, as `(double) Long.MAX_VALUE` would.
      if (field === 'MAX_VALUE') return longVal(2 ** 63 - 1);
      if (field === 'MIN_VALUE') return longVal(-(2 ** 63));
      break;
    case 'Short':
      if (field === 'MAX_VALUE') return javaInt(32767);
      if (field === 'MIN_VALUE') return javaInt(-32768);
      break;
    case 'Byte':
      if (field === 'MAX_VALUE') return javaInt(127);
      if (field === 'MIN_VALUE') return javaInt(-128);
      break;
    case 'Double':
      if (field === 'MAX_VALUE') return javaDouble(Number.MAX_VALUE);
      if (field === 'MIN_VALUE') return javaDouble(Number.MIN_VALUE);
      if (field === 'POSITIVE_INFINITY') return javaDouble(Number.POSITIVE_INFINITY);
      if (field === 'NEGATIVE_INFINITY') return javaDouble(Number.NEGATIVE_INFINITY);
      if (field === 'NaN') return javaDouble(Number.NaN);
      break;
    case 'Float':
      if (field === 'MAX_VALUE') return { kind: 'primitive', javaType: 'float', value: 3.4028235e38 };
      if (field === 'MIN_VALUE') return { kind: 'primitive', javaType: 'float', value: 1.4e-45 };
      if (field === 'POSITIVE_INFINITY') return { kind: 'primitive', javaType: 'float', value: Number.POSITIVE_INFINITY };
      if (field === 'NEGATIVE_INFINITY') return { kind: 'primitive', javaType: 'float', value: Number.NEGATIVE_INFINITY };
      if (field === 'NaN') return { kind: 'primitive', javaType: 'float', value: Number.NaN };
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
  }
  return undefined;
}

function mathMethod(method: string, args: JavaValue[]): JavaValue | undefined {
  const a = args.length > 0 ? javaValueToNumber(args[0]) : 0;
  const b = args.length > 1 ? javaValueToNumber(args[1]) : 0;
  switch (method) {
    case 'abs': return numResult([args[0]], Math.abs(a));
    case 'max': return numResult(args.slice(0, 2), Math.max(a, b));
    case 'min': return numResult(args.slice(0, 2), Math.min(a, b));
    case 'pow': return javaDouble(Math.pow(a, b));
    case 'sqrt': return javaDouble(Math.sqrt(a));
    case 'cbrt': return javaDouble(Math.cbrt(a));
    case 'hypot': return javaDouble(Math.hypot(a, b));
    case 'exp': return javaDouble(Math.exp(a));
    case 'log': return javaDouble(Math.log(a));
    case 'log10': return javaDouble(Math.log10(a));
    case 'floor': return javaDouble(Math.floor(a));
    case 'ceil': return javaDouble(Math.ceil(a));
    case 'rint': return javaDouble(Math.round(a));
    case 'round': return args[0]?.kind === 'primitive' && args[0].javaType === 'double'
      ? longVal(Math.round(a)) : javaInt(Math.round(a));
    case 'signum': return javaDouble(Math.sign(a));
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
    case 'floorDiv': return numResult(args.slice(0, 2), Math.floor(a / b));
    case 'floorMod': return numResult(args.slice(0, 2), ((a % b) + b) % b);
    case 'PI': return javaDouble(Math.PI);
    case 'E': return javaDouble(Math.E);
  }
  return undefined;
}

function integerWrapper(cls: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const str = args.length > 0 ? javaValueToString(args[0], ctx.heap) : '';
  const a = args.length > 0 ? javaValueToNumber(args[0]) : 0;
  const b = args.length > 1 ? javaValueToNumber(args[1]) : 0;
  const wrap = (n: number): JavaValue => cls === 'Long' ? longVal(n) : javaInt(n);
  const parse = (radix: number): number => {
    const t = str.trim();
    const n = parseInt(t, radix);
    if (Number.isNaN(n) || !/^[+-]?[0-9a-zA-Z]+$/.test(t)) {
      throw new StdlibError(`NumberFormatException: For input string: "${str}"`);
    }
    return n;
  };
  switch (method) {
    case 'parseInt': case 'parseLong': case 'parseShort': case 'parseByte':
      return wrap(args.length > 1 ? parse(javaValueToNumber(args[1])) : parse(10));
    case 'valueOf':
      return args[0]?.kind === 'string' ? wrap(parse(10)) : wrap(a);
    case 'toString':
      return args.length > 1 ? javaString(toRadix(a, b)) : javaString(String(Math.trunc(a)));
    case 'toBinaryString': return javaString((a >>> 0).toString(2));
    case 'toHexString': return javaString((a >>> 0).toString(16));
    case 'toOctalString': return javaString((a >>> 0).toString(8));
    case 'compare': return javaInt(a < b ? -1 : a > b ? 1 : 0);
    case 'max': return wrap(Math.max(a, b));
    case 'min': return wrap(Math.min(a, b));
    case 'sum': return wrap(a + b);
    case 'signum': return javaInt(Math.sign(a));
    case 'bitCount': {
      let n = a >>> 0, c = 0;
      while (n) { c += n & 1; n >>>= 1; }
      return javaInt(c);
    }
    case 'MAX_VALUE': case 'MIN_VALUE': return getStaticField(cls, method);
  }
  return undefined;
}

function floatWrapper(cls: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const str = args.length > 0 ? javaValueToString(args[0], ctx.heap) : '';
  const a = args.length > 0 ? javaValueToNumber(args[0]) : 0;
  const b = args.length > 1 ? javaValueToNumber(args[1]) : 0;
  switch (method) {
    case 'parseDouble': case 'parseFloat': return javaDouble(parseFloat(str));
    case 'valueOf': return args[0]?.kind === 'string' ? javaDouble(parseFloat(str)) : javaDouble(a);
    case 'toString': return javaString(javaValueToString(javaDouble(a), ctx.heap));
    case 'isNaN': return javaBool(Number.isNaN(a));
    case 'isInfinite': return javaBool(!Number.isFinite(a) && !Number.isNaN(a));
    case 'compare': return javaInt(a < b ? -1 : a > b ? 1 : 0);
    case 'max': return javaDouble(Math.max(a, b));
    case 'min': return javaDouble(Math.min(a, b));
    case 'sum': return javaDouble(a + b);
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
    case 'compare': return javaInt(a === b ? 0 : a ? 1 : -1);
    case 'logicalAnd': return javaBool(a && b);
    case 'logicalOr': return javaBool(a || b);
    case 'logicalXor': return javaBool(a !== b);
  }
  return undefined;
}

function characterWrapper(method: string, args: JavaValue[]): JavaValue | undefined {
  const code = args.length > 0 ? Math.trunc(javaValueToNumber(args[0])) : 0;
  const ch = String.fromCharCode(code);
  switch (method) {
    case 'isDigit': return javaBool(ch >= '0' && ch <= '9');
    case 'isLetter': return javaBool(/[a-zA-Z]/.test(ch));
    case 'isLetterOrDigit': return javaBool(/[a-zA-Z0-9]/.test(ch));
    case 'isAlphabetic': return javaBool(/[a-zA-Z]/.test(ch));
    case 'isWhitespace': case 'isSpaceChar': return javaBool(/\s/.test(ch));
    case 'isUpperCase': return javaBool(ch !== ch.toLowerCase() && ch === ch.toUpperCase());
    case 'isLowerCase': return javaBool(ch !== ch.toUpperCase() && ch === ch.toLowerCase());
    case 'toUpperCase': return javaChar(ch.toUpperCase().charCodeAt(0));
    case 'toLowerCase': return javaChar(ch.toLowerCase().charCodeAt(0));
    case 'getNumericValue': return javaInt(/[0-9]/.test(ch) ? code - 48 : /[a-z]/.test(ch) ? code - 87 : /[A-Z]/.test(ch) ? code - 55 : -1);
    case 'toString': return javaString(ch);
    case 'compare': return javaInt(code - Math.trunc(javaValueToNumber(args[1])));
  }
  return undefined;
}

function stringStatic(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  switch (method) {
    case 'format': {
      const fmt = javaValueToString(args[0], ctx.heap);
      return javaString(javaFormat(fmt, args.slice(1), ctx.heap));
    }
    case 'valueOf': return javaString(args.length > 0 ? javaValueToString(args[0], ctx.heap) : 'null');
    case 'join': {
      const delim = javaValueToString(args[0], ctx.heap);
      const rest = args.slice(1);
      // join(delim, array) or join(delim, a, b, c)
      let parts: JavaValue[] = rest;
      if (rest.length === 1 && rest[0].kind === 'arrayRef') {
        const arr = ctx.heap.get(rest[0].heapId);
        if (arr && isJavaArray(arr)) parts = arr.elements;
      } else if (rest.length === 1 && rest[0].kind === 'objectRef') {
        const data = backingArray(rest[0], ctx);
        if (data) parts = data.elements;
      }
      return javaString(parts.map(p => javaValueToString(p, ctx.heap)).join(delim));
    }
  }
  return undefined;
}

function systemMethod(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  switch (method) {
    case 'currentTimeMillis': return longVal(Date.now());
    case 'nanoTime': return longVal(Math.trunc(ctx.random() * 1e9) + Date.now() * 1e6);
    case 'lineSeparator': return javaString('\n');
    case 'exit': throw new HaltSignal();
    case 'arraycopy': {
      const src = args[0], srcPos = javaValueToNumber(args[1]) | 0;
      const dest = args[2], destPos = javaValueToNumber(args[3]) | 0;
      const len = javaValueToNumber(args[4]) | 0;
      if (src?.kind !== 'arrayRef' || dest?.kind !== 'arrayRef') {
        throw new StdlibError('System.arraycopy requires array arguments');
      }
      const s = ctx.heap.get(src.heapId), d = ctx.heap.get(dest.heapId);
      if (!s || !isJavaArray(s) || !d || !isJavaArray(d)) return javaNull();
      const copy = s.elements.slice(srcPos, srcPos + len);
      for (let i = 0; i < copy.length; i++) d.elements[destPos + i] = copy[i];
      return javaNull();
    }
  }
  return undefined;
}

function arraysMethod(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const arrOf = (v: JavaValue) => (v?.kind === 'arrayRef' ? ctx.heap.get(v.heapId) : undefined);
  switch (method) {
    case 'toString': {
      const arr = arrOf(args[0]);
      if (!arr || !isJavaArray(arr)) return javaString(args[0]?.kind === 'null' ? 'null' : '[]');
      return javaString('[' + arr.elements.map(e => javaValueToString(e, ctx.heap)).join(', ') + ']');
    }
    case 'deepToString': {
      const deep = (v: JavaValue): string => {
        if (v.kind === 'arrayRef') {
          const a = ctx.heap.get(v.heapId);
          if (a && isJavaArray(a)) return '[' + a.elements.map(deep).join(', ') + ']';
        }
        return javaValueToString(v, ctx.heap);
      };
      return javaString(deep(args[0]));
    }
    case 'sort': {
      const arr = arrOf(args[0]);
      if (arr && isJavaArray(arr)) {
        if (args.length >= 3) {
          const from = javaValueToNumber(args[1]) | 0, to = javaValueToNumber(args[2]) | 0;
          const seg = arr.elements.slice(from, to).sort((a, b) => compareValues(a, b, ctx));
          for (let i = 0; i < seg.length; i++) arr.elements[from + i] = seg[i];
        } else {
          arr.elements.sort((a, b) => compareValues(a, b, ctx));
        }
      }
      return javaNull();
    }
    case 'fill': {
      const arr = arrOf(args[0]);
      if (arr && isJavaArray(arr)) {
        if (args.length >= 4) {
          const from = javaValueToNumber(args[1]) | 0, to = javaValueToNumber(args[2]) | 0;
          for (let i = from; i < to; i++) arr.elements[i] = args[3];
        } else {
          for (let i = 0; i < arr.elements.length; i++) arr.elements[i] = args[1];
        }
      }
      return javaNull();
    }
    case 'copyOf': {
      const arr = arrOf(args[0]);
      if (!arr || !isJavaArray(arr)) return javaNull();
      const n = javaValueToNumber(args[1]) | 0;
      const out: JavaValue[] = [];
      for (let i = 0; i < n; i++) out.push(arr.elements[i] ?? defaultLike(arr.elements[0]));
      return { kind: 'arrayRef', heapId: ctx.allocArray(arr.elementType, out) };
    }
    case 'copyOfRange': {
      const arr = arrOf(args[0]);
      if (!arr || !isJavaArray(arr)) return javaNull();
      const from = javaValueToNumber(args[1]) | 0, to = javaValueToNumber(args[2]) | 0;
      const out: JavaValue[] = [];
      for (let i = from; i < to; i++) out.push(arr.elements[i] ?? defaultLike(arr.elements[0]));
      return { kind: 'arrayRef', heapId: ctx.allocArray(arr.elementType, out) };
    }
    case 'equals': case 'deepEquals': {
      const x = arrOf(args[0]), y = arrOf(args[1]);
      if (!x || !isJavaArray(x) || !y || !isJavaArray(y)) return javaBool(args[0] === args[1]);
      if (x.elements.length !== y.elements.length) return javaBool(false);
      return javaBool(x.elements.every((e, i) => valuesEqual(e, y.elements[i], ctx)));
    }
    case 'binarySearch': {
      const arr = arrOf(args[0]);
      if (!arr || !isJavaArray(arr)) return javaInt(-1);
      const key = args[1];
      let lo = 0, hi = arr.elements.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const c = compareValues(arr.elements[mid], key, ctx);
        if (c < 0) lo = mid + 1;
        else if (c > 0) hi = mid - 1;
        else return javaInt(mid);
      }
      return javaInt(-(lo + 1));
    }
    case 'asList': {
      let elems = args;
      if (args.length === 1 && args[0].kind === 'arrayRef') {
        const a = ctx.heap.get(args[0].heapId);
        if (a && isJavaArray(a)) elems = a.elements.slice();
      }
      return allocCollection('ArrayList', elems.slice(), 'Object', ctx);
    }
  }
  return undefined;
}

function defaultLike(sample: JavaValue | undefined): JavaValue {
  if (sample?.kind === 'primitive') {
    return { kind: 'primitive', javaType: sample.javaType, value: typeof sample.value === 'boolean' ? false : 0 };
  }
  return javaNull();
}

function objectsMethod(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  switch (method) {
    case 'equals': return javaBool(valuesEqual(args[0], args[1], ctx));
    case 'hashCode': return javaInt(hashOf(args[0], ctx.heap));
    case 'hash': {
      let h = 1;
      for (const a of args) h = (Math.imul(31, h) + hashOf(a, ctx.heap)) | 0;
      return javaInt(h);
    }
    case 'isNull': return javaBool(args[0]?.kind === 'null');
    case 'nonNull': return javaBool(args[0]?.kind !== 'null');
    case 'requireNonNull':
      if (args[0]?.kind === 'null') {
        throw new StdlibError(args.length > 1 ? javaValueToString(args[1], ctx.heap) : 'NullPointerException');
      }
      return args[0];
    case 'toString':
      return javaString(args[0]?.kind === 'null'
        ? (args.length > 1 ? javaValueToString(args[1], ctx.heap) : 'null')
        : javaValueToString(args[0], ctx.heap));
  }
  return undefined;
}

function collectionsMethod(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const data = args.length > 0 ? backingArray(args[0], ctx) : undefined;
  switch (method) {
    case 'sort':
      if (data) data.elements.sort((a, b) => compareValues(a, b, ctx));
      return javaNull();
    case 'reverse':
      if (data) data.elements.reverse();
      return javaNull();
    case 'shuffle':
      if (data) {
        for (let i = data.elements.length - 1; i > 0; i--) {
          const j = Math.floor(ctx.random() * (i + 1));
          [data.elements[i], data.elements[j]] = [data.elements[j], data.elements[i]];
        }
      }
      return javaNull();
    case 'max':
      if (data && data.elements.length) return data.elements.reduce((m, e) => (compareValues(e, m, ctx) > 0 ? e : m));
      return javaNull();
    case 'min':
      if (data && data.elements.length) return data.elements.reduce((m, e) => (compareValues(e, m, ctx) < 0 ? e : m));
      return javaNull();
    case 'frequency': {
      if (!data) return javaInt(0);
      return javaInt(data.elements.filter(e => valuesEqual(e, args[1], ctx)).length);
    }
    case 'swap':
      if (data) {
        const i = javaValueToNumber(args[1]) | 0, j = javaValueToNumber(args[2]) | 0;
        [data.elements[i], data.elements[j]] = [data.elements[j], data.elements[i]];
      }
      return javaNull();
    case 'fill':
      if (data) for (let i = 0; i < data.elements.length; i++) data.elements[i] = args[1];
      return javaNull();
    case 'nCopies': {
      const n = javaValueToNumber(args[0]) | 0;
      return allocCollection('ArrayList', Array.from({ length: n }, () => args[1]), 'Object', ctx);
    }
    case 'emptyList': return allocCollection('ArrayList', [], 'Object', ctx);
    case 'singletonList': return allocCollection('ArrayList', [args[0]], 'Object', ctx);
    case 'binarySearch': {
      if (!data) return javaInt(-1);
      const key = args[1];
      let lo = 0, hi = data.elements.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const c = compareValues(data.elements[mid], key, ctx);
        if (c < 0) lo = mid + 1;
        else if (c > 0) hi = mid - 1;
        else return javaInt(mid);
      }
      return javaInt(-(lo + 1));
    }
    case 'unmodifiableList': case 'unmodifiableSet': case 'unmodifiableMap':
    case 'synchronizedList':
      return args[0]; // no-op wrapper for teaching purposes
    case 'addAll': {
      if (data) for (let i = 1; i < args.length; i++) data.elements.push(args[i]);
      return javaBool(true);
    }
  }
  return undefined;
}

function factoryOf(className: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  if (method !== 'of' && method !== 'copyOf') return undefined;
  if (className === 'List') return allocCollection('ArrayList', args.slice(), 'Object', ctx);
  if (className === 'Set') return allocCollection('LinkedHashSet', dedupe(args), 'Object', ctx);
  if (className === 'Map') {
    const keys: JavaValue[] = [], values: JavaValue[] = [];
    for (let i = 0; i + 1 < args.length; i += 2) { keys.push(args[i]); values.push(args[i + 1]); }
    return allocMap('LinkedHashMap', keys, values, ctx);
  }
  return undefined;
}

function dedupe(args: JavaValue[]): JavaValue[] {
  const out: JavaValue[] = [];
  for (const a of args) if (!out.some(e => javaEquals(e, a))) out.push(a);
  return out;
}
