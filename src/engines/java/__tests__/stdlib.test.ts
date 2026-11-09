/**
 * Unit tests for the Java standard-library subset (src/engines/java/stdlib).
 *
 * These exercise the pure stdlib functions directly through a lightweight,
 * Map-backed StdlibContext — no full interpreter needed. End-to-end coverage
 * (parsing + dispatch) lives in behavior-comparison.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { javaFormat } from '../stdlib/format';
import { callStaticMethod, getStaticField } from '../stdlib/statics';
import { newBuiltin, callInstanceMethod, getIterableElements } from '../stdlib/collections';
import type { StdlibContext } from '../stdlib/context';
import { isLibrarySubtype, isStringType, isBoxedInstanceOf, isKnownLibraryType } from '../stdlib/hierarchy';
import { qualifiedExceptionName } from '../stdlib/exceptions';
import { libraryStubs } from '../semantic/stubs';
import { readFileSync } from 'node:fs';
import {
  type JavaValue,
  type JavaHeapEntry,
  javaInt,
  javaDouble,
  javaString,
  javaChar,
  javaNull,
  javaValueToString,
  javaValueToNumber,
  javaValueToBoolean,
} from '../types';

function makeCtx(stdin = ''): StdlibContext {
  const heap = new Map<string, JavaHeapEntry>();
  let next = 1;
  return {
    heap,
    allocArray: (elementType, elements) => {
      const id = String(next++);
      heap.set(id, { elementType, elements });
      return id;
    },
    // Like the interpreter's context: everything the stdlib allocates is a library object.
    allocObject: (className, fields) => {
      const id = String(next++);
      heap.set(id, { className, fields, builtin: true });
      return id;
    },
    random: () => 0.5,
    stdin,
    writeStdout: () => {},
    invokeUserMethod: () => undefined,
  };
}

const arrRef = (ctx: StdlibContext, els: JavaValue[], elementType = 'Object'): JavaValue => ({
  kind: 'arrayRef',
  heapId: ctx.allocArray(elementType, els),
});
const num = (v: JavaValue | undefined) => javaValueToNumber(v!);
const bool = (v: JavaValue | undefined) => javaValueToBoolean(v!);
const H = new Map<string, JavaHeapEntry>();

describe('javaFormat', () => {
  it('formats integers with width/flags', () => {
    expect(javaFormat('%d', [javaInt(42)], H)).toBe('42');
    expect(javaFormat('%5d', [javaInt(42)], H)).toBe('   42');
    expect(javaFormat('%-5d|', [javaInt(42)], H)).toBe('42   |');
    expect(javaFormat('%05d', [javaInt(42)], H)).toBe('00042');
    expect(javaFormat('%,d', [javaInt(1234567)], H)).toBe('1,234,567');
    expect(javaFormat('%d', [javaInt(-7)], H)).toBe('-7');
  });

  it('formats floats with precision', () => {
    expect(javaFormat('%.2f', [javaDouble(3.14159)], H)).toBe('3.14');
    expect(javaFormat('%f', [javaDouble(1)], H)).toBe('1.000000');
    expect(javaFormat('%8.2f', [javaDouble(3.5)], H)).toBe('    3.50');
  });

  it('formats strings, chars, hex, booleans', () => {
    expect(javaFormat('Hi %s!', [javaString('Bob')], H)).toBe('Hi Bob!');
    expect(javaFormat('%x', [javaInt(255)], H)).toBe('ff');
    expect(javaFormat('%X', [javaInt(255)], H)).toBe('FF');
    expect(javaFormat('%c', [javaChar(65)], H)).toBe('A');
    expect(javaFormat('%b', [javaValueToNumber(javaInt(1)) ? javaString('x') : javaNull()], H)).toBe('true');
  });

  it('handles %n, %%, and multiple args', () => {
    expect(javaFormat('%d%%%n', [javaInt(50)], H)).toBe('50%\n');
    expect(javaFormat('%s=%d', [javaString('x'), javaInt(7)], H)).toBe('x=7');
  });

  // Expected values below were checked against JDK 21 (#19).
  it('rounds half up from the digits Double.toString prints', () => {
    const f = (fmt: string, x: number) => javaFormat(fmt, [javaDouble(x)], H);
    expect(f('%.1f', 0.15)).toBe('0.2');
    expect(f('%.2f', 1.005)).toBe('1.01');
    expect(f('%.2f', 2.675)).toBe('2.68');
    expect(['%.0f', '%.0f', '%.0f'].map((fmt, i) => f(fmt, [0.5, 1.5, 2.5][i]))).toEqual(['1', '2', '3']);
    expect(f('%.20f', 0.1)).toBe('0.10000000000000000000');
    expect(f('%.2f', 1e20)).toBe('100000000000000000000.00');
    expect(f('%.3f', 1e-7)).toBe('0.000');
  });

  it('writes %e with two exponent digits, and %g in decimal or scientific notation by magnitude', () => {
    const f = (fmt: string, x: number) => javaFormat(fmt, [javaDouble(x)], H);
    expect(f('%e', 12.3456)).toBe('1.234560e+01');
    expect(f('%.2e', 0.000123456)).toBe('1.23e-04');
    expect(f('%e', 0)).toBe('0.000000e+00');
    expect(f('%.0e', 5.5)).toBe('6e+00');
    expect(f('%.3e', 9.9995)).toBe('1.000e+01');
    expect(f('%E', 1e100)).toBe('1.000000E+100');
    expect(f('%g', 0)).toBe('0.00000');
    expect(f('%g', 123456)).toBe('123456');
    expect(f('%g', 1234567)).toBe('1.23457e+06');
    expect(f('%g', 0.0001)).toBe('0.000100000');
    expect(f('%g', 0.00001234)).toBe('1.23400e-05');
    expect(f('%.0g', 12.5)).toBe('1e+01');
    expect(f('%G', 1e-10)).toBe('1.00000E-10');
  });

  it('applies the sign, grouping, padding and parenthesis flags', () => {
    const f = (fmt: string, x: number) => javaFormat(fmt, [javaDouble(x)], H);
    expect(f('%+.2f', 2.5)).toBe('+2.50');
    expect(f('% .2f', 2.5)).toBe(' 2.50');
    expect(f('%08.2f', -3.14159)).toBe('-0003.14');
    expect(f('%,.2f', 1234567.891)).toBe('1,234,567.89');
    expect(f('%(.2f', -2.5)).toBe('(2.50)');
    expect(f('%-10.2f|', Math.PI)).toBe('3.14      |');
    expect(f('%.2f', -0)).toBe('-0.00');
    expect(f('%f', NaN)).toBe('NaN');
    expect(f('%8.2f|', Infinity)).toBe('Infinity|');
    expect(f('%.2f', -Infinity)).toBe('-Infinity');
    expect(javaFormat('%05d', [javaInt(-42)], H)).toBe('-0042');
    expect(javaFormat('%,d', [{ kind: 'primitive', javaType: 'long', value: -1234567890123n }], H)).toBe('-1,234,567,890,123');
  });

  it("throws Java's exceptions for a bad argument or specifier", () => {
    expect(() => javaFormat('%d', [javaDouble(3.5)], H)).toThrow('IllegalFormatConversionException: d != java.lang.Double');
    expect(() => javaFormat('%f', [javaInt(3)], H)).toThrow('IllegalFormatConversionException: f != java.lang.Integer');
    expect(() => javaFormat('%d', [javaChar(99)], H)).toThrow('IllegalFormatConversionException: d != java.lang.Character');
    expect(() => javaFormat('%c', [javaString('s')], H)).toThrow('IllegalFormatConversionException: c != java.lang.String');
    expect(() => javaFormat('%d %d', [javaInt(1)], H)).toThrow("MissingFormatArgumentException: Format specifier '%d'");
    expect(() => javaFormat('%q', [javaInt(1)], H)).toThrow("UnknownFormatConversionException: Conversion = 'q'");
    expect(() => javaFormat('%5.2d', [javaInt(3)], H)).toThrow('IllegalFormatPrecisionException: 2');
  });

  it('renders %s with the given stringify, and takes an Object[] as the arguments', () => {
    expect(javaFormat('p=%s', [javaInt(1)], H, () => '(1, 2)')).toBe('p=(1, 2)');
    expect(javaFormat('%S|%.2s', [javaString('hi'), javaString('hello')], H)).toBe('HI|he');
    expect(javaFormat('%h', [javaString('hi')], H)).toBe('d01');
    const ctx = makeCtx();
    const objects = arrRef(ctx, [javaString('a'), javaInt(7)]);
    expect(javaFormat('%s %d %1$s', [objects], ctx.heap)).toBe('a 7 a');
    expect(javaFormat('%s', [arrRef(ctx, [javaInt(1)], 'int')], ctx.heap)).toMatch(/^\[I@[0-9a-f]{8}$/); // an int[] is one argument
  });
});

describe('getStaticField', () => {
  it('resolves constants', () => {
    expect(num(getStaticField('Math', 'PI'))).toBeCloseTo(Math.PI);
    expect(num(getStaticField('Math', 'E'))).toBeCloseTo(Math.E);
    expect(num(getStaticField('Integer', 'MAX_VALUE'))).toBe(2147483647);
    expect(num(getStaticField('Integer', 'MIN_VALUE'))).toBe(-2147483648);
    expect(bool(getStaticField('Boolean', 'TRUE'))).toBe(true);
  });
  it('returns undefined for unknown fields', () => {
    expect(getStaticField('Math', 'NOPE')).toBeUndefined();
    expect(getStaticField('Nope', 'X')).toBeUndefined();
  });
});

describe('callStaticMethod — Math / wrappers / Character', () => {
  const ctx = makeCtx();
  it('extended Math', () => {
    expect(num(callStaticMethod('Math', 'log10', [javaInt(1000)], ctx))).toBeCloseTo(3);
    expect(num(callStaticMethod('Math', 'hypot', [javaInt(3), javaInt(4)], ctx))).toBeCloseTo(5);
    expect(num(callStaticMethod('Math', 'floorMod', [javaInt(-3), javaInt(5)], ctx))).toBe(2);
    expect(num(callStaticMethod('Math', 'abs', [javaInt(-5)], ctx))).toBe(5);
  });
  it('Integer radix helpers', () => {
    expect(javaValueToString(callStaticMethod('Integer', 'toBinaryString', [javaInt(5)], ctx)!, H)).toBe('101');
    expect(javaValueToString(callStaticMethod('Integer', 'toHexString', [javaInt(255)], ctx)!, H)).toBe('ff');
    expect(num(callStaticMethod('Integer', 'parseInt', [javaString('ff'), javaInt(16)], ctx))).toBe(255);
  });
  it('Character predicates', () => {
    expect(bool(callStaticMethod('Character', 'isDigit', [javaChar(53)], ctx))).toBe(true); // '5'
    expect(bool(callStaticMethod('Character', 'isLetter', [javaChar(53)], ctx))).toBe(false);
    expect(num(callStaticMethod('Character', 'toUpperCase', [javaChar(97)], ctx))).toBe(65); // 'a' -> 'A'
  });
  it('unknown class returns undefined', () => {
    expect(callStaticMethod('Nope', 'x', [], ctx)).toBeUndefined();
  });
});

describe('callStaticMethod — Arrays / Objects / Collections', () => {
  it('Arrays.toString / sort / copyOf', () => {
    const ctx = makeCtx();
    const a = arrRef(ctx, [javaInt(3), javaInt(1), javaInt(2)], 'int');
    expect(javaValueToString(callStaticMethod('Arrays', 'toString', [a], ctx)!, ctx.heap)).toBe('[3, 1, 2]');
    callStaticMethod('Arrays', 'sort', [a], ctx);
    expect(javaValueToString(callStaticMethod('Arrays', 'toString', [a], ctx)!, ctx.heap)).toBe('[1, 2, 3]');
    const copy = callStaticMethod('Arrays', 'copyOf', [a, javaInt(5)], ctx)!;
    expect(javaValueToString(callStaticMethod('Arrays', 'toString', [copy], ctx)!, ctx.heap)).toBe('[1, 2, 3, 0, 0]');
  });
  it("System.arraycopy and the Arrays range methods check as the JDK does, never growing an array (#67, JDK 21's messages)", () => {
    const ctx = makeCtx();
    const ints = (...n: number[]) => arrRef(ctx, n.map(javaInt), 'int');
    const length = (a: JavaValue) => (ctx.heap.get((a as { heapId: string }).heapId) as { elements: unknown[] }).elements.length;
    const copy = (src: JavaValue, sp: number, dest: JavaValue, dp: number, n: number) => () => callStaticMethod('System', 'arraycopy', [src, javaInt(sp), dest, javaInt(dp), javaInt(n)], ctx);
    const big = ints(0, 0, 0, 0, 0, 0);
    expect(copy(ints(10, 20, 30), 0, big, 0, 4)).toThrow('ArrayIndexOutOfBoundsException: arraycopy: last source index 4 out of bounds for int[3]');
    const small = ints(0, 0, 0);
    expect(copy(ints(1, 2, 3, 4, 5), 0, small, 0, 5)).toThrow('ArrayIndexOutOfBoundsException: arraycopy: last destination index 5 out of bounds for int[3]');
    expect(length(small)).toBe(3);
    expect(copy(ints(1, 2, 3), 0, small, -1, 2)).toThrow('arraycopy: destination index -1 out of bounds for int[3]');
    expect(copy(ints(1, 2, 3), -2, small, 0, 1)).toThrow('arraycopy: source index -2 out of bounds for int[3]');
    expect(copy(ints(1, 2, 3), 0, small, 0, -1)).toThrow('arraycopy: length -1 is negative');
    expect(copy(javaNull(), 0, small, 0, 1)).toThrow(/^NullPointerException$/);
    expect(copy(javaString('x'), 0, small, 0, 1)).toThrow('ArrayStoreException: arraycopy: source type java.lang.String is not an array');
    expect(copy(ints(1), 0, arrRef(ctx, [javaInt(0)], 'long'), 0, 1)).toThrow('arraycopy: type mismatch: can not copy int[] into long[]');
    expect(copy(arrRef(ctx, [javaNull()]), 0, small, 0, 1)).toThrow('arraycopy: type mismatch: can not copy object array[] into int[]');
    const fill = (a: JavaValue, from: number, to: number) => () => callStaticMethod('Arrays', 'fill', [a, javaInt(from), javaInt(to), javaInt(7)], ctx);
    expect(fill(ints(0, 0, 0, 0, 0), 0, 8)).toThrow('ArrayIndexOutOfBoundsException: Array index out of range: 8');
    expect(fill(ints(0, 0, 0, 0, 0), 3, 1)).toThrow('IllegalArgumentException: fromIndex(3) > toIndex(1)');
    expect(fill(ints(0, 0, 0, 0, 0), -1, 2)).toThrow('ArrayIndexOutOfBoundsException: Array index out of range: -1');
    expect(() => callStaticMethod('Arrays', 'sort', [ints(5, 4, 3, 2, 1), javaInt(2), javaInt(9)], ctx)).toThrow('Array index out of range: 9');
    expect(() => callStaticMethod('Arrays', 'copyOfRange', [ints(1, 2, 3, 4, 5), javaInt(4), javaInt(2)], ctx)).toThrow('IllegalArgumentException: 4 > 2');
    expect(() => callStaticMethod('Arrays', 'copyOfRange', [ints(1, 2, 3), javaInt(4), javaInt(6)], ctx)).toThrow('arraycopy: length -1 is negative');
    expect(() => callStaticMethod('Arrays', 'copyOf', [ints(1, 2), javaInt(-1)], ctx)).toThrow('NegativeArraySizeException: -1');
    expect(javaValueToString(callStaticMethod('Arrays', 'toString', [callStaticMethod('Arrays', 'copyOfRange', [ints(1, 2, 3), javaInt(1), javaInt(6)], ctx)!], ctx)!, ctx.heap)).toBe('[2, 3, 0, 0, 0]');
  });
  it('Objects.equals / hash / requireNonNull', () => {
    const ctx = makeCtx();
    expect(bool(callStaticMethod('Objects', 'equals', [javaInt(1), javaInt(1)], ctx))).toBe(true);
    expect(bool(callStaticMethod('Objects', 'equals', [javaString('a'), javaString('b')], ctx))).toBe(false);
    expect(bool(callStaticMethod('Objects', 'isNull', [javaNull()], ctx))).toBe(true);
    expect(() => callStaticMethod('Objects', 'requireNonNull', [javaNull()], ctx)).toThrow();
  });
  it('takes a varargs parameter as the array the binder packs (#63): Objects.hash, Collections.addAll', () => {
    const ctx = makeCtx();
    // Objects.hash(1, 2) arrives as one Object[] { 1, 2 }: Arrays.hashCode of it, 994, as in Java.
    expect(num(callStaticMethod('Objects', 'hash', [arrRef(ctx, [javaInt(1), javaInt(2)])], ctx))).toBe(994);
    expect(num(callStaticMethod('Objects', 'hash', [arrRef(ctx, [])], ctx))).toBe(1);
    expect(num(callStaticMethod('Objects', 'hash', [javaNull()], ctx))).toBe(0);
    // A primitive array is one value of the packed Object[], not the elements.
    const ints = arrRef(ctx, [javaInt(1), javaInt(2)], 'int');
    expect(num(callStaticMethod('Objects', 'hash', [arrRef(ctx, [ints])], ctx))).not.toBe(994);
    const list = newBuiltin('ArrayList', [], ctx)!;
    expect(bool(callStaticMethod('Collections', 'addAll', [list, arrRef(ctx, [javaInt(3), javaInt(1)], 'Integer')], ctx))).toBe(true);
    expect(javaValueToString(list, ctx.heap)).toBe('[3, 1]');
    expect(bool(callStaticMethod('Collections', 'addAll', [list, arrRef(ctx, [])], ctx))).toBe(false);
    expect(() => callStaticMethod('Collections', 'addAll', [list, javaNull()], ctx)).toThrow('NullPointerException');
  });
  it("has every varargs method of the stubs in the corpus's extra/varargs-library case, run against the JDK (#63)", () => {
    const stubMethods = new Set([...libraryStubs().flatMap(({ source }) => [...source.matchAll(/(\w+)\([^)]*\.\.\.\s*\w+\)/g)].map(m => m[1]))]);
    const corpus = readFileSync(new URL('./jdk/cases/extra/varargs-library.java', import.meta.url), 'utf8');
    expect(stubMethods.size).toBeGreaterThan(5);
    expect([...stubMethods].filter(name => !corpus.includes(`.${name}(`))).toEqual([]);
  });
  it('Collections.sort / max / min on a list', () => {
    const ctx = makeCtx();
    const list = newBuiltin('ArrayList', [], ctx)!;
    for (const n of [3, 1, 2]) callInstanceMethod(list, 'add', [javaInt(n)], ctx);
    callStaticMethod('Collections', 'sort', [list], ctx);
    expect(javaValueToString(list, ctx.heap)).toBe('[1, 2, 3]');
    expect(num(callStaticMethod('Collections', 'max', [list], ctx))).toBe(3);
    expect(num(callStaticMethod('Collections', 'min', [list], ctx))).toBe(1);
  });
});

describe('collections — lists / sets / maps', () => {
  it('ArrayList add/get/size/remove + iterate', () => {
    const ctx = makeCtx();
    const list = newBuiltin('ArrayList', [], ctx)!;
    callInstanceMethod(list, 'add', [javaInt(5)], ctx);
    callInstanceMethod(list, 'add', [javaInt(3)], ctx);
    expect(num(callInstanceMethod(list, 'size', [], ctx))).toBe(2);
    expect(num(callInstanceMethod(list, 'get', [javaInt(0)], ctx))).toBe(5);
    expect(getIterableElements(list, ctx)!.map(num)).toEqual([5, 3]);
    callInstanceMethod(list, 'remove', [javaInt(0)], ctx);
    expect(getIterableElements(list, ctx)!.map(num)).toEqual([3]);
  });

  it('HashSet de-duplicates; TreeSet keeps order', () => {
    const ctx = makeCtx();
    const set = newBuiltin('HashSet', [], ctx)!;
    for (const n of [1, 1, 2]) callInstanceMethod(set, 'add', [javaInt(n)], ctx);
    expect(num(callInstanceMethod(set, 'size', [], ctx))).toBe(2);
    expect(bool(callInstanceMethod(set, 'contains', [javaInt(2)], ctx))).toBe(true);

    const tree = newBuiltin('TreeSet', [], ctx)!;
    for (const n of [3, 1, 2]) callInstanceMethod(tree, 'add', [javaInt(n)], ctx);
    expect(getIterableElements(tree, ctx)!.map(num)).toEqual([1, 2, 3]);
  });

  it('HashMap put/get/keySet/getOrDefault; TreeMap sorts keys', () => {
    const ctx = makeCtx();
    const m = newBuiltin('HashMap', [], ctx)!;
    callInstanceMethod(m, 'put', [javaString('a'), javaInt(1)], ctx);
    callInstanceMethod(m, 'put', [javaString('b'), javaInt(2)], ctx);
    expect(num(callInstanceMethod(m, 'get', [javaString('a')], ctx))).toBe(1);
    expect(num(callInstanceMethod(m, 'getOrDefault', [javaString('z'), javaInt(-1)], ctx))).toBe(-1);
    expect(javaValueToString(m, ctx.heap)).toBe('{a=1, b=2}');
    const keys = callInstanceMethod(m, 'keySet', [], ctx)!;
    expect(getIterableElements(keys, ctx)!.map((k) => javaValueToString(k, ctx.heap))).toEqual(['a', 'b']);

    const t = newBuiltin('TreeMap', [], ctx)!;
    callInstanceMethod(t, 'put', [javaString('b'), javaInt(2)], ctx);
    callInstanceMethod(t, 'put', [javaString('a'), javaInt(1)], ctx);
    expect(javaValueToString(t, ctx.heap)).toBe('{a=1, b=2}');
  });

  it('Stack push/pop/peek (LIFO); ArrayDeque offer/poll (FIFO)', () => {
    const ctx = makeCtx();
    const st = newBuiltin('Stack', [], ctx)!;
    callInstanceMethod(st, 'push', [javaInt(1)], ctx);
    callInstanceMethod(st, 'push', [javaInt(2)], ctx);
    expect(num(callInstanceMethod(st, 'pop', [], ctx))).toBe(2);
    expect(num(callInstanceMethod(st, 'peek', [], ctx))).toBe(1);

    const q = newBuiltin('ArrayDeque', [], ctx)!;
    callInstanceMethod(q, 'offer', [javaInt(1)], ctx);
    callInstanceMethod(q, 'offer', [javaInt(2)], ctx);
    expect(num(callInstanceMethod(q, 'poll', [], ctx))).toBe(1);
    expect(num(callInstanceMethod(q, 'peek', [], ctx))).toBe(2);
  });
});

describe('Scanner', () => {
  it('reads tokens and lines like java.util.Scanner', () => {
    const ctx = makeCtx('3\n10 20 30\nhello world');
    const sc = newBuiltin('Scanner', [javaNull()], ctx)!; // Scanner(System.in)
    expect(num(callInstanceMethod(sc, 'nextInt', [], ctx))).toBe(3);
    expect(num(callInstanceMethod(sc, 'nextInt', [], ctx))).toBe(10);
    expect(num(callInstanceMethod(sc, 'nextInt', [], ctx))).toBe(20);
    expect(num(callInstanceMethod(sc, 'nextInt', [], ctx))).toBe(30);
    // nextLine after nextInt returns the rest of the current line (empty here)…
    expect(javaValueToString(callInstanceMethod(sc, 'nextLine', [], ctx)!, ctx.heap)).toBe('');
    // …then the following line.
    expect(javaValueToString(callInstanceMethod(sc, 'nextLine', [], ctx)!, ctx.heap)).toBe('hello world');
    expect(bool(callInstanceMethod(sc, 'hasNext', [], ctx))).toBe(false);
  });

  it('new Scanner(String) reads from the string; hasNextInt works', () => {
    const ctx = makeCtx();
    const sc = newBuiltin('Scanner', [javaString('42 foo')], ctx)!;
    expect(bool(callInstanceMethod(sc, 'hasNextInt', [], ctx))).toBe(true);
    expect(num(callInstanceMethod(sc, 'nextInt', [], ctx))).toBe(42);
    expect(bool(callInstanceMethod(sc, 'hasNextInt', [], ctx))).toBe(false);
    expect(javaValueToString(callInstanceMethod(sc, 'next', [], ctx)!, ctx.heap)).toBe('foo');
  });

  it("matches tokens by Scanner's own patterns, leaving one that doesn't match unread (#65, JDK 21's results)", () => {
    const ctx = makeCtx();
    const scan = (text: string) => newBuiltin('Scanner', [javaString(text)], ctx)!;
    const has = (text: string, method: string) => bool(callInstanceMethod(scan(text), method, [], ctx));
    // hasNextInt, hasNextLong, hasNextDouble, hasNextBoolean for each token.
    const table: [string, boolean, boolean, boolean, boolean][] = [
      ['3.5', false, false, true, false], ['abc', false, false, false, false], ['4x', false, false, false, false],
      ['1,5', false, false, false, false], ['1,234', true, true, true, false], ['1,234.5', false, false, true, false],
      ['12,34', false, false, false, false], ['2.5f', false, false, false, false], ['0x1.8p1', false, false, true, false],
      ['NaN', false, false, true, false], ['-Infinity', false, false, true, false], ['.5', false, false, true, false],
      ['5.', false, false, true, false], ['+3', true, true, true, false], ['99999999999', false, true, true, false],
      ['TRUE', false, false, false, true], ['yes', false, false, false, false],
    ];
    for (const [token, int, long, double, boolean] of table) {
      expect([token, has(token, 'hasNextInt'), has(token, 'hasNextLong'), has(token, 'hasNextDouble'), has(token, 'hasNextBoolean')]).toEqual([token, int, long, double, boolean]);
    }
    expect(num(callInstanceMethod(scan('1,234.5'), 'nextDouble', [], ctx))).toBe(1234.5);
    expect(num(callInstanceMethod(scan('1,234'), 'nextInt', [], ctx))).toBe(1234);
    const sc = scan('abc 2');
    expect(() => callInstanceMethod(sc, 'nextDouble', [], ctx)).toThrow(/^InputMismatchException$/);
    expect(() => callInstanceMethod(sc, 'nextBoolean', [], ctx)).toThrow(/^InputMismatchException$/);
    expect(javaValueToString(callInstanceMethod(sc, 'next', [], ctx)!, ctx.heap)).toBe('abc');
    expect(() => callInstanceMethod(scan('99999999999'), 'nextInt', [], ctx)).toThrow('InputMismatchException: For input string: "99999999999"');
    expect(() => callInstanceMethod(scan(''), 'nextBoolean', [], ctx)).toThrow(/^NoSuchElementException$/);
    expect(() => callInstanceMethod(scan(''), 'nextLine', [], ctx)).toThrow('NoSuchElementException: No line found');
  });

  it('shares System.in between its Scanners, as typed input is (#65), and refuses a closed one', () => {
    const ctx = makeCtx('5\n7\n');
    // A helper that makes a new Scanner(System.in) for each number reads the next one.
    const read = () => num(callInstanceMethod(newBuiltin('Scanner', [javaNull()], ctx)!, 'nextInt', [], ctx));
    expect(read() + read()).toBe(12);
    const sc = newBuiltin('Scanner', [javaNull()], ctx)!;
    callInstanceMethod(sc, 'close', [], ctx);
    expect(() => callInstanceMethod(sc, 'hasNext', [], ctx)).toThrow('IllegalStateException: Scanner closed');
    // Closing it closed System.in: a new Scanner on it has nothing to read.
    const again = newBuiltin('Scanner', [javaNull()], ctx)!;
    expect(bool(callInstanceMethod(again, 'hasNextLine', [], ctx))).toBe(false);
    expect(() => callInstanceMethod(again, 'next', [], ctx)).toThrow(/^NoSuchElementException$/);
    // A Scanner over a String is its own.
    expect(num(callInstanceMethod(newBuiltin('Scanner', [javaString('9')], ctx)!, 'nextInt', [], ctx))).toBe(9);
  });
});

describe('Random', () => {
  it('is deterministic for a given seed and respects bounds', () => {
    const ctx = makeCtx();
    const r1 = newBuiltin('Random', [javaInt(42)], ctx)!; // distinct heapIds ->
    const r2 = newBuiltin('Random', [javaInt(42)], ctx)!; // independent state
    const a = num(callInstanceMethod(r1, 'nextInt', [javaInt(100)], ctx));
    const b = num(callInstanceMethod(r2, 'nextInt', [javaInt(100)], ctx));
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
    const d = num(callInstanceMethod(r1, 'nextDouble', [], ctx));
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(1);
  });

  it("keeps its state in its seed field, and matches java.util.Random's sequence (checked with JDK 21)", () => {
    const ctx = makeCtx();
    const r = newBuiltin('Random', [javaInt(42)], ctx)!;
    const seed = () => (ctx.heap.get((r as { heapId: string }).heapId) as { fields: Map<string, JavaValue> }).fields.get('seed');
    expect(seed()).toEqual({ kind: 'primitive', javaType: 'long', value: 42n ^ 0x5DEECE66Dn });
    const draws = Array.from({ length: 5 }, () => num(callInstanceMethod(r, 'nextInt', [javaInt(10)], ctx)));
    expect(draws).toEqual([0, 3, 8, 4, 0]);
    callInstanceMethod(r, 'setSeed', [javaInt(42)], ctx);
    expect(seed()).toEqual({ kind: 'primitive', javaType: 'long', value: 42n ^ 0x5DEECE66Dn });
    expect(num(callInstanceMethod(r, 'nextInt', [javaInt(10)], ctx))).toBe(0);
  });
});

describe('Iterator', () => {
  it('refers to its collection and walks it with a cursor', () => {
    const ctx = makeCtx();
    const list = newBuiltin('ArrayList', [], ctx)!;
    callInstanceMethod(list, 'add', [javaInt(3)], ctx);
    callInstanceMethod(list, 'add', [javaInt(1)], ctx);
    const it = callInstanceMethod(list, 'iterator', [], ctx)!;
    const fields = (ctx.heap.get((it as { heapId: string }).heapId) as { fields: Map<string, JavaValue> }).fields;
    expect(fields.get('collection')).toEqual(list);
    expect(fields.get('cursor')).toEqual(javaInt(0));
    expect(num(callInstanceMethod(it, 'next', [], ctx))).toBe(3);
    expect(fields.get('cursor')).toEqual(javaInt(1));
    expect(bool(callInstanceMethod(it, 'hasNext', [], ctx))).toBe(true);
    expect(num(callInstanceMethod(it, 'next', [], ctx))).toBe(1);
    expect(bool(callInstanceMethod(it, 'hasNext', [], ctx))).toBe(false);
    expect(() => callInstanceMethod(it, 'next', [], ctx)).toThrow('NoSuchElementException');
  });

  it('walks a set in its iteration order', () => {
    const ctx = makeCtx();
    const set = newBuiltin('TreeSet', [], ctx)!;
    for (const n of [5, 2, 9]) callInstanceMethod(set, 'add', [javaInt(n)], ctx);
    const it = callInstanceMethod(set, 'iterator', [], ctx)!;
    const seen: number[] = [];
    while (bool(callInstanceMethod(it, 'hasNext', [], ctx))) seen.push(num(callInstanceMethod(it, 'next', [], ctx)));
    expect(seen).toEqual([2, 5, 9]);
  });
});

// ── Comparators (#6: a comparator argument is used, never silently ignored) ──

/** A context whose "user" objects of class ByLength compare strings by length, like a student Comparator class. */
function comparatorCtx(): StdlibContext {
  const ctx = makeCtx();
  ctx.invokeUserMethod = (ref, name, args) => {
    if (ref.kind !== 'objectRef' || ref.className !== 'ByLength' || name !== 'compare') return undefined;
    const [a, b] = args.map(v => javaValueToString(v, ctx.heap));
    return javaInt(a.length - b.length);
  };
  return ctx;
}
/** An object of a user class (not a library object), put straight on the heap. */
function userObject(ctx: StdlibContext, className: string): JavaValue {
  const heapId = 'user' + ctx.heap.size;
  ctx.heap.set(heapId, { className, fields: new Map() });
  return { kind: 'objectRef', heapId, className };
}
const byLength = (ctx: StdlibContext): JavaValue => userObject(ctx, 'ByLength');
/** A list's or an array's contents, as Java prints a list (an array itself prints its identity). */
const strings = (ctx: StdlibContext, v: JavaValue | undefined) =>
  javaValueToString(v!.kind === 'arrayRef' ? callStaticMethod('Arrays', 'toString', [v!], ctx)! : v!, ctx.heap);
