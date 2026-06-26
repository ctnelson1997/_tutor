/**
 * Behavior-comparison tests for the Python tracer.
 *
 * Each test runs a Python snippet two ways:
 *   1. As plain Python via `python` subprocess (the ground truth).
 *   2. Through the tracer script (also via subprocess) which emits JSON
 *      snapshots; we compare the last snapshot's stdout.
 *
 * Requires a `python` (3.10+) interpreter on PATH. If Python is missing,
 * the whole suite is skipped (so CI without Python passes cleanly).
 *
 * Add a case here whenever you find a tracer bug from real-world Python
 * code — this is the suite that catches semantic regressions across the
 * tracer + serializer.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTracerCode } from '../tracer';

let PYTHON: string | null = null;
let TMP: string;

const PYTHON_AVAILABLE =
  spawnSync('python', ['--version']).status === 0 ||
  spawnSync('python3', ['--version']).status === 0;

beforeAll(() => {
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf-8' });
    if (r.status === 0) { PYTHON = cmd; break; }
  }
  TMP = mkdtempSync(join(tmpdir(), 'pytutor-'));
});

const TRACER = getTracerCode();

function runPlain(src: string): { ok: boolean; out?: string; err?: string } {
  if (!PYTHON) return { ok: false, err: 'no python' };
  const file = join(TMP, 'user.py');
  writeFileSync(file, src);
  const r = spawnSync(PYTHON, [file], { encoding: 'utf-8', timeout: 5000 });
  try { unlinkSync(file); } catch { /* ignore */ }
  if (r.status !== 0) return { ok: false, err: r.stderr };
  return { ok: true, out: r.stdout.replace(/\r\n/g, '\n').replace(/\n$/, '') };
}

interface Snapshot { stdout: string[]; heap: Array<{ id: string; objectType: string; label?: string; properties: Array<{ key: string; value: unknown }> }>; callStack: Array<{ name: string; variables: Array<{ name: string; value: unknown }> }>; }

function runTraced(src: string): { ok: boolean; out?: string; err?: string; snapshots?: Snapshot[] } {
  if (!PYTHON) return { ok: false, err: 'no python' };
  const harness = `${TRACER}\n_result = run_traced(${JSON.stringify(src)})\nprint(_result)\n`;
  const file = join(TMP, 'harness.py');
  writeFileSync(file, harness);
  const r = spawnSync(PYTHON, [file], { encoding: 'utf-8', timeout: 10000 });
  try { unlinkSync(file); } catch { /* ignore */ }
  if (r.status !== 0) return { ok: false, err: r.stderr };
  try {
    const lines = r.stdout.trim().split('\n');
    const parsed = JSON.parse(lines[lines.length - 1]);
    if (parsed.type === 'error') return { ok: false, err: parsed.message };
    const snaps = (parsed.snapshots || []) as Snapshot[];
    const last = snaps[snaps.length - 1];
    return { ok: true, out: (last?.stdout || []).join('\n'), snapshots: snaps };
  } catch (e) {
    return { ok: false, err: 'parse: ' + (e as Error).message };
  }
}

function expectSameOutput(src: string) {
  const plain = runPlain(src);
  const traced = runTraced(src);
  if (!plain.ok && !traced.ok) return;
  expect(plain.ok, 'plain failed: ' + plain.err).toBe(true);
  expect(traced.ok, 'traced failed: ' + traced.err).toBe(true);
  expect(traced.out).toBe(plain.out);
}

function expectHeapMatches(src: string, predicate: (snap: Snapshot) => boolean) {
  const traced = runTraced(src);
  expect(traced.ok, 'traced failed: ' + traced.err).toBe(true);
  const last = traced.snapshots![traced.snapshots!.length - 1];
  expect(predicate(last)).toBe(true);
}

