/**
 * Java's primitive arithmetic (JLS §4.2, §5.1, §5.6, §15.15–§15.22) on the
 * interpreter's representation of numbers:
 *
 *   byte, short, int   a JS number within the type's range
 *   char               a JS number: the UTF-16 code unit, 0 to 65535
 *   long               a bigint within the signed 64-bit range
 *   float              a JS number rounded to single precision (Math.fround)
 *   double             a JS number
 *
 * Every function returns a value already in its type's range, so nothing
 * needs fixing up afterwards.
 *
 * This module doesn't depend on the interpreter, so the planned core rewrite
 * (#12–#14) can reuse it.
 */
import type { JavaPrimitive, JavaPrimitiveType } from './types';
import { InterpreterError, JavaRuntimeError } from './errors';

export type NumericType = 'byte' | 'short' | 'char' | 'int' | 'long' | 'float' | 'double';
/** The types arithmetic happens in: operands are promoted to one of these (JLS §5.6). */
export type PromotedType = 'int' | 'long' | 'float' | 'double';
export type NumericValue = number | bigint;

export type ArithmeticOperator = '+' | '-' | '*' | '/' | '%';
export type ShiftOperator = '<<' | '>>' | '>>>';
export type BitwiseOperator = '&' | '|' | '^';
export type ComparisonOperator = '<' | '<=' | '>' | '>=' | '==' | '!=';

const NUMERIC_TYPES = new Set<string>(['byte', 'short', 'char', 'int', 'long', 'float', 'double']);

export function isNumericType(type: string): type is NumericType {
  return NUMERIC_TYPES.has(type);
}

// ── Promotion and conversion ──

/** Unary numeric promotion (JLS §5.6.1): byte, short and char become int. */
export function unaryPromotion(type: NumericType): PromotedType {
  return type === 'long' || type === 'float' || type === 'double' ? type : 'int';
}

/** Binary numeric promotion (JLS §5.6.2): double, else float, else long, else int. */
export function binaryPromotion(a: NumericType, b: NumericType): PromotedType {
  if (a === 'double' || b === 'double') return 'double';
  if (a === 'float' || b === 'float') return 'float';
  if (a === 'long' || b === 'long') return 'long';
  return 'int';
}

export const INT_MIN = -2147483648;
export const INT_MAX = 2147483647;
export const LONG_MIN = -(2n ** 63n);
export const LONG_MAX = 2n ** 63n - 1n;
const TWO_POW_63 = 2 ** 63;
const TWO_POW_53 = 2n ** 53n;

/** A double or float truncated toward zero into int's range, saturating; NaN is 0 (JLS §5.1.3). */
function floatingToInt(n: number): number {
  if (n !== n) return 0; // NaN
  if (n >= INT_MAX) return INT_MAX;
  if (n <= INT_MIN) return INT_MIN;
  return Math.trunc(n) | 0; // | 0 also turns -0 into 0
}

/** A double or float truncated toward zero into long's range, saturating; NaN is 0 (JLS §5.1.3). */
function floatingToLong(n: number): bigint {
  if (n !== n) return 0n;
  if (n >= TWO_POW_63) return LONG_MAX;
  if (n <= -TWO_POW_63) return LONG_MIN;
  return BigInt(Math.trunc(n));
}

/** An int's value as byte, short or char (its low 8 or 16 bits), or unchanged as int. */
function narrowInt(n: number, to: 'byte' | 'short' | 'char' | 'int'): number {
  switch (to) {
    case 'byte': return (n << 24) >> 24;
    case 'short': return (n << 16) >> 16;
    case 'char': return n & 0xffff;
    case 'int': return n;
  }
}

/**
 * A long converted to float by one IEEE rounding (to nearest, ties to even).
 * Going through a double first would round twice, which is wrong for a few
 * values above 2^53.
 */
function longToFloat(value: bigint): number {
  const magnitude = value < 0n ? -value : value;
  if (magnitude <= TWO_POW_53) return Math.fround(Number(value)); // exact as a double
  const shift = BigInt(magnitude.toString(2).length - 24); // keep 24 significant bits
  let significand = magnitude >> shift;
  const rest = magnitude - (significand << shift);
  const half = 1n << (shift - 1n);
  if (rest > half || (rest === half && (significand & 1n) === 1n)) significand += 1n;
  const result = Number(significand << shift); // at most 25 significant bits: exact
  return value < 0n ? -result : result;
}

