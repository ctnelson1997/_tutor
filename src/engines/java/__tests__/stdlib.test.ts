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

  it("keeps its state in its seed field, and matches java.util.Random's sequence (checked with JDK 21)", () => {
    const ctx = makeCtx();
    const r = newBuiltin('Random', [javaInt(42)], ctx)!;
    const seed = () => (ctx.heap.get((r as { heapId: string }).heapId) as { fields: Map<string, JavaValue> }).fields.get('seed');
    expect(seed()).toEqual({ kind: 'primitive', javaType: 'long', value: Number(42n ^ 0x5DEECE66Dn) });
    const draws = Array.from({ length: 5 }, () => num(callInstanceMethod(r, 'nextInt', [javaInt(10)], ctx)));
    expect(draws).toEqual([0, 3, 8, 4, 0]);
    callInstanceMethod(r, 'setSeed', [javaInt(42)], ctx);
    expect(seed()).toEqual({ kind: 'primitive', javaType: 'long', value: Number(42n ^ 0x5DEECE66Dn) });
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
const strings = (ctx: StdlibContext, v: JavaValue | undefined) => javaValueToString(v!, ctx.heap);
const list = (ctx: StdlibContext, words: string[]) => newBuiltin('ArrayList', [arrRef(ctx, words.map(javaString))], ctx)!;

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
    expect(javaValueToString(newBuiltin('HashMap', [source], ctx)!, ctx.heap)).toBe('{b=1, a=2}');
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
