/**
 * Java's primitive arithmetic (numeric.ts, #10), at the boundaries of each
 * type. Expected values were checked against JDK 21.
 */
import { describe, it, expect } from 'vitest';
import {
  unaryPromotion,
  binaryPromotion,
  convertNumber,
  arithmetic,
  shift,
  bitwise,
  compareNumbers,
  negate,
  bitwiseNot,
  binaryOperation,
  unaryOperation,
  stepped,
  castPrimitive,
  numericValue,
  parseIntegerText,
  rint,
  floatToString,
  doubleToString,
  javaDecimalLayout,
  INT_MIN,
  INT_MAX,
  LONG_MIN,
  LONG_MAX,
  type NumericType,
} from '../numeric';
import { JavaRuntimeError } from '../errors';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import type { JavaPrimitive } from '../types';

const v = (type: NumericType | 'boolean', value: number | bigint | boolean): JavaPrimitive => ({ kind: 'primitive', javaType: type, value });

describe('promotion (JLS §5.6)', () => {
  it('promotes byte, short and char to int on their own', () => {
    expect(['byte', 'short', 'char', 'int'].map(t => unaryPromotion(t as NumericType))).toEqual(['int', 'int', 'int', 'int']);
    expect(['long', 'float', 'double'].map(t => unaryPromotion(t as NumericType))).toEqual(['long', 'float', 'double']);
  });

  it('promotes a pair to double, else float, else long, else int', () => {
    expect(binaryPromotion('char', 'byte')).toBe('int');
    expect(binaryPromotion('int', 'long')).toBe('long');
    expect(binaryPromotion('long', 'float')).toBe('float');
    expect(binaryPromotion('float', 'double')).toBe('double');
    expect(binaryPromotion('short', 'char')).toBe('int');
  });
});

describe('convertNumber (JLS §5.1.2, §5.1.3)', () => {
  it('truncates floating point toward zero, saturating at int and long, with NaN as 0', () => {
    expect(convertNumber(3.9e10, 'int')).toBe(INT_MAX);
    expect(convertNumber(-3.9e10, 'int')).toBe(INT_MIN);
    expect(convertNumber(NaN, 'int')).toBe(0);
    expect(convertNumber(-2.9, 'int')).toBe(-2);
    expect(Object.is(convertNumber(-0.5, 'int'), 0)).toBe(true);
    expect(convertNumber(3.9e10, 'long')).toBe(39000000000n);
    expect(convertNumber(1e30, 'long')).toBe(LONG_MAX);
    expect(convertNumber(-Infinity, 'long')).toBe(LONG_MIN);
    expect(convertNumber(NaN, 'long')).toBe(0n);
  });

  it('keeps the low bits when narrowing to byte, short or char, via int for floating point', () => {
    expect(convertNumber(200, 'byte')).toBe(-56);
    expect(convertNumber(40000, 'short')).toBe(-25536);
    expect(convertNumber(-1, 'char')).toBe(65535);
    expect(convertNumber(65.7, 'char')).toBe(65);
    expect(convertNumber(1e10, 'byte')).toBe(-1); // 1e10 saturates to 0x7fffffff first
    expect(convertNumber(-1e10, 'short')).toBe(0);
    expect(convertNumber(5000000000n, 'int')).toBe(705032704);
    expect(convertNumber(-1n, 'char')).toBe(65535);
  });

  it('widens exactly, and rounds a long to float once', () => {
    expect(convertNumber(97, 'long')).toBe(97n);
    expect(convertNumber(LONG_MAX, 'double')).toBe(2 ** 63); // the nearest double
    expect(convertNumber(16777217n, 'float')).toBe(16777216);
    // Through a double this would round twice and land one float lower (checked with JDK 21).
    const bits = new DataView(new ArrayBuffer(4));
    bits.setFloat32(0, convertNumber((1n << 53n) + (1n << 29n) + 1n, 'float') as number);
    expect(bits.getInt32(0)).toBe(1509949441);
    expect(convertNumber(1.1, 'float')).toBe(Math.fround(1.1));
  });
});