const list = (ctx: StdlibContext, words: string[]) =>
  newBuiltin('ArrayList', [callStaticMethod('Arrays', 'asList', [arrRef(ctx, words.map(javaString), 'String')], ctx)!], ctx)!;

describe('comparators', () => {
  it('Collections.sort, List.sort and Arrays.sort use a user comparator', () => {
    const ctx = comparatorCtx();
    const words = list(ctx, ['pear', 'fig', 'banana']);
    callStaticMethod('Collections', 'sort', [words, byLength(ctx)], ctx);
    expect(strings(ctx, words)).toBe('[fig, pear, banana]');
    callInstanceMethod(words, 'sort', [callStaticMethod('Collections', 'reverseOrder', [], ctx)!], ctx);
    expect(strings(ctx, words)).toBe('[pear, fig, banana]');
    callInstanceMethod(words, 'sort', [javaNull()], ctx);
    expect(strings(ctx, words)).toBe('[banana, fig, pear]');
    const arr = arrRef(ctx, ['bb', 'a', 'ccc'].map(javaString));
    callStaticMethod('Arrays', 'sort', [arr, byLength(ctx)], ctx);
    expect(strings(ctx, arr)).toBe('[a, bb, ccc]');
  });

  it('library comparators: naturalOrder, reverseOrder, reversed(), CASE_INSENSITIVE_ORDER', () => {
    const ctx = comparatorCtx();
    const natural = callStaticMethod('Comparator', 'naturalOrder', [], ctx)!;
    expect(num(callInstanceMethod(natural, 'compare', [javaInt(1), javaInt(2)], ctx))).toBe(-1);
    const reversed = callInstanceMethod(natural, 'reversed', [], ctx)!;
    expect(num(callInstanceMethod(reversed, 'compare', [javaInt(1), javaInt(2)], ctx))).toBe(1);
    const reverseOfUser = callStaticMethod('Collections', 'reverseOrder', [byLength(ctx)], ctx)!;
    expect(num(callInstanceMethod(reverseOfUser, 'compare', [javaString('aaa'), javaString('b')], ctx))).toBeLessThan(0);
    const ci = getStaticField('String', 'CASE_INSENSITIVE_ORDER', ctx)!;
    expect(num(callInstanceMethod(ci, 'compare', [javaString('B'), javaString('a')], ctx))).toBe(1);
  });

  it('a PriorityQueue, TreeSet or TreeMap keeps the comparator it was created with', () => {
    const ctx = comparatorCtx();
    const pq = newBuiltin('PriorityQueue', [callStaticMethod('Collections', 'reverseOrder', [], ctx)!], ctx)!;
    for (const n of [4, 9, 1]) callInstanceMethod(pq, 'offer', [javaInt(n)], ctx);
    expect(num(callInstanceMethod(pq, 'poll', [], ctx))).toBe(9);

    const set = newBuiltin('TreeSet', [byLength(ctx)], ctx)!;
    expect(bool(callInstanceMethod(set, 'add', [javaString('aa')], ctx))).toBe(true);
    expect(bool(callInstanceMethod(set, 'add', [javaString('b')], ctx))).toBe(true);
    // The comparator calls "cc" equal to "aa", so the set already holds it.
    expect(bool(callInstanceMethod(set, 'add', [javaString('cc')], ctx))).toBe(false);
    expect(bool(callInstanceMethod(set, 'contains', [javaString('zz')], ctx))).toBe(true);
    expect(strings(ctx, set)).toBe('[b, aa]');

    const map = newBuiltin('TreeMap', [getStaticField('String', 'CASE_INSENSITIVE_ORDER', ctx)!], ctx)!;
    callInstanceMethod(map, 'put', [javaString('b'), javaInt(1)], ctx);
    callInstanceMethod(map, 'put', [javaString('A'), javaInt(2)], ctx);
    callInstanceMethod(map, 'put', [javaString('B'), javaInt(3)], ctx);
    expect(strings(ctx, map)).toBe('{A=2, b=3}');
  });

  it('Collections.max/min take a comparator, and throw on an empty collection', () => {
    const ctx = comparatorCtx();
    const words = list(ctx, ['kiwi', 'fig', 'banana']);
    expect(strings(ctx, callStaticMethod('Collections', 'max', [words, byLength(ctx)], ctx))).toBe('banana');
    expect(strings(ctx, callStaticMethod('Collections', 'min', [words, byLength(ctx)], ctx))).toBe('fig');
    expect(() => callStaticMethod('Collections', 'max', [list(ctx, [])], ctx)).toThrow('NoSuchElementException');
  });

  it("refuses to order objects that have neither compareTo nor a comparator, as Java's ClassCastException does", () => {
    const ctx = comparatorCtx();
    const point = userObject(ctx, 'Point');
    const arr = arrRef(ctx, [point, point]);
    expect(() => callStaticMethod('Arrays', 'sort', [arr], ctx)).toThrow('ClassCastException');
    const notComparator = userObject(ctx, 'Point');
    expect(() => callStaticMethod('Collections', 'sort', [list(ctx, ['a', 'b']), notComparator], ctx)).toThrow("Point can't be used as a Comparator");
  });
});