/**
 * A number of any numeric type converted to `to`, by widening (JLS §5.1.2)
 * or narrowing (JLS §5.1.3) primitive conversion. A bigint is a long:
 * narrowing it to an integral type keeps its low bits. A number narrowed to
 * an integral type is first truncated toward zero, saturating at int's (or
 * long's) range with NaN as 0; byte, short and char then keep the low bits
 * of that int.
 */
export function convertNumber(value: NumericValue, to: NumericType): NumericValue {
  if (typeof value === 'bigint') {
    switch (to) {
      case 'long': return value;
      case 'double': return Number(value);
      case 'float': return longToFloat(value);
      default: return narrowInt(Number(BigInt.asIntN(32, value)), to);
    }
  }
  switch (to) {
    case 'double': return value;
    case 'float': return Math.fround(value);
    case 'long': return floatingToLong(value);
    default: return narrowInt(floatingToInt(value), to);
  }
}

// ── Operators ──

function divisionByZero(): JavaRuntimeError {
  return new JavaRuntimeError('ArithmeticException', '/ by zero', 0);
}

/**
 * `a op b` for + - * / %, with both operands already of the promoted type.
 * Integer arithmetic wraps; integer division and remainder by zero throw
 * ArithmeticException, and truncate toward zero. Floating-point arithmetic
 * follows IEEE 754 (5.0 / 0 is Infinity), rounding float results to float.
 */
export function arithmetic(op: ArithmeticOperator, a: NumericValue, b: NumericValue, type: PromotedType): NumericValue {
  if (type === 'long') {
    const x = a as bigint, y = b as bigint;
    switch (op) {
      case '+': return BigInt.asIntN(64, x + y);
      case '-': return BigInt.asIntN(64, x - y);
      case '*': return BigInt.asIntN(64, x * y);
      case '/':
        if (y === 0n) throw divisionByZero();
        return BigInt.asIntN(64, x / y); // Long.MIN_VALUE / -1 wraps to Long.MIN_VALUE
      case '%':
        if (y === 0n) throw divisionByZero();
        return x % y;
    }
  }
  const x = a as number, y = b as number;
  if (type === 'int') {
    switch (op) {
      case '+': return (x + y) | 0;
      case '-': return (x - y) | 0;
      case '*': return Math.imul(x, y);
      case '/':
        if (y === 0) throw divisionByZero();
        return (x / y) | 0; // truncates; Integer.MIN_VALUE / -1 wraps
      case '%':
        if (y === 0) throw divisionByZero();
        return (x % y) | 0; // | 0 turns -0 into 0
    }
  }
  let r: number;
  switch (op) {
    case '+': r = x + y; break;
    case '-': r = x - y; break;
    case '*': r = x * y; break;
    case '/': r = x / y; break;
    case '%': r = x % y; break; // truncated remainder, as Java's %
  }
  return type === 'float' ? Math.fround(r) : r;
}

/**
 * `a op distance` for << >> >>>, with `a` already of its promoted type. Only
 * the low 5 bits of the distance count for an int, and the low 6 for a long.
 */
export function shift(op: ShiftOperator, a: NumericValue, distance: NumericValue, type: 'int' | 'long'): NumericValue {
  const d = typeof distance === 'bigint' ? Number(distance & 63n) : distance;
  if (type === 'int') {
    const x = a as number, n = d & 31;
    switch (op) {
      case '<<': return x << n;
      case '>>': return x >> n;
      case '>>>': return (x >>> n) | 0;
    }
  }
  const x = a as bigint, n = BigInt(d & 63);
  switch (op) {
    case '<<': return BigInt.asIntN(64, x << n);
    case '>>': return x >> n;
    case '>>>': return BigInt.asIntN(64, BigInt.asUintN(64, x) >> n);
  }
}

/** `a op b` for & | ^ on two ints or two longs. */
export function bitwise(op: BitwiseOperator, a: NumericValue, b: NumericValue, type: 'int' | 'long'): NumericValue {
  if (type === 'long') {
    const x = a as bigint, y = b as bigint;
    return op === '&' ? x & y : op === '|' ? x | y : x ^ y;
  }
  const x = a as number, y = b as number;
  return op === '&' ? x & y : op === '|' ? x | y : x ^ y;
}

/** `a op b` for a comparison, with both operands already of the promoted type. NaN compares unequal to everything. */
export function compareNumbers(op: ComparisonOperator, a: NumericValue, b: NumericValue): boolean {
  switch (op) {
    case '<': return a < b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '==': return a === b; // the same type, so === compares values
    case '!=': return a !== b;
  }
}