describe.skipIf(!PYTHON_AVAILABLE)('Python tracer behavior comparison', () => {
  // ── Basic ──
  it('hello world', () => expectSameOutput(`print("Hello, World!")`));
  it('arithmetic', () => expectSameOutput(`print(3 + 4 * 2)`));
  it('integer vs float division', () => expectSameOutput(`print(7 // 2); print(7 / 2)`));

  // ── Control flow ──
  it('for-range sum', () => expectSameOutput(`s=0\nfor i in range(1,11): s+=i\nprint(s)`));
  it('while doubling', () => expectSameOutput(`n=1\nwhile n<100: n*=2\nprint(n)`));
  it('break in for', () => expectSameOutput(`for i in range(100):\n    if i==5: break\nprint(i)`));
  it('continue in for', () => expectSameOutput(`s=0\nfor i in range(10):\n    if i%2==0: continue\n    s+=i\nprint(s)`));
  it('if/elif/else cascading', () => expectSameOutput(`
n = 75
if n >= 90: g = "A"
elif n >= 80: g = "B"
elif n >= 70: g = "C"
else: g = "F"
print(g)
`));

  // ── Functions ──
  it('factorial recursive', () => expectSameOutput(`
def fact(n): return 1 if n <= 1 else n * fact(n-1)
print(fact(6))
`));

  it('fibonacci recursive', () => expectSameOutput(`
def fib(n): return n if n < 2 else fib(n-1) + fib(n-2)
print(fib(10))
`));

  it('mutual recursion', () => expectSameOutput(`
def is_even(n): return True if n == 0 else is_odd(n-1)
def is_odd(n): return False if n == 0 else is_even(n-1)
print(is_even(8))
`));

  it('default args + keyword args', () => expectSameOutput(`
def f(a, b=10, c=20): return f"{a}/{b}/{c}"
print(f(1))
print(f(1, b=99))
`));

  it('*args **kwargs', () => expectSameOutput(`
def f(*args, **kw): return sum(args) + len(kw)
print(f(1, 2, 3, x=1, y=2))
`));

  // ── Collections & comprehensions ──
  it('list ops', () => expectSameOutput(`
a = [1, 2, 3]; a.append(4); a.append(5)
print(a)
print(sum(a))
`));

  it('dict ops', () => expectSameOutput(`
d = {"a": 1, "b": 2}; d["c"] = 3
print(sorted(d.items()))
`));

  it('list comprehension', () => expectSameOutput(`print([x*x for x in range(5)])`));
  it('dict comprehension', () => expectSameOutput(`print({x: x*x for x in range(4)})`));
  it('nested comprehension', () => expectSameOutput(`print([[i*j for j in range(3)] for i in range(3)])`));
  it('generator expression sum', () => expectSameOutput(`print(sum(x*x for x in range(5)))`));
  it('walrus in comprehension', () => expectSameOutput(`print([y for x in range(5) if (y := x*2) > 4])`));

  // ── Classes & OOP ──
  it('basic class with __init__', () => expectSameOutput(`
class Box:
    def __init__(self, v): self.v = v
    def get(self): return self.v
print(Box(42).get())
`));

  it('inheritance + super', () => expectSameOutput(`
class A:
    def __init__(self, n): self.n = n
    def speak(self): return f"{self.n} sound"
class Dog(A):
    def speak(self): return super().speak() + " woof"
print(Dog("Rex").speak())
`));

  it('class with __repr__', () => expectSameOutput(`
class P:
    def __init__(self, x, y): self.x = x; self.y = y
    def __repr__(self): return f"P({self.x},{self.y})"
print(P(3, 4))
`));

  it('class with @property', () => expectSameOutput(`
class C:
    def __init__(self): self._x = 5
    @property
    def x(self): return self._x * 2
print(C().x)
`));

  it('@staticmethod and @classmethod', () => expectSameOutput(`
class M:
    name = "M"
    @staticmethod
    def double(x): return x * 2
    @classmethod
    def who(cls): return cls.name
print(M.double(5), M.who())
`));

  it('dataclass decorator', () => expectSameOutput(`
from dataclasses import dataclass
@dataclass
class P:
    x: int
    y: int
print(P(3, 4))
`));

  it('namedtuple', () => expectSameOutput(`
from collections import namedtuple
Pt = namedtuple('Pt', ['x', 'y'])
p = Pt(3, 4)
print(p, p.x + p.y)
`));

  it('__add__ and __eq__ overload', () => expectSameOutput(`
class V:
    def __init__(self, x): self.x = x
    def __add__(self, o): return V(self.x + o.x)
    def __eq__(self, o): return isinstance(o, V) and self.x == o.x
    def __repr__(self): return f"V({self.x})"
print(V(1) + V(2))
print(V(3) == V(3))
`));

  it('diamond inheritance (MRO)', () => expectSameOutput(`
class A:
    def h(self): return "A"
class B(A):
    def h(self): return "B-" + super().h()
class C(A):
    def h(self): return "C-" + super().h()
class D(B, C):
    def h(self): return "D-" + super().h()
print(D().h())
`));

  // ── Closures, scoping ──
  it('classic closure-in-loop trap (late binding)', () => expectSameOutput(`
fns = [lambda: i for i in range(3)]
print([f() for f in fns])
`));

  it('default-arg closure fix', () => expectSameOutput(`
fns = [lambda i=i: i for i in range(3)]
print([f() for f in fns])
`));

  it('nonlocal updates outer var', () => expectSameOutput(`
def make():
    x = 0
    def inc():
        nonlocal x
        x += 1
        return x
    return inc
c = make()
print(c(), c(), c())
`));

  it('global keyword', () => expectSameOutput(`
n = 0
def step():
    global n
    n += 1
step(); step(); step()
print(n)
`));

  // ── Exceptions ──
  it('try/except basic', () => expectSameOutput(`
try: 1 / 0
except ZeroDivisionError as e: print("caught:", str(e))
`));

  it('try/except/else/finally ordering', () => expectSameOutput(`
def f(x):
    try: v = 10 / x
    except ZeroDivisionError: print("err")
    else: print("ok", v)
    finally: print("fin")
f(2); f(0)
`));

  it('raise from + chained', () => expectSameOutput(`
def inner(): raise ValueError("inner")
def outer():
    try: inner()
    except ValueError as e: raise RuntimeError("wrapped: " + str(e)) from e
try: outer()
except RuntimeError as e:
    print(type(e).__name__, str(e))
    print(type(e.__cause__).__name__)
`));

  it('exception in generator propagates', () => expectSameOutput(`
def g():
    yield 1
    raise ValueError("bad")
it = g()
print(next(it))
try: next(it)
except ValueError as e: print("caught:", e)
`));

  // ── Iterators / generators ──
  it('basic generator yield', () => expectSameOutput(`
def g():
    yield 1; yield 2; yield 3
print(list(g()))
`));

  it('generator with internal state', () => expectSameOutput(`
def gen():
    n = 0
    while n < 3:
        yield n
        n += 1
print(list(gen()))
`));

  it('custom iterator class', () => expectSameOutput(`
class R:
    def __init__(self, n): self.i = 0; self.n = n
    def __iter__(self): return self
    def __next__(self):
        if self.i >= self.n: raise StopIteration
        v = self.i; self.i += 1
        return v
print(list(R(4)))
`));

  // ── Context managers ──
  it('custom context manager', () => expectSameOutput(`
class T:
    def __enter__(self):
        print("enter"); return self
    def __exit__(self, *a): print("exit")
with T(): print("inside")
`));

  it('contextlib contextmanager', () => expectSameOutput(`
from contextlib import contextmanager
@contextmanager
def b():
    print("s"); yield 42; print("t")
with b() as v: print(v)
`));

  // ── Numerics ──
  it('arbitrary precision int', () => expectSameOutput(`print(2 ** 100)`));
  it('float special values', () => expectSameOutput(`
import math
print(math.isnan(float('nan')))
print(float('inf'))
`));

  it('divmod', () => expectSameOutput(`print(divmod(17, 5))`));

  // ── Strings ──
  it('string methods', () => expectSameOutput(`
s = "Hello, World"
print(s.lower())
print(s.split(", "))
`));
  it('f-string with expressions', () => expectSameOutput(`x = 5; y = 10; print(f"sum={x + y}")`));
  it('string slicing + reversal', () => expectSameOutput(`print("abcdef"[2:5]); print("abc"[::-1])`));

  // ── Real-world algorithms ──
  it('FizzBuzz 1-15', () => expectSameOutput(`
out = []
for i in range(1, 16):
    if i % 15 == 0: out.append("FizzBuzz")
    elif i % 3 == 0: out.append("Fizz")
    elif i % 5 == 0: out.append("Buzz")
    else: out.append(str(i))
print(",".join(out))
`));

  it('binary search', () => expectSameOutput(`
a = [1, 3, 5, 7, 9, 11, 13]
lo, hi, t = 0, len(a) - 1, 9
idx = -1
while lo <= hi:
    mid = (lo + hi) // 2
    if a[mid] == t: idx = mid; break
    if a[mid] < t: lo = mid + 1
    else: hi = mid - 1
print(idx)
`));

  it('quicksort', () => expectSameOutput(`
def qs(a):
    if len(a) <= 1: return a
    p = a[0]
    return qs([x for x in a[1:] if x <= p]) + [p] + qs([x for x in a[1:] if x > p])
print(qs([5, 2, 8, 1, 9, 3]))
`));

  it('Tower of Hanoi', () => expectSameOutput(`
moves = 0
def h(n, a, b, c):
    global moves
    if n == 0: return
    h(n - 1, a, c, b); moves += 1; h(n - 1, c, b, a)
h(3, "A", "C", "B")
print(moves)
`));

  it('N-queens count 4x4', () => expectSameOutput(`
def queens(n):
    count = 0
    def place(row, cols, d1, d2):
        nonlocal count
        if row == n: count += 1; return
        for col in range(n):
            a, b = row - col + n, row + col
            if col in cols or a in d1 or b in d2: continue
            place(row + 1, cols | {col}, d1 | {a}, d2 | {b})
    place(0, set(), set(), set())
    return count
print(queens(4))
`));

  it('memoized fibonacci via closure', () => expectSameOutput(`
def make():
    cache = {0: 0, 1: 1}
    def fib(n):
        if n not in cache: cache[n] = fib(n-1) + fib(n-2)
        return cache[n]
    return fib
fib = make()
print(fib(20))
`));

  // ── Pattern matching (3.10+) ──
  it('match statement', () => expectSameOutput(`
def classify(p):
    match p:
        case (0, 0): return "origin"
        case (x, 0): return f"on x at {x}"
        case (0, y): return f"on y at {y}"
        case _: return "other"
print(classify((0, 0))); print(classify((5, 0))); print(classify((3, 7)))
`));

  // ── Snapshot fidelity ──
  it('snapshot shows class instance fields', () => expectHeapMatches(`
class C:
    def __init__(self): self.x = 5; self.y = 10
c = C()
`, snap => snap.heap.some(h =>
    h.label === 'C' &&
    h.properties.some(p => p.key === 'x') &&
    h.properties.some(p => p.key === 'y')
  )));

  it('snapshot shows __slots__ fields (REGRESSION)', () => expectHeapMatches(`
class C:
    __slots__ = ['x', 'y']
    def __init__(self):
        self.x = 5
        self.y = 10
c = C()
`, snap => snap.heap.some(h =>
    h.label === 'C' &&
    h.properties.some(p => p.key === 'x') &&
    h.properties.some(p => p.key === 'y')
  )));

  it('snapshot shows list contents', () => expectHeapMatches(`a = [10, 20, 30]`,
    snap => !!snap.heap.find(h => h.objectType === 'list' && h.properties.length === 3)));

  it('snapshot shows dict contents', () => expectHeapMatches(`d = {"x": 1, "y": 2}`,
    snap => !!snap.heap.find(h => h.objectType === 'dict' && h.properties.length === 2)));
});