describe('arithmetic', () => {
  it('wraps int overflow, and truncates division', () => {
    expect(arithmetic('+', INT_MAX, 1, 'int')).toBe(INT_MIN);
    expect(arithmetic('-', INT_MIN, 1, 'int')).toBe(INT_MAX);
    expect(arithmetic('*', INT_MAX, 2, 'int')).toBe(-2);
    expect(arithmetic('*', 65536, 65536, 'int')).toBe(0);
    expect(arithmetic('/', INT_MIN, -1, 'int')).toBe(INT_MIN);
    expect(arithmetic('/', -7, 2, 'int')).toBe(-3);
    expect(arithmetic('%', 7, -3, 'int')).toBe(1);
    expect(arithmetic('%', -7, 3, 'int')).toBe(-1);
    expect(Object.is(arithmetic('%', -4, 2, 'int'), 0)).toBe(true);
  });

  it('wraps long overflow', () => {
    expect(arithmetic('+', LONG_MAX, 1n, 'long')).toBe(LONG_MIN);
    expect(arithmetic('*', 2432902008176640000n, 21n, 'long')).toBe(-4249290049419214848n); // 21! overflows
    expect(arithmetic('/', LONG_MIN, -1n, 'long')).toBe(LONG_MIN);
    expect(arithmetic('/', -7n, 2n, 'long')).toBe(-3n);
    expect(arithmetic('%', -7n, 3n, 'long')).toBe(-1n);
  });

  it('throws ArithmeticException for integer division and remainder by zero only', () => {
    for (const [op, type, zero] of [['/', 'int', 0], ['%', 'int', 0], ['/', 'long', 0n], ['%', 'long', 0n]] as const) {
      expect(() => arithmetic(op, type === 'long' ? 1n : 1, zero, type)).toThrow(new JavaRuntimeError('ArithmeticException', '/ by zero', 0));
    }
    expect(arithmetic('/', 5, 0, 'double')).toBe(Infinity);
    expect(arithmetic('/', -5, 0, 'double')).toBe(-Infinity);
    expect(arithmetic('/', 0, 0, 'float')).toBeNaN();
    expect(arithmetic('%', -7.5, 2, 'double')).toBe(-1.5);
  });

  it('rounds every float result to float', () => {
    const f = Math.fround;
    expect(arithmetic('*', f(1.1), 3, 'float')).toBe(f(f(1.1) * 3));
    expect(arithmetic('+', f(0.1), f(0.2), 'float')).toBe(f(0.3));
    expect(arithmetic('+', 16777216, 1, 'float')).toBe(16777216);
  });
});

describe('shifts and bitwise operators', () => {
  it('uses only the low 5 bits of an int shift distance and the low 6 of a long one', () => {
    expect(shift('<<', 1, 35, 'int')).toBe(8);
    expect(shift('<<', 1n, 67, 'long')).toBe(8n);
    expect(shift('<<', 1n, 63, 'long')).toBe(LONG_MIN);
    expect(shift('>>', -16, 2, 'int')).toBe(-4);
    expect(shift('>>>', -1, 28, 'int')).toBe(15);
    expect(shift('>>>', -1n, 60, 'long')).toBe(15n);
    expect(shift('>>', 8, -1, 'int')).toBe(0);
    expect(shift('<<', 1, 65n, 'int')).toBe(2); // a long distance: its low bits
  });

  it('computes & | ^ ~ on ints and longs', () => {
    expect(bitwise('&', 12, 10, 'int')).toBe(8);
    expect(bitwise('|', 12n, 3n, 'long')).toBe(15n);
    expect(bitwise('^', -1, 5, 'int')).toBe(-6);
    expect(bitwiseNot(0, 'int')).toBe(-1);
    expect(bitwiseNot(LONG_MAX, 'long')).toBe(LONG_MIN);
  });
});