describe('collection copy constructors', () => {
  it('new HashMap / LinkedHashMap / TreeMap copy the entries of the map they are given', () => {
    const ctx = makeCtx();
    const source = newBuiltin('LinkedHashMap', [], ctx)!;
    callInstanceMethod(source, 'put', [javaString('b'), javaInt(1)], ctx);
    callInstanceMethod(source, 'put', [javaString('a'), javaInt(2)], ctx);
    expect(javaValueToString(newBuiltin('HashMap', [source], ctx)!, ctx.heap)).toBe('{a=2, b=1}'); // Java's hash order
    expect(javaValueToString(newBuiltin('LinkedHashMap', [source], ctx)!, ctx.heap)).toBe('{b=1, a=2}');
    expect(javaValueToString(newBuiltin('TreeMap', [source], ctx)!, ctx.heap)).toBe('{a=2, b=1}');
    expect(javaValueToString(newBuiltin('HashMap', [javaInt(16)], ctx)!, ctx.heap)).toBe('{}');
  });
});

describe('library type hierarchy (instanceof, casts, catch)', () => {
  it('knows the collection interfaces each class implements', () => {
    expect(isLibrarySubtype('ArrayList', 'List')).toBe(true);
    expect(isLibrarySubtype('ArrayList', 'Collection')).toBe(true);
    expect(isLibrarySubtype('ArrayList', 'Iterable')).toBe(true);
    expect(isLibrarySubtype('ArrayList', 'Set')).toBe(false);
    expect(isLibrarySubtype('LinkedList', 'Deque')).toBe(true);
    expect(isLibrarySubtype('Stack', 'List')).toBe(true);
    expect(isLibrarySubtype('TreeMap', 'SortedMap')).toBe(true);
    expect(isLibrarySubtype('HashMap', 'SortedMap')).toBe(false);
    expect(isLibrarySubtype('LinkedHashSet', 'HashSet')).toBe(true);
    expect(isLibrarySubtype('Scanner', 'AutoCloseable')).toBe(true);
  });

  it('knows the exception hierarchy', () => {
    expect(isLibrarySubtype('NumberFormatException', 'IllegalArgumentException')).toBe(true);
    expect(isLibrarySubtype('ArrayIndexOutOfBoundsException', 'RuntimeException')).toBe(true);
    expect(isLibrarySubtype('IOException', 'RuntimeException')).toBe(false);
    expect(isLibrarySubtype('ExceptionInInitializerError', 'Error')).toBe(true);
    expect(isLibrarySubtype('ArithmeticException', 'Throwable')).toBe(true);
    expect(isLibrarySubtype('ArithmeticException', 'Object')).toBe(true);
  });

  it('treats strings and boxed primitives as their classes', () => {
    expect(isStringType('CharSequence')).toBe(true);
    expect(isStringType('Comparable')).toBe(true);
    expect(isStringType('Integer')).toBe(false);
    expect(isBoxedInstanceOf('int', 'Integer')).toBe(true);
    expect(isBoxedInstanceOf('int', 'Number')).toBe(true);
    expect(isBoxedInstanceOf('int', 'Double')).toBe(false);
    expect(isBoxedInstanceOf('char', 'Character')).toBe(true);
    expect(isBoxedInstanceOf('boolean', 'Number')).toBe(false);
    expect(isBoxedInstanceOf('double', 'Object')).toBe(true);
  });

  it('knows which library types a cast can be checked against', () => {
    for (const known of ['String', 'Integer', 'List', 'HashMap', 'ArithmeticException', 'Comparable', 'Object']) {
      expect(isKnownLibraryType(known)).toBe(true);
    }
    expect(isKnownLibraryType('T')).toBe(false);
    expect(isKnownLibraryType('JFrame')).toBe(false);
  });

  it('prints library exceptions with their package', () => {
    expect(qualifiedExceptionName('ArithmeticException')).toBe('java.lang.ArithmeticException');
    expect(qualifiedExceptionName('NoSuchElementException')).toBe('java.util.NoSuchElementException');
    expect(qualifiedExceptionName('IOException')).toBe('java.io.IOException');
    expect(qualifiedExceptionName('MyException')).toBe('MyException');
  });
});
