/**
 * java.lang.String, StringBuilder/StringBuffer, the boxed primitives'
 * instance methods (Integer.compareTo, Double.intValue, …), `new String(…)`
 * and hashCode (#20). Each method function returns undefined for a method it
 * doesn't know, so the interpreter reports it.
 *
 * String identity: a method that leaves a string unchanged returns the same
 * string, as Java returns `this` (so `"hi".trim() == "hi"`); any other result
 * is a new string object (see javaString in ../types).
 */
import {
  type JavaValue,
  type JavaString,
  type JavaPrimitive,
  type JavaObject,
  type JavaObjectRef,
  isJavaObject,
  javaValueToNumber,
  javaValueToString,
  javaInt,
  javaBool,
  javaChar,
  javaString,
  internedString,
  javaNull,
  identityHash,
} from '../types';
import { convertNumber, isNumericType, numericValue, compareFloating, type NumericType } from '../numeric';
import { UnsupportedFeatureError } from '../errors';
import { type StdlibContext, StdlibError } from './context';
import { charArrayText } from './util';
import { javaRegex, javaReplacement, javaSplit, groupCount } from './regex';
import { javaFormat } from './format';

// ── Shared ──

/** Java's String.hashCode: s[0]·31^(n-1) + … + s[n-1], in int arithmetic. */
export function stringHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** String.compareTo: the difference of the first differing chars, else of the lengths. */
export function compareStrings(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a.charCodeAt(i) - b.charCodeAt(i);
  }
  return a.length - b.length;
}

/** String.compareToIgnoreCase: chars compared after upper-casing, then lower-casing, as String.CASE_INSENSITIVE_ORDER does. */
export function compareIgnoringCase(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = a[i], y = b[i];
    if (x === y) continue;
    x = x.toUpperCase(); y = y.toUpperCase();
    if (x === y) continue;
    x = x.toLowerCase(); y = y.toLowerCase();
    if (x !== y) return x.charCodeAt(0) - y.charCodeAt(0);
  }
  return a.length - b.length;
}

function indexError(index: number, length: number): StdlibError {
  return new StdlibError(`StringIndexOutOfBoundsException: Index ${index} out of bounds for length ${length}`);
}

function rangeError(begin: number, end: number, length: number): StdlibError {
  return new StdlibError(`StringIndexOutOfBoundsException: Range [${begin}, ${end}) out of bounds for length ${length}`);
}

function streams(method: string): never {
  throw new UnsupportedFeatureError(`Streams (${method}())`, 0);
}

/** The text of a CharSequence argument (a String or a StringBuilder), or of any value. */
function textOf(value: JavaValue | undefined, ctx: StdlibContext): string {
  if (!value) return '';
  return value.kind === 'string' ? value.value : javaValueToString(value, ctx.heap);
}

/** What String.valueOf(value) gives: a char[]'s characters, else the value's toString(). */
function valueText(value: JavaValue | undefined, ctx: StdlibContext): string {
  if (!value) return '';
  return charArrayText(value, ctx) ?? (ctx.stringify ? ctx.stringify(value) : javaValueToString(value, ctx.heap));
}

/** Java's trim: chars up to the space (U+0020) removed from both ends. */
function trimJava(s: string): string {
  let start = 0, end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.slice(start, end);
}

// ── String ──