/** `-a`, with `a` already of its promoted type. Negating the minimum int or long wraps to itself. */
export function negate(a: NumericValue, type: PromotedType): NumericValue {
  if (type === 'long') return BigInt.asIntN(64, -(a as bigint));
  if (type === 'int') return -(a as number) | 0;
  return -(a as number); // exact for float too
}

/** `~a` for an int or a long. */
export function bitwiseNot(a: NumericValue, type: 'int' | 'long'): NumericValue {
  return type === 'long' ? ~(a as bigint) : ~(a as number);
}

// ── On Java values ──

/** A primitive value of a numeric type. */
export function numericValue(type: NumericType, value: NumericValue): JavaPrimitive {
  return { kind: 'primitive', javaType: type, value };
}

function booleanValue(value: boolean): JavaPrimitive {
  return { kind: 'primitive', javaType: 'boolean', value };
}

/** A value converted to another numeric type, or returned as it is when it has that type. */
export function toNumericType(value: JavaPrimitive, type: NumericType): JavaPrimitive {
  if (value.javaType === type) return value;
  return numericValue(type, convertNumber(value.value as NumericValue, type));
}

/**
 * A binary operator applied to two primitives (JLS §15.17–§15.24):
 * arithmetic, shifts, comparisons, and & | ^ on two integers or two booleans.
 * Numeric operands are promoted first, so `'a' + 1` is the int 98 and
 * `5L * 2` a long. `+` on strings and the short-circuit && and || are the
 * interpreter's; an operator Java has no meaning for here (`true + 1`) is an
 * error, as javac would reject it.
 */
export function binaryOperation(op: string, left: JavaPrimitive, right: JavaPrimitive): JavaPrimitive {
  if (left.javaType === 'boolean' || right.javaType === 'boolean') {
    if (left.javaType === 'boolean' && right.javaType === 'boolean') {
      const a = left.value as boolean, b = right.value as boolean;
      switch (op) {
        case '&': return booleanValue(a && b);
        case '|': return booleanValue(a || b);
        case '^': case '!=': return booleanValue(a !== b);
        case '==': return booleanValue(a === b);
      }
    }
    throw badOperands(op, left, right);
  }
  const lt = left.javaType as NumericType, rt = right.javaType as NumericType;
  if (op === '<<' || op === '>>' || op === '>>>') {
    const type = unaryPromotion(lt);
    if (type !== 'int' && type !== 'long' || unaryPromotion(rt) === 'float' || unaryPromotion(rt) === 'double') throw badOperands(op, left, right);
    return numericValue(type, shift(op, convertNumber(left.value as NumericValue, type), right.value as NumericValue, type));
  }
  const type = lt === rt && (lt === 'int' || lt === 'double') ? lt : binaryPromotion(lt, rt);
  const a = lt === type ? left.value as NumericValue : convertNumber(left.value as NumericValue, type);
  const b = rt === type ? right.value as NumericValue : convertNumber(right.value as NumericValue, type);
  switch (op) {
    case '+': case '-': case '*': case '/': case '%':
      return numericValue(type, arithmetic(op, a, b, type));
    case '<': case '<=': case '>': case '>=': case '==': case '!=':
      return booleanValue(compareNumbers(op, a, b));
    case '&': case '|': case '^':
      if (type !== 'int' && type !== 'long') throw badOperands(op, left, right);
      return numericValue(type, bitwise(op, a, b, type));
  }
  throw badOperands(op, left, right);
}

function badOperands(op: string, left: JavaPrimitive, right: JavaPrimitive): InterpreterError {
  return new InterpreterError(`The operator ${op} can't be applied to ${left.javaType} and ${right.javaType}`, 0);
}

/** A prefix operator on a primitive: `-`, `+` (both promote), `~`, `!`. */
export function unaryOperation(op: '-' | '+' | '~' | '!', value: JavaPrimitive): JavaPrimitive {
  if (value.javaType === 'boolean') {
    if (op === '!') return booleanValue(!(value.value as boolean));
    throw new InterpreterError(`The operator ${op} can't be applied to boolean`, 0);
  }
  const type = unaryPromotion(value.javaType as NumericType);
  const a = convertNumber(value.value as NumericValue, type);
  switch (op) {
    case '-': return numericValue(type, negate(a, type));
    case '+': return numericValue(type, a);
    case '~':
      if (type === 'int' || type === 'long') return numericValue(type, bitwiseNot(a, type));
      break;
  }
  throw new InterpreterError(`The operator ${op} can't be applied to ${value.javaType}`, 0);
}