describe('comparison and negation', () => {
  it('compares NaN unequal to everything, and -0.0 equal to 0.0', () => {
    expect(compareNumbers('==', NaN, NaN)).toBe(false);
    expect(compareNumbers('!=', NaN, NaN)).toBe(true);
    expect(compareNumbers('<', NaN, 1)).toBe(false);
    expect(compareNumbers('==', -0, 0)).toBe(true);
    expect(compareNumbers('<', LONG_MAX - 1n, LONG_MAX)).toBe(true);
  });

  it('wraps the negation of the minimum int and long to itself', () => {
    expect(negate(INT_MIN, 'int')).toBe(INT_MIN);
    expect(negate(LONG_MIN, 'long')).toBe(LONG_MIN);
    expect(negate(5000000000n, 'long')).toBe(-5000000000n);
    expect(Object.is(negate(0, 'double'), -0)).toBe(true);
  });
});

describe('operators on Java values', () => {
  it('promotes before operating: char + int is an int, long * int a long', () => {
    expect(binaryOperation('+', v('char', 97), v('int', 1))).toEqual(v('int', 98));
    expect(binaryOperation('+', v('char', 97), v('char', 98))).toEqual(v('int', 195));
    expect(binaryOperation('*', v('long', 20n), v('int', 3))).toEqual(v('long', 60n));
    expect(binaryOperation('/', v('int', 5), v('double', 2))).toEqual(v('double', 2.5));
    expect(binaryOperation('<=', v('char', 99), v('char', 101))).toEqual(v('boolean', true));
    expect(binaryOperation('==', v('long', 5n), v('int', 5))).toEqual(v('boolean', true));
    expect(binaryOperation('<<', v('byte', 1), v('long', 4n))).toEqual(v('int', 16)); // the left operand's type
  });

  it('applies & | ^ == != to booleans as booleans', () => {
    expect(binaryOperation('&', v('boolean', true), v('boolean', false))).toEqual(v('boolean', false));
    expect(binaryOperation('|', v('boolean', false), v('boolean', true))).toEqual(v('boolean', true));
    expect(binaryOperation('^', v('boolean', true), v('boolean', true))).toEqual(v('boolean', false));
    expect(binaryOperation('!=', v('boolean', true), v('boolean', false))).toEqual(v('boolean', true));
  });

  it('rejects operators javac would reject', () => {
    expect(() => binaryOperation('+', v('boolean', true), v('int', 1))).toThrow("The operator + can't be applied to boolean and int");
    expect(() => binaryOperation('<<', v('double', 1), v('int', 1))).toThrow("can't be applied to double and int");
    expect(() => binaryOperation('&', v('double', 1), v('int', 1))).toThrow("can't be applied to double and int");
    expect(() => unaryOperation('~', v('float', 1))).toThrow("The operator ~ can't be applied to float");
  });

  it('promotes the operand of - and +', () => {
    expect(unaryOperation('-', v('char', 97))).toEqual(v('int', -97));
    expect(unaryOperation('+', v('byte', -5))).toEqual(v('int', -5));
    expect(unaryOperation('-', v('long', LONG_MIN))).toEqual(v('long', LONG_MIN));
    expect(unaryOperation('~', v('long', 0n))).toEqual(v('long', -1n));
    expect(unaryOperation('!', v('boolean', true))).toEqual(v('boolean', false));
  });

  it('steps ++ and -- within the variable type', () => {
    expect(stepped(v('byte', 127), 1)).toEqual(v('byte', -128));
    expect(stepped(v('short', -32768), -1)).toEqual(v('short', 32767));
    expect(stepped(v('char', 65535), 1)).toEqual(v('char', 0));
    expect(stepped(v('char', 97), 1)).toEqual(v('char', 98));
    expect(stepped(v('int', INT_MAX), 1)).toEqual(v('int', INT_MIN));
    expect(stepped(v('long', LONG_MAX), 1)).toEqual(v('long', LONG_MIN));
    expect(stepped(v('float', 16777216), 1)).toEqual(v('float', 16777216));
    expect(stepped(v('double', 1.5), 1)).toEqual(v('double', 2.5));
  });

  it('casts between numeric types, and a boolean only to boolean', () => {
    expect(castPrimitive(v('double', 39000000000), 'long')).toEqual(v('long', 39000000000n));
    expect(castPrimitive(v('int', 200), 'byte')).toEqual(v('byte', -56));
    expect(castPrimitive(v('long', -1n), 'int')).toEqual(v('int', -1));
    expect(castPrimitive(v('int', 97), 'char')).toEqual(v('char', 97));
    expect(castPrimitive(v('boolean', true), 'boolean')).toEqual(v('boolean', true));
    expect(() => castPrimitive(v('int', 1), 'boolean')).toThrow("A int can't be cast to boolean");
    expect(numericValue('short', 5)).toEqual(v('short', 5));
  });
});