/** A method called on a String. */
export function stringMethod(s: JavaString, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const str = s.value;
  const int = (i: number) => javaValueToNumber(args[i]) | 0;
  /** The same string when the method leaves it unchanged (Java returns this), else a new one. */
  const result = (value: string) => (value === str ? s : javaString(value));
  /** A search argument: a String, or a char (or int code point) as indexOf('n') takes. */
  const needle = (v: JavaValue | undefined) => (v?.kind === 'primitive' ? String.fromCodePoint(javaValueToNumber(v)) : textOf(v, ctx));
  switch (method) {
    case 'length': return javaInt(str.length);
    case 'isEmpty': return javaBool(str.length === 0);
    case 'isBlank': return javaBool(/^\s*$/.test(str));
    case 'charAt': case 'codePointAt': {
      const i = int(0);
      if (i < 0 || i >= str.length) throw indexError(i, str.length);
      return method === 'charAt' ? javaChar(str.charCodeAt(i)) : javaInt(str.codePointAt(i)!);
    }
    case 'substring': case 'subSequence': {
      const begin = int(0), end = args.length > 1 ? int(1) : str.length;
      if (begin < 0 || end > str.length || begin > end) throw rangeError(begin, end, str.length);
      return result(str.slice(begin, end));
    }
    case 'indexOf': return javaInt(str.indexOf(needle(args[0]), args.length > 1 ? Math.max(0, int(1)) : 0));
    case 'lastIndexOf': {
      if (args.length < 2) return javaInt(str.lastIndexOf(needle(args[0])));
      return javaInt(int(1) < 0 ? -1 : str.lastIndexOf(needle(args[0]), int(1)));
    }
    case 'contains': return javaBool(str.includes(textOf(args[0], ctx)));
    case 'startsWith': {
      const offset = args.length > 1 ? int(1) : 0;
      return javaBool(offset >= 0 && offset <= str.length && str.startsWith(textOf(args[0], ctx), offset));
    }
    case 'endsWith': return javaBool(str.endsWith(textOf(args[0], ctx)));
    case 'equals': return javaBool(args[0]?.kind === 'string' && args[0].value === str);
    case 'equalsIgnoreCase': return javaBool(args[0]?.kind === 'string' && args[0].value.length === str.length && compareIgnoringCase(str, args[0].value) === 0);
    case 'contentEquals': return javaBool(textOf(args[0], ctx) === str);
    case 'compareTo': return javaInt(compareStrings(str, textOf(args[0], ctx)));
    case 'compareToIgnoreCase': return javaInt(compareIgnoringCase(str, textOf(args[0], ctx)));
    case 'toUpperCase': return result(str.toUpperCase());
    case 'toLowerCase': return result(str.toLowerCase());
    case 'trim': return result(trimJava(str));
    case 'strip': return result(str.replace(/^\s+|\s+$/g, ''));
    case 'stripLeading': return result(str.replace(/^\s+/, ''));
    case 'stripTrailing': return result(str.replace(/\s+$/, ''));
    case 'replace': {
      if (args[0]?.kind === 'primitive' && args[1]?.kind === 'primitive') {
        return result(str.split(String.fromCharCode(javaValueToNumber(args[0]))).join(String.fromCharCode(javaValueToNumber(args[1]))));
      }
      const target = textOf(args[0], ctx), replacement = textOf(args[1], ctx);
      // An empty target matches between every two chars, and at both ends.
      return result(target === '' ? replacement + [...str].join(replacement) + replacement : str.split(target).join(replacement));
    }
    case 'replaceAll': case 'replaceFirst': {
      const re = javaRegex(textOf(args[0], ctx), method === 'replaceAll' ? 'g' : '');
      const groups = groupCount(re);
      const build = javaReplacement(textOf(args[1], ctx), groups);
      return result(str.replace(re, (...m: unknown[]) => {
        const named = typeof m[m.length - 1] === 'object' ? m[m.length - 1] as Record<string, string> : undefined;
        return build(m.slice(0, groups + 1) as string[], named);
      }));
    }
    case 'matches': {
      const re = javaRegex(textOf(args[0], ctx));
      return javaBool(new RegExp(`^(?:${re.source})$`, re.flags).test(str));
    }
    case 'split': {
      const parts = javaSplit(str, textOf(args[0], ctx), args.length > 1 ? int(1) : 0);
      const elements = parts.length === 1 && parts[0] === str ? [s] : parts.map(p => javaString(p));
      return { kind: 'arrayRef', heapId: ctx.allocArray('String', elements) };
    }
    case 'concat': {
      const other = textOf(args[0], ctx);
      return other === '' ? s : javaString(str + other);
    }
    case 'repeat': {
      const count = int(0);
      if (count < 0) throw new StdlibError(`IllegalArgumentException: count is negative: ${count}`);
      return count === 1 ? s : count === 0 || str === '' ? internedString('') : javaString(str.repeat(count));
    }
    case 'toCharArray':
      return { kind: 'arrayRef', heapId: ctx.allocArray('char', Array.from(str, (_, i) => javaChar(str.charCodeAt(i)))) };
    case 'hashCode': return javaInt(stringHashCode(str));
    case 'intern': return internedString(str);
    case 'toString': return s;
    case 'formatted': return javaString(javaFormat(str, args, ctx.heap, ctx.stringify));
    case 'chars': case 'codePoints': case 'lines': return streams(`String.${method}`);
  }
  return undefined;
}