/**
 * `++`/`--`: `x + 1` converted back to x's own type (JLS §15.14.2), so a
 * byte 127 becomes -128 and the char 'a' becomes 'b'.
 */
export function stepped(value: JavaPrimitive, delta: 1 | -1): JavaPrimitive {
  const type = value.javaType as NumericType;
  const promoted = unaryPromotion(type);
  const one = promoted === 'long' ? BigInt(delta) : delta;
  const sum = arithmetic('+', convertNumber(value.value as NumericValue, promoted), one, promoted);
  return numericValue(type, convertNumber(sum, type));
}

/** A cast between primitive types (JLS §5.5). A boolean casts only to boolean. */
export function castPrimitive(value: JavaPrimitive, to: JavaPrimitiveType): JavaPrimitive {
  if (value.javaType === to) return value;
  if (to === 'boolean' || value.javaType === 'boolean') {
    throw new InterpreterError(`A ${value.javaType} can't be cast to ${to}`, 0);
  }
  return toNumericType(value, to);
}

// ── Parsing ──

const INT_RANGE = { int: [INT_MIN, INT_MAX], short: [-32768, 32767], byte: [-128, 127] } as const;

/**
 * Integer.parseInt, Long.parseLong, Short.parseShort and Byte.parseByte: an
 * optional sign and digits in `radix`, nothing else (no spaces). Throws the
 * NumberFormatException Java throws, with its message.
 */
export function parseIntegerText(text: string, radix: number, type: 'int' | 'long' | 'short' | 'byte'): NumericValue {
  const invalid = () => new JavaRuntimeError('NumberFormatException',
    `For input string: "${text}"${radix === 10 ? '' : ` under radix ${radix}`}`, 0);
  const match = /^([+-]?)([0-9a-zA-Z]+)$/.exec(text);
  if (!match) throw invalid();
  let magnitude = 0n;
  const base = BigInt(radix);
  for (const c of match[2]) {
    const digit = parseInt(c, 36);
    if (digit >= radix) throw invalid();
    magnitude = magnitude * base + BigInt(digit);
  }
  const value = match[1] === '-' ? -magnitude : magnitude;
  if (type === 'long') {
    if (value < LONG_MIN || value > LONG_MAX) throw invalid();
    return value;
  }
  // Short and Byte parse as int first, then report a value outside their own range.
  if (value < BigInt(INT_MIN) || value > BigInt(INT_MAX)) throw invalid();
  const n = Number(value);
  const [min, max] = INT_RANGE[type];
  if (n < min || n > max) {
    throw new JavaRuntimeError('NumberFormatException', `Value out of range. Value:"${text}" Radix:${radix}`, 0);
  }
  return n;
}

// ── Floating point ──

/** Math.rint: the closest integer to x, ties to the even one. */
export function rint(x: number): number {
  if (!Number.isFinite(x) || Number.isInteger(x)) return x;
  const floor = Math.floor(x);
  const fraction = x - floor; // exact: a non-integer double is below 2^52
  const r = fraction < 0.5 ? floor : fraction > 0.5 ? floor + 1 : floor % 2 === 0 ? floor : floor + 1;
  return r === 0 && x < 0 ? -0 : r;
}

/** Decimal digits d1 d2 … dn (no trailing zeros) and an exponent e: the value d1.d2…dn × 10^e. */
export interface Decimal {
  digits: string;
  exponent: number;
}

/** The exact decimal value of a positive finite double (every double is a finite binary fraction). */
function exactDecimal(x: number): Decimal {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  const significand = biased === 0 ? fraction : fraction | 0x10000000000000n;
  const power = (biased === 0 ? 1 : biased) - 1075; // x = significand × 2^power
  const digits = power >= 0 ? (significand << BigInt(power)).toString() : (significand * 5n ** BigInt(-power)).toString();
  const exponent = digits.length - 1 + Math.min(power, 0); // 2^-k = 5^k × 10^-k
  return { digits: digits.replace(/0+$/, ''), exponent };
}

function decimalValue(d: Decimal): number {
  return Number(`${d.digits[0]}.${d.digits.slice(1)}e${d.exponent}`);
}

/**
 * Of the two decimals with `length` significant digits on either side of the
 * exact value, the one that rounds back (`roundsBack`), or when both do, the
 * closer (on a tie, the one with an even last digit). Undefined when neither
 * rounds back.
 */