describe('parseIntegerText (Integer.parseInt and friends)', () => {
  const nfe = (message: string) => new JavaRuntimeError('NumberFormatException', message, 0);

  it('parses a sign and digits in the radix', () => {
    expect(parseIntegerText('+7', 10, 'int')).toBe(7);
    expect(parseIntegerText('-80000000', 16, 'int')).toBe(INT_MIN);
    expect(parseIntegerText('7fffffff', 16, 'int')).toBe(INT_MAX);
    expect(parseIntegerText('-9223372036854775808', 10, 'long')).toBe(LONG_MIN);
    expect(parseIntegerText('-128', 10, 'byte')).toBe(-128);
  });

  it("throws Java's NumberFormatException messages", () => {
    expect(() => parseIntegerText('3000000000', 10, 'int')).toThrow(nfe('For input string: "3000000000"'));
    expect(() => parseIntegerText(' 42', 10, 'int')).toThrow(nfe('For input string: " 42"'));
    expect(() => parseIntegerText('zz', 16, 'int')).toThrow(nfe('For input string: "zz" under radix 16'));
    expect(() => parseIntegerText('', 10, 'int')).toThrow(nfe('For input string: ""'));
    expect(() => parseIntegerText('12abc', 10, 'int')).toThrow(nfe('For input string: "12abc"'));
    expect(() => parseIntegerText('9223372036854775808', 10, 'long')).toThrow(nfe('For input string: "9223372036854775808"'));
    expect(() => parseIntegerText('40000', 10, 'short')).toThrow(nfe('Value out of range. Value:"40000" Radix:10'));
    expect(() => parseIntegerText('200', 10, 'byte')).toThrow(nfe('Value out of range. Value:"200" Radix:10'));
  });
});