/** `new String(…)`: from nothing, a String (a copy: a new object), a char[] (optionally a range of it), or a StringBuilder. */
export function newString(args: JavaValue[], ctx: StdlibContext): JavaValue {
  if (args.length === 0) return javaString('');
  const chars = charArrayText(args[0], ctx);
  if (chars !== undefined && args.length >= 3) {
    const offset = javaValueToNumber(args[1]) | 0, count = javaValueToNumber(args[2]) | 0;
    if (offset < 0 || count < 0 || offset + count > chars.length) {
      throw new StdlibError(`StringIndexOutOfBoundsException: offset ${offset}, count ${count}, length ${chars.length}`);
    }
    return javaString(chars.slice(offset, offset + count));
  }
  if (args[0].kind === 'null') throw new StdlibError('NullPointerException');
  return javaString(chars ?? textOf(args[0], ctx));
}

// ── StringBuilder / StringBuffer ──

/** A method called on a library StringBuilder or StringBuffer, whose text is its `value` field. */
export function stringBuilderMethod(ref: JavaObjectRef, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const obj = ctx.heap.get(ref.heapId) as JavaObject | undefined;
  if (!obj || !isJavaObject(obj)) return undefined;
  const current = obj.fields.get('value');
  const text = current?.kind === 'string' ? current.value : '';
  const length = text.length;
  const set = (next: string) => obj.fields.set('value', javaString(next));
  const int = (i: number) => javaValueToNumber(args[i]) | 0;
  const index = (i: number) => {
    if (i < 0 || i >= length) throw indexError(i, length);
    return i;
  };
  switch (method) {
    case 'append': {
      let added = valueText(args[0], ctx);
      if (args.length === 3) { // append(char[], offset, len) or append(CharSequence, start, end)
        added = charArrayText(args[0], ctx) !== undefined ? added.slice(int(1), int(1) + int(2)) : added.slice(int(1), int(2));
      }
      set(text + added);
      return ref; // for chaining: sb.append("a").append("b")
    }
    case 'insert': {
      const offset = int(0);
      if (offset < 0 || offset > length) throw rangeError(offset, length, length);
      set(text.slice(0, offset) + valueText(args[1], ctx) + text.slice(offset));
      return ref;
    }
    case 'toString': return javaString(text);
    case 'length': return javaInt(length);
    case 'isEmpty': return javaBool(length === 0);
    case 'capacity': return javaInt(length + 16);
    case 'charAt': return javaChar(text.charCodeAt(index(int(0))));
    case 'setCharAt': {
      const i = index(int(0));
      set(text.slice(0, i) + String.fromCharCode(javaValueToNumber(args[1])) + text.slice(i + 1));
      return javaNull();
    }
    case 'deleteCharAt': {
      const i = index(int(0));
      set(text.slice(0, i) + text.slice(i + 1));
      return ref;
    }
    case 'delete': case 'replace': {
      const start = int(0), end = Math.min(int(1), length);
      if (start < 0 || start > length || start > end) throw rangeError(start, int(1), length);
      set(text.slice(0, start) + (method === 'replace' ? textOf(args[2], ctx) : '') + text.slice(end));
      return ref;
    }
    case 'indexOf': return javaInt(text.indexOf(textOf(args[0], ctx), args.length > 1 ? Math.max(0, int(1)) : 0));
    case 'lastIndexOf': return javaInt(args.length > 1 ? (int(1) < 0 ? -1 : text.lastIndexOf(textOf(args[0], ctx), int(1))) : text.lastIndexOf(textOf(args[0], ctx)));
    case 'reverse': set([...text].reverse().join('')); return ref; // keeps surrogate pairs together, as Java does
    case 'setLength': {
      const n = int(0);
      if (n < 0) throw indexError(n, length);
      set(n <= length ? text.slice(0, n) : text + '\0'.repeat(n - length));
      return javaNull();
    }
    case 'substring': case 'subSequence': {
      const begin = int(0), end = args.length > 1 ? int(1) : length;
      if (begin < 0 || end > length || begin > end) throw rangeError(begin, end, length);
      return javaString(text.slice(begin, end));
    }
    case 'equals': return javaBool(args[0]?.kind === 'objectRef' && args[0].heapId === ref.heapId); // identity, as Object.equals
    case 'hashCode': return javaInt(parseInt(identityHash(ref.heapId), 16) | 0);
    case 'compareTo': return javaInt(compareStrings(text, textOf(args[0], ctx)));
    case 'chars': return streams('StringBuilder.chars');
  }
  return undefined;
}