function closestDecimal(exact: Decimal, length: number, roundsBack: (value: number) => boolean): Decimal | undefined {
  if (exact.digits.length <= length) return exact;
  const below = BigInt(exact.digits.slice(0, length));
  const rest = exact.digits.slice(length);
  const make = (n: bigint): Decimal => {
    const text = n.toString();
    return { digits: text.replace(/0+$/, ''), exponent: exact.exponent + (text.length > length ? 1 : 0) };
  };
  const down = make(below), up = make(below + 1n);
  const downOk = roundsBack(decimalValue(down)), upOk = roundsBack(decimalValue(up));
  if (downOk && upOk) {
    // How the exact value's remaining digits compare with half a unit of the last digit kept.
    const half = rest[0] !== '5' ? (rest[0] > '5' ? 1 : -1) : /[1-9]/.test(rest.slice(1)) ? 1 : 0;
    return half < 0 || (half === 0 && below % 2n === 0n) ? down : up;
  }
  return downOk ? down : upOk ? up : undefined;
}

/**
 * The decimal Float.toString chooses for the positive finite float `f`
 * (JDK 19 and later): of the decimals that round back to `f`, the shortest,
 * and of those the closest to `f`. When one digit is enough, two-digit
 * decimals compete too, which is why Float.MIN_VALUE prints as 1.4E-45
 * rather than 1.0E-45.
 */
function shortestFloat(f: number): Decimal {
  const exact = exactDecimal(f);
  const roundsBack = (value: number) => Math.fround(value) === f;
  for (let length = 1; length <= 9; length++) {
    const best = closestDecimal(exact, length, roundsBack);
    if (best) return length === 1 ? closestDecimal(exact, 2, roundsBack) ?? best : best;
  }
  return exact; // not reached: 9 significant digits always round-trip a float
}

/**
 * The decimal Double.toString chooses for the positive finite double `x`
 * (JDK 19 and later), by the same rule as shortestFloat. V8's shortest
 * round-trip digits are already the closest of the shortest, so only a
 * one-digit result needs work: two-digit decimals compete with it, which is
 * why Double.MIN_VALUE prints as 4.9E-324 rather than 5.0E-324.
 */
export function shortestDouble(x: number): Decimal {
  const [mantissa, exponent] = x.toExponential().split('e');
  const shortest = { digits: mantissa.replace('.', ''), exponent: Number(exponent) };
  if (shortest.digits.length > 1) return shortest;
  return closestDecimal(exactDecimal(x), 2, value => value === x) ?? shortest;
}

/**
 * Digits d1 d2 … dn and a decimal exponent e (the value d1.d2…dn × 10^e),
 * laid out as Double.toString and Float.toString do: plain notation with at
 * least one digit after the point when 10^-3 ≤ |x| < 10^7, and otherwise
 * d.ddd…E±n.
 */
export function javaDecimalLayout(digits: string, exponent: number): string {
  if (exponent >= 7 || exponent < -3) return `${digits[0]}.${digits.slice(1) || '0'}E${exponent}`;
  if (exponent < 0) return `0.${'0'.repeat(-exponent - 1)}${digits}`;
  const integer = digits.slice(0, exponent + 1).padEnd(exponent + 1, '0');
  return `${integer}.${digits.slice(exponent + 1) || '0'}`;
}

/** Double.toString: `0.1`, `5.0`, `1.0E7`, `1.23456789E8`, `4.9E-324`, `NaN`. */
export function doubleToString(d: number): string {
  if (d !== d) return 'NaN';
  if (d === Infinity) return 'Infinity';
  if (d === -Infinity) return '-Infinity';
  if (d === 0) return Object.is(d, -0) ? '-0.0' : '0.0';
  const { digits, exponent } = shortestDouble(Math.abs(d));
  return (d < 0 ? '-' : '') + javaDecimalLayout(digits, exponent);
}

/** Float.toString: `3.3000002`, `0.3`, `1.0E10`, `NaN`. */
export function floatToString(f: number): string {
  if (f !== f) return 'NaN';
  if (f === Infinity) return 'Infinity';
  if (f === -Infinity) return '-Infinity';
  if (f === 0) return Object.is(f, -0) ? '-0.0' : '0.0';
  const { digits, exponent } = shortestFloat(Math.abs(f));
  return (f < 0 ? '-' : '') + javaDecimalLayout(digits, exponent);
}