describe('floating point', () => {
  it('rint rounds half to even, keeping the sign of zero', () => {
    expect([2.5, 3.5, -2.5, 0.5, 1.4999, 2.6].map(rint)).toEqual([2, 4, -2, 0, 1, 3]);
    expect(Object.is(rint(-0.4), -0)).toBe(true);
    expect(rint(1e300)).toBe(1e300);
  });

  it('lays digits out as Double.toString and Float.toString do', () => {
    expect(javaDecimalLayout('1', 0)).toBe('1.0');
    expect(javaDecimalLayout('15', 2)).toBe('150.0');
    expect(javaDecimalLayout('123', -3)).toBe('0.00123');
    expect(javaDecimalLayout('1', -4)).toBe('1.0E-4');
    expect(javaDecimalLayout('9999999', 6)).toBe('9999999.0');
    expect(javaDecimalLayout('1', 7)).toBe('1.0E7');
    expect(javaDecimalLayout('123', 10)).toBe('1.23E10');
  });

  it('prints floats as Float.toString does (JDK 21)', () => {
    const f = Math.fround;
    expect(floatToString(f(1.1))).toBe('1.1');
    expect(floatToString(f(f(1.1) * 3))).toBe('3.3000002');
    expect(floatToString(f(f(0.1) + f(0.2)))).toBe('0.3');
    expect(floatToString(f(100 / 3))).toBe('33.333332');
    expect(floatToString(f(1e10))).toBe('1.0E10');
    expect(floatToString(f(1e-5))).toBe('1.0E-5');
    expect(floatToString(16777216)).toBe('1.6777216E7');
    expect(floatToString(f(-2.5))).toBe('-2.5');
    expect(['NaN', 'Infinity', '-Infinity', '0.0', '-0.0']).toEqual([NaN, Infinity, -Infinity, 0, -0].map(floatToString));
  });

  it('prints doubles as Double.toString does (JDK 21, #19)', () => {
    const cases: [number, string][] = [
      [1e7, '1.0E7'], [123456789, '1.23456789E8'], [0.0001, '1.0E-4'], [1e21, '1.0E21'], [1500000 * 12, '1.8E7'],
      [5e-324, '4.9E-324'], [1.7976931348623157e308, '1.7976931348623157E308'], [100, '100.0'], [0.001, '0.001'],
      [9999999, '9999999.0'], [0.1 + 0.2, '0.30000000000000004'], [1e-300, '1.0E-300'], [2e23, '2.0E23'], [-2.5, '-2.5'],
    ];
    for (const [d, java] of cases) expect(doubleToString(d), java).toBe(java);
    expect([NaN, Infinity, -Infinity, 0, -0].map(doubleToString)).toEqual(['NaN', 'Infinity', '-Infinity', '0.0', '-0.0']);
  });

  it('picks the closest of the shortest decimals, ties to even, and lets two digits compete with one', () => {
    const fromBits = (bits: number) => {
      const view = new DataView(new ArrayBuffer(4));
      view.setUint32(0, bits);
      return view.getFloat32(0);
    };
    const cases: [number, string][] = [
      [0xc4b79100, '-1468.5312'], // an exact tie at 8 digits: the even one
      [0x45ad9740, '5554.9062'],
      [0xc212c800, '-36.695312'],
      [0x0f800000, '1.2621775E-29'], // a power of two: the rounding interval is lopsided
      [0x6b000000, '1.5474251E26'],
      [0x00000001, '1.4E-45'], // Float.MIN_VALUE: 1.4 is closer than 1.0 (or 1)
      [0x00000002, '2.8E-45'],
      [0x7f7fffff, '3.4028235E38'], // Float.MAX_VALUE
      [0x00800000, '1.1754944E-38'], // the smallest normal float (JDK 18 and earlier printed 1.17549435E-38)
    ];
    for (const [bits, java] of cases) expect(floatToString(fromBits(bits)), java).toBe(java);
  });
});

describe('in programs', () => {
  const run = (body: string) => {
    const source = `public class Main {\n  public static void main(String[] args) {\n    ${body}\n  }\n}`;
    return new JavaInterpreter().execute(parseJava(source));
  };
  const stdout = (body: string) => run(body).snapshots.at(-1)?.stdout.join('\n');

  it('stops at a literal javac rejects as too large', () => {
    expect(run('int x = 2147483649;').error).toBe('Line 3: Integer number too large: 2147483649');
    expect(run('long x = 0x1_0000_0000_0000_0000L;').error).toBe('Line 3: Integer number too large: 0x1_0000_0000_0000_0000L');
    expect(run('float f = 1e40f;').error).toBe('Line 3: Floating-point number out of range: 1e40f');
  });

  it('allows the minimum int and long, written with a minus sign', () => {
    expect(stdout('System.out.println(-2147483648 + " " + -9223372036854775808L);')).toBe('-2147483648 -9223372036854775808');
  });

  it('throws NullPointerException for arithmetic on a null Integer', () => {
    const result = run('Integer n = null;\n    int m = n + 1;');
    expect(result.error).toBe('Exception in thread "main" java.lang.NullPointerException: Cannot use null as a number with the operator +');
  });

  it('converts a returned value to the return type', () => {
    const source = `public class Main {
  static double half(int n) { return n / 2; }
  static long big() { return 5; }
  static int code(char c) { return c; }
  public static void main(String[] args) {
    System.out.println(half(5) + " " + (big() * 3000000000L) + " " + code('a'));
  }
}`;
    expect(new JavaInterpreter().execute(parseJava(source)).snapshots.at(-1)?.stdout).toEqual(['2.0 15000000000 97']);
  });
});
