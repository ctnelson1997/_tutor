/**
 * Java `String.format` / `System.out.printf` (java.util.Formatter), for the
 * conversions coursework uses: %d %s %S %f %e %E %g %G %c %b %B %x %X %o %h
 * %n %%, with argument indexes (%1$s), width, precision, and the flags
 * - 0 + space , ( .
 *
 * The floating-point conversions round half up from the digits
 * Double.toString would print, as Java's Formatter does, so %.1f of 0.15 is
 * 0.2 (JavaScript's toFixed rounds the binary value and gives 0.1). A bad
 * specifier or argument throws the exception Java throws, with its message.
 */

import { type JavaValue, type JavaHeapEntry, isJavaArray, javaValueToString, javaValueToNumber } from '../types';
import { shortestDouble } from '../numeric';
import { StdlibError } from './context';

const SPEC = /%(?:(\d+)\$)?([-#+ 0,(]*)(\d+)?(?:\.(\d+))?([a-zA-Z%])/g;

const BOXES: Record<string, string> = {
  int: 'Integer', long: 'Long', short: 'Short', byte: 'Byte', char: 'Character',
  float: 'Float', double: 'Double', boolean: 'Boolean',
};

/** The class Java names in IllegalFormatConversionException: `java.lang.Integer`. */
function argClass(arg: JavaValue): string {
  switch (arg.kind) {
    case 'primitive': return `java.lang.${BOXES[arg.javaType]}`;
    case 'string': return 'java.lang.String';
    case 'objectRef': return arg.className;
    default: return 'java.lang.Object';
  }
}

function group(intDigits: string): string {
  // Insert thousands separators into a run of digits.
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `x` (finite, not negative) with `precision` digits after the point, rounded half up. */
function fixed(x: number, precision: number): string {
  let n = 0n;
  if (x !== 0) {
    const { digits, exponent } = shortestDouble(x);
    const shift = exponent - digits.length + 1 + precision; // x × 10^precision = digits × 10^shift
    const d = BigInt(digits);
    if (shift >= 0) {
      n = d * 10n ** BigInt(shift);
    } else {
      const unit = 10n ** BigInt(-shift);
      n = d / unit + ((d % unit) * 2n >= unit ? 1n : 0n);
    }
  }
  const text = n.toString().padStart(precision + 1, '0');
  return precision > 0 ? `${text.slice(0, -precision)}.${text.slice(-precision)}` : text;
}

/** `x` (finite, not negative) rounded half up to `significant` digits: the digits, and the exponent of the first. */
function rounded(x: number, significant: number): { digits: string; exponent: number } {
  if (x === 0) return { digits: '0'.repeat(significant), exponent: 0 };
  const { digits, exponent } = shortestDouble(x);
  if (digits.length <= significant) return { digits: digits.padEnd(significant, '0'), exponent };
  const d = BigInt(digits), unit = 10n ** BigInt(digits.length - significant);
  const n = d / unit + ((d % unit) * 2n >= unit ? 1n : 0n);
  const text = n.toString();
  // 9.995 to three digits is 10.0: one more digit, so the exponent goes up.
  return text.length > significant ? { digits: text.slice(0, significant), exponent: exponent + 1 } : { digits: text, exponent };
}

/** `x` (finite, not negative) in computerized scientific notation: `1.234560e+01`. */
function scientific(x: number, precision: number): string {
  const { digits, exponent } = rounded(x, precision + 1);
  const mantissa = precision > 0 ? `${digits[0]}.${digits.slice(1)}` : digits;
  return `${mantissa}e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`;
}

/** %g: decimal notation when the value, rounded to `precision` significant digits, is in [10^-4, 10^precision). */
function general(x: number, precision: number): string {
  const p = precision === 0 ? 1 : precision;
  if (x === 0) return fixed(0, p - 1);
  const { exponent } = rounded(x, p);
  return exponent >= -4 && exponent < p ? fixed(x, p - 1 - exponent) : scientific(x, p - 1);
}

/** Java's String.hashCode. */
function stringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Format like String.format. `stringify` renders a value for %s the way
 * String.valueOf does (with a user class's own toString()); it defaults to
 * the library's rendering.
 */
export function javaFormat(
  fmt: string,
  args: JavaValue[],
  heap: Map<string, JavaHeapEntry>,
  stringify: (value: JavaValue) => string = v => javaValueToString(v, heap),
): string {
  // One array of a reference type in the varargs position is the arguments
  // themselves (String.format(fmt, objects)); an int[] stays one argument.
  if (args.length === 1 && args[0].kind === 'arrayRef') {
    const array = heap.get(args[0].heapId);
    if (array && isJavaArray(array) && !(array.elementType in BOXES)) args = array.elements;
  }
  let argIndex = 0;
  return fmt.replace(SPEC, (spec, explicitIdx: string | undefined, flags: string, widthStr: string | undefined, precStr: string | undefined, conv: string) => {
    if (conv === '%') return '%';
    if (conv === 'n') return '\n';
    const lower = conv.toLowerCase();
    if (!'dsfegcbxoh'.includes(lower)) throw new StdlibError(`UnknownFormatConversionException: Conversion = '${conv}'`);

    const width = widthStr ? parseInt(widthStr, 10) : 0;
    const precision = precStr !== undefined ? parseInt(precStr, 10) : undefined;
    const left = flags.includes('-');
    const upper = conv !== lower;
    if (precision !== undefined && 'dcxo'.includes(lower)) {
      throw new StdlibError(`IllegalFormatPrecisionException: ${precision}`);
    }

    const idx = explicitIdx ? parseInt(explicitIdx, 10) - 1 : argIndex++;
    if (idx >= args.length) throw new StdlibError(`MissingFormatArgumentException: Format specifier '${spec}'`);
    const arg = args[idx];

    /** Pad text to the width with spaces (on the right with the - flag). */
    const justify = (text: string) => {
      const out = upper ? text.toUpperCase() : text;
      return out.length >= width ? out : left ? out.padEnd(width) : out.padStart(width);
    };
    /** A number: its sign (or parentheses), grouping and zero padding, then justified. */
    const number = (negative: boolean, digits: string) => {
      let body = digits;
      if (flags.includes(',')) {
        const dot = body.indexOf('.');
        body = dot < 0 ? group(body) : group(body.slice(0, dot)) + body.slice(dot);
      }
      const parens = negative && flags.includes('(');
      const prefix = parens ? '(' : negative ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
      const suffix = parens ? ')' : '';
      if (flags.includes('0') && !left) body = body.padStart(width - prefix.length - suffix.length, '0');
      return justify(prefix + body + suffix);
    };
    const mismatch = () => new StdlibError(`IllegalFormatConversionException: ${conv} != ${argClass(arg)}`);

    if (arg.kind === 'null') return justify(lower === 'b' ? 'false' : 'null');

    switch (lower) {
      case 'd': {
        if (arg.kind !== 'primitive' || !['int', 'long', 'short', 'byte'].includes(arg.javaType)) throw mismatch();
        const n = typeof arg.value === 'bigint' ? arg.value : Math.trunc(javaValueToNumber(arg));
        return number(n < 0, (n < 0 ? -n : n).toString());
      }
      case 'x': case 'o': {
        if (arg.kind !== 'primitive' || !['int', 'long', 'short', 'byte'].includes(arg.javaType)) throw mismatch();
        const radix = lower === 'x' ? 16 : 8;
        let digits: string;
        if (typeof arg.value === 'bigint') digits = BigInt.asUintN(64, arg.value).toString(radix);
        else {
          const n = arg.value as number;
          digits = (arg.javaType === 'byte' ? n & 0xff : arg.javaType === 'short' ? n & 0xffff : n >>> 0).toString(radix);
        }
        return justify(flags.includes('0') && !left ? digits.padStart(width, '0') : digits);
      }
      case 'f': case 'e': case 'g': {
        if (arg.kind !== 'primitive' || (arg.javaType !== 'double' && arg.javaType !== 'float')) throw mismatch();
        const x = arg.value as number;
        if (x !== x) return justify('NaN');
        const negative = x < 0 || Object.is(x, -0);
        if (!Number.isFinite(x)) return justify((negative ? (flags.includes('(') ? '(' : '-') : flags.includes('+') ? '+' : '') + 'Infinity' + (negative && flags.includes('(') ? ')' : ''));
        const magnitude = Math.abs(x), p = precision ?? 6;
        const digits = lower === 'f' ? fixed(magnitude, p) : lower === 'e' ? scientific(magnitude, p) : general(magnitude, p);
        return number(negative, digits);
      }
      case 'c': {
        if (arg.kind !== 'primitive' || !['char', 'int', 'short', 'byte'].includes(arg.javaType)) throw mismatch();
        return justify(String.fromCodePoint(arg.value as number));
      }
      case 'b':
        return justify(arg.kind === 'primitive' && typeof arg.value === 'boolean' ? String(arg.value) : 'true');
      case 's': {
        const text = stringify(arg);
        return justify(precision !== undefined ? text.slice(0, precision) : text);
      }
      case 'h': {
        const hash = arg.kind === 'string' ? stringHash(arg.value) : arg.kind === 'primitive' && typeof arg.value === 'number' ? arg.value | 0 : stringHash(stringify(arg));
        return justify((hash >>> 0).toString(16));
      }
    }
    return spec;
  });
}
