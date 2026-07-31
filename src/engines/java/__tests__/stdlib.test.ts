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
    allocObject: (className, fields) => {
      const id = String(next++);
      heap.set(id, { className, fields });
      return id;
    },
    random: () => 0.5,
    stdin,
  };
}

const arrRef = (ctx: StdlibContext, els: JavaValue[]): JavaValue => ({
  kind: 'arrayRef',
  heapId: ctx.allocArray('Object', els),
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
    const a = arrRef(ctx, [javaInt(3), javaInt(1), javaInt(2)]);
    expect(javaValueToString(callStaticMethod('Arrays', 'toString', [a], ctx)!, ctx.heap)).toBe('[3, 1, 2]');
    callStaticMethod('Arrays', 'sort', [a], ctx);
    expect(javaValueToString(a, ctx.heap)).toBe('[1, 2, 3]');
    const copy = callStaticMethod('Arrays', 'copyOf', [a, javaInt(5)], ctx)!;
    expect(javaValueToString(copy, ctx.heap)).toBe('[1, 2, 3, 0, 0]');
  });
  it('Objects.equals / hash / requireNonNull', () => {
    const ctx = makeCtx();
    expect(bool(callStaticMethod('Objects', 'equals', [javaInt(1), javaInt(1)], ctx))).toBe(true);
    expect(bool(callStaticMethod('Objects', 'equals', [javaString('a'), javaString('b')], ctx))).toBe(false);
    expect(bool(callStaticMethod('Objects', 'isNull', [javaNull()], ctx))).toBe(true);
    expect(() => callStaticMethod('Objects', 'requireNonNull', [javaNull()], ctx)).toThrow();
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
});