// ── Boxed primitives ──

/** Java's hashCode for a boxed value: Integer's value, Long's halves xor'ed, Double's bits, Boolean's 1231/1237, … */
export function boxedHashCode(value: JavaPrimitive): number {
  switch (value.javaType) {
    case 'boolean': return value.value ? 1231 : 1237;
    case 'long': {
      const bits = BigInt.asUintN(64, value.value as bigint);
      return Number(BigInt.asIntN(32, bits ^ (bits >> 32n)));
    }
    case 'double': {
      const view = new DataView(new ArrayBuffer(8));
      const d = value.value as number;
      view.setFloat64(0, d !== d ? NaN : d); // doubleToLongBits: every NaN is the canonical one
      return (view.getInt32(0) ^ view.getInt32(4)) | 0;
    }
    case 'float': {
      const view = new DataView(new ArrayBuffer(4));
      const f = value.value as number;
      view.setFloat32(0, f !== f ? NaN : f);
      return view.getInt32(0);
    }
    default: return (value.value as number) | 0;
  }
}

/**
 * A method called on a boxed value (in JavaTutor a boxed value is its
 * primitive): xxxValue(), compareTo, equals, hashCode and toString, as
 * Integer, Double, Character and the other wrappers define them.
 */
export function boxedMethod(value: JavaPrimitive, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const type = value.javaType;
  const other = args[0];
  switch (method) {
    case 'intValue': case 'longValue': case 'doubleValue': case 'floatValue': case 'shortValue': case 'byteValue': {
      if (!isNumericType(type) || type === 'char') return undefined; // Character has no intValue()
      const target = method.slice(0, -'Value'.length) as NumericType;
      return numericValue(target, convertNumber(value.value as number | bigint, target));
    }
    case 'charValue': return type === 'char' ? value : undefined;
    case 'booleanValue': return type === 'boolean' ? value : undefined;
    case 'equals': {
      // Equal only to a boxed value of the same class: Integer(5).equals(5L) is false. Doubles compare by bits.
      if (other?.kind !== 'primitive' || other.javaType !== type) return javaBool(false);
      return javaBool(type === 'double' || type === 'float' ? Object.is(value.value, other.value) || (value.value !== value.value && other.value !== other.value) : value.value === other.value);
    }
    case 'compareTo': {
      if (other?.kind !== 'primitive') return undefined;
      if (type === 'boolean') return javaInt(value.value === other.value ? 0 : value.value ? 1 : -1);
      if (type === 'double' || type === 'float') return javaInt(compareFloating(value.value as number, javaValueToNumber(other)));
      // Character, Short and Byte return the difference; Integer and Long -1, 0 or 1.
      if (type === 'char' || type === 'short' || type === 'byte') return javaInt((value.value as number) - javaValueToNumber(other));
      const a = value.value as number | bigint, b = other.value as number | bigint;
      return javaInt(a < b ? -1 : a > b ? 1 : 0);
    }
    case 'hashCode': return javaInt(boxedHashCode(value));
    case 'toString': return javaString(javaValueToString(value, ctx.heap));
  }
  return undefined;
}
