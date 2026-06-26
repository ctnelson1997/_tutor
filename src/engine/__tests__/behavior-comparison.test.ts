/**
 * Behavior-comparison smoke tests
 *
 * Each case runs a snippet of user JS two ways:
 *   1. As plain JS in a vm sandbox (the ground truth).
 *   2. Through the full instrument → runtime → vm pipeline.
 *
 * `expectSameBehavior` asserts that:
 *   - both paths succeed (or both throw)
 *   - their `console.log` output matches exactly
 *
 * `expectCleanStack` additionally asserts the final call stack only
 * contains the Global frame (catches frame-leak bugs that don't break
 * execution but corrupt the call-stack visualization).
 *
 * Whenever a real-world bug is found via this harness, please prefer
 * adding a case here over the more focused suites — these tests catch
 * regressions across the whole instrument + runtime pipeline.
 */
import { describe, it, expect } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { instrument } from '../../engines/js/instrumenter';
import { getRuntimeCode } from '../../engines/js/runtime';

type Result =
  | { ok: true; out: string[]; snapCount: number; callStackDepth: number }
  | { ok: false; err: string };

function makeSandbox(captureLog: boolean): Record<string, unknown> {
  const out: string[] = [];
  const log = captureLog
    ? (...a: unknown[]) => { out.push(a.map(String).join(' ')); }
    : () => {};
  const sandbox: Record<string, unknown> = {
    console: { log, warn: () => {}, error: () => {} },
    Map, Set, Array, Object, String, Number, Boolean, Date, RegExp, Error, JSON, Math,
    parseInt, parseFloat, isNaN, isFinite, undefined, NaN, Infinity, Symbol,
    TypeError, RangeError, SyntaxError, ReferenceError, URIError, Promise, BigInt,
    Reflect, Proxy,
  };
  // In a real Worker `self === globalThis === this`. Mirror that so the
  // runtime's `thisVal !== self` filter correctly skips the global object.
  sandbox.self = sandbox;
  // Expose the capture buffer via a known field so the caller can read it.
  sandbox.__capturedOut = out;
  return sandbox;
}

function runPlain(src: string): Result {
  const sandbox = makeSandbox(true);
  const ctx = createContext(sandbox);
  try {
    runInContext(src, ctx, { timeout: 2000 });
    return { ok: true, out: sandbox.__capturedOut as string[], snapCount: 0, callStackDepth: 1 };
  } catch (e) {
    return { ok: false, err: (e as Error).message };
  }
}

function runInstrumented(src: string): Result {
  let instrumented: string;
  try {
    instrumented = instrument(src);
  } catch (e) {
    return { ok: false, err: 'instrument: ' + (e as Error).message };
  }
  const sandbox = makeSandbox(false);
  const ctx = createContext(sandbox);
  try {
    runInContext(getRuntimeCode() + '\n' + instrumented, ctx, { timeout: 8000 });
    const snaps = (sandbox.__snapshots__ as Array<{ callStack: unknown[] }>) ?? [];
    const stdout = (sandbox.__stdout__ as string[]) ?? [];
    const lastStack = snaps[snaps.length - 1]?.callStack ?? [];
    return { ok: true, out: stdout, snapCount: snaps.length, callStackDepth: lastStack.length };
  } catch (e) {
    return { ok: false, err: (e as Error).message };
  }
}

function expectSameBehavior(src: string) {
  const plain = runPlain(src);
  const instr = runInstrumented(src);
  if (!plain.ok && !instr.ok) return; // both errored — acceptable
  if (plain.ok !== instr.ok) {
    throw new Error(
      `behavior diverged: plain.ok=${plain.ok}, instr.ok=${instr.ok}\n` +
      `  plain.err=${plain.ok ? '-' : plain.err}\n  instr.err=${instr.ok ? '-' : instr.err}`
    );
  }
  if (plain.ok && instr.ok) {
    expect(instr.out).toEqual(plain.out);
  }
}

function expectCleanStack(src: string) {
  expectSameBehavior(src);
  const instr = runInstrumented(src);
  if (instr.ok) {
    expect(instr.callStackDepth).toBe(1);
  }
}

describe('behavior comparison: plain JS vs. instrumented pipeline', () => {
  // ── Educational classics ──

  it('FizzBuzz 1-15', () => expectSameBehavior(`
    let out = [];
    for (let i = 1; i <= 15; i++) {
      if (i % 15 === 0) out.push('FizzBuzz');
      else if (i % 3 === 0) out.push('Fizz');
      else if (i % 5 === 0) out.push('Buzz');
      else out.push(String(i));
    }
    console.log(out.join(','));
  `));

  it('factorial recursive', () => expectSameBehavior(`
    function fact(n) { return n <= 1 ? 1 : n * fact(n - 1); }
    console.log(fact(6));
  `));

  it('fibonacci recursive', () => expectSameBehavior(`
    function fib(n) { return n < 2 ? n : fib(n-1) + fib(n-2); }
    console.log(fib(8));
  `));

  it('bubble sort', () => expectSameBehavior(`
    function bubble(a) {
      for (let i = 0; i < a.length; i++)
        for (let j = 0; j < a.length - i - 1; j++)
          if (a[j] > a[j+1]) { let t = a[j]; a[j] = a[j+1]; a[j+1] = t; }
      return a;
    }
    console.log(bubble([5,2,8,1,9,3]).join(','));
  `));

  it('binary search', () => expectSameBehavior(`
    function bs(a, target) {
      let lo = 0, hi = a.length - 1;
      while (lo <= hi) {
        let mid = (lo + hi) >> 1;
        if (a[mid] === target) return mid;
        if (a[mid] < target) lo = mid + 1;
        else hi = mid - 1;
      }
      return -1;
    }
    console.log(bs([1,3,5,7,9,11,13], 9));
  `));

  it('sieve of eratosthenes', () => expectSameBehavior(`
    function sieve(n) {
      let p = Array(n+1).fill(true);
      p[0] = p[1] = false;
      for (let i = 2; i*i <= n; i++) {
        if (p[i]) for (let j = i*i; j <= n; j += i) p[j] = false;
      }
      return p.map((v,i) => v ? i : null).filter(x => x !== null);
    }
    console.log(sieve(30).join(','));
  `));

  it('palindrome check', () => expectSameBehavior(`
    function isPal(s) {
      let i = 0, j = s.length - 1;
      while (i < j) { if (s[i] !== s[j]) return false; i++; j--; }
      return true;
    }
    console.log(isPal('racecar'), isPal('hello'));
  `));

  it('Tower of Hanoi', () => expectSameBehavior(`
    let moves = 0;
    function hanoi(n, from, to, via) {
      if (n === 0) return;
      hanoi(n - 1, from, via, to);
      moves++;
      hanoi(n - 1, via, to, from);
    }
    hanoi(3, 'A', 'C', 'B');
    console.log(moves);
  `));

  it('N-queens count (4x4)', () => expectSameBehavior(`
    function nq(n) {
      let count = 0;
      function place(row, cols, d1, d2) {
        if (row === n) { count++; return; }
        for (let col = 0; col < n; col++) {
          let a = row - col + n, b = row + col;
          if (!cols[col] && !d1[a] && !d2[b]) {
            cols[col] = d1[a] = d2[b] = true;
            place(row + 1, cols, d1, d2);
            cols[col] = d1[a] = d2[b] = false;
          }
        }
      }
      place(0, [], [], []);
      return count;
    }
    console.log(nq(4));
  `));

  // ── Modern syntax ──

  it('optional chaining + nullish', () => expectSameBehavior(`
    let obj = { a: { b: 5 } };
    console.log(obj?.a?.b, obj?.c?.d ?? 'default');
  `));

  it('optional chaining call', () => expectSameBehavior(`
    let o = { foo: () => 42, bar: null };
    console.log(o?.foo?.(), o?.bar?.());
  `));

  it('logical assignment operators', () => expectSameBehavior(`
    let a = null, b = 0, c = 1;
    a ||= 'A'; b ??= 'B'; c &&= 'C';
    console.log(a, b, c);
  `));

  it('default params referencing earlier params', () => expectSameBehavior(`
    function f(a, b = a * 2, c = a + b) { return c; }
    console.log(f(3));
  `));

  it('destructuring default in function param', () => expectSameBehavior(`
    function f({ x = 1, y = 2 } = {}) { return x + y; }
    console.log(f(), f({ x: 10 }), f({ x: 10, y: 20 }));
  `));

  it('nested destructuring', () => expectSameBehavior(`
    let { a: { b: [c, d] } } = { a: { b: [1, 2] } };
    console.log(c, d);
  `));

  it('computed property names with call', () => expectSameBehavior(`
    function key() { return 'dyn_' + 5; }
    let obj = { [key()]: 'val' };
    console.log(obj.dyn_5);
  `));

  it('tagged template literal', () => expectSameBehavior(`
    function tag(strs, ...vals) { return strs.raw.join('|') + '::' + vals.join(','); }
    let x = 5, y = 10;
    console.log(tag\`x=\${x},y=\${y}\`);
  `));

  it('arrow returning object literal', () => expectSameBehavior(`
    let mk = () => ({ x: 1, y: 2 });
    let r = mk();
    console.log(r.x, r.y);
  `));

  it('Array.from with mapfn', () => expectSameBehavior(`
    console.log(Array.from({ length: 5 }, (_, i) => i * i).join(','));
  `));

  // ── Closures & per-iteration bindings ──

  it('let-style closure in for-loop (per-iteration binding)', () => expectSameBehavior(`
    let funcs = [];
    for (let i = 0; i < 3; i++) funcs.push(() => i);
    console.log(funcs.map(f => f()).join(','));
  `));

  it('let closure in nested for-loops', () => expectSameBehavior(`
    let funcs = [];
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++)
        funcs.push(() => i * 10 + j);
    console.log(funcs.map(f => f()).join(','));
  `));

  it('let closure in for-of', () => expectSameBehavior(`
    let funcs = [];
    for (const x of [10, 20, 30]) funcs.push(() => x);
    console.log(funcs.map(f => f()).join(','));
  `));

  it('let closure in while loop', () => expectSameBehavior(`
    let funcs = [], i = 0;
    while (i < 3) { let captured = i; funcs.push(() => captured); i++; }
    console.log(funcs.map(f => f()).join(','));
  `));

  it('for-loop with multi-var let creates per-iteration closures', () => expectSameBehavior(`
    let funcs = [];
    for (let i = 0, j = 100; i < 3; i++, j--) funcs.push(() => i + '/' + j);
    console.log(funcs.map(f => f()).join(';'));
  `));

  it('classic closure counter', () => expectSameBehavior(`
    function make() { let c = 0; return () => ++c; }
    let f = make();
    console.log(f(), f(), f());
  `));

  // ── Classes ──

  it('class inheritance via super()', () => expectSameBehavior(`
    class A { constructor(n) { this.n = n; } greet() { return 'A' + this.n; } }
    class B extends A { greet() { return super.greet() + 'B'; } }
    console.log(new B(1).greet());
  `));

  it('class field initializer with call', () => expectSameBehavior(`
    function init() { return 42; }
    class C { x = init(); }
    console.log(new C().x);
  `));

  it('class field referencing other field via this', () => expectSameBehavior(`
    class C { x = 5; y = this.x * 2; }
    console.log(new C().y);
  `));

  it('class with getter and setter', () => expectSameBehavior(`
    class Box {
      _v = 0;
      get v() { return this._v; }
      set v(x) { this._v = x * 2; }
    }
    let b = new Box(); b.v = 5;
    console.log(b.v);
  `));

  it('static block', () => expectSameBehavior(`
    class C { static result; static { C.result = 1 + 2 * 10; } }
    console.log(C.result);
  `));

  it('private fields and methods', () => expectSameBehavior(`
    class C {
      #x = 10;
      #h() { return this.#x * 2; }
      run() { return this.#h(); }
    }
    console.log(new C().run());
  `));

  it('class extends expression', () => expectSameBehavior(`
    function pick() { return class { greet() { return 'A'; } }; }
    class B extends pick() { greet() { return super.greet() + 'B'; } }
    console.log(new B().greet());
  `));

  // ── Initializer invoking callback (TDZ regression family) ──

  it('let init via array.find', () => expectSameBehavior(`
    let arr = [{ id: 'a' }, { id: 'b' }];
    let found = arr.find(x => x.id === 'a');
    console.log(found.id);
  `));

  it('let init via array.filter', () => expectSameBehavior(`
    let arr = [1, 2, 3, 4];
    let evens = arr.filter(n => n % 2 === 0);
    console.log(evens.join(','));
  `));

  it('kanban-style immutable move (original failing case)', () => expectSameBehavior(`
    let lanes = { todo: [{ id: '0a' }, { id: '1b' }], inprogress: [], done: [] };
    function move(state, id, from, to) {
      let next = JSON.parse(JSON.stringify(state));
      let card = next[from].find(c => c.id === id);
      next[from] = next[from].filter(c => c.id !== id);
      next[to].push(card);
      return next;
    }
    let r = move(lanes, '0a', 'todo', 'done');
    console.log(r.done[0].id);
  `));

  // ── Generators / iterators ──

  it('basic generator yield', () => expectSameBehavior(`
    function* g() { yield 1; yield 2; yield 3; }
    console.log([...g()].join(','));
  `));

  it('generator with internal state', () => expectSameBehavior(`
    function* fib() {
      let [a, b] = [0, 1];
      while (true) { yield a; [a, b] = [b, a + b]; }
    }
    let it = fib(), out = [];
    for (let i = 0; i < 8; i++) out.push(it.next().value);
    console.log(out.join(','));
  `));

  it('yield* delegation', () => expectSameBehavior(`
    function* inner() { yield 'a'; yield 'b'; }
    function* outer() { yield 1; yield* inner(); yield 2; }
    console.log([...outer()].join(','));
  `));

  it('custom iterator via Symbol.iterator', () => expectSameBehavior(`
    class Range {
      constructor(n) { this.n = n; }
      [Symbol.iterator]() {
        let i = 0, n = this.n;
        return { next() { return i < n ? { value: i++, done: false } : { value: undefined, done: true }; } };
      }
    }
    let out = [];
    for (const v of new Range(4)) out.push(v);
    console.log(out.join(','));
  `));

  // ── Control flow & call-stack cleanliness ──

  it('return inside try cleans up frame', () => expectCleanStack(`
    function f() { try { return 1; } catch (e) {} } f();
  `));

  it('return inside catch cleans up frame', () => expectCleanStack(`
    function f() { try { throw new Error('x'); } catch (e) { return 1; } } f();
  `));

  it('return inside finally cleans up frame', () => expectCleanStack(`
    function f() { try { return 1; } finally {} } f();
  `));

  it('return inside for loop cleans up frame', () => expectCleanStack(`
    function f() { for (let i = 0; i < 3; i++) return i; } f();
  `));

  it('return inside while loop cleans up frame', () => expectCleanStack(`
    function f() { while (true) return 1; } f();
  `));

  it('return inside do-while cleans up frame', () => expectCleanStack(`
    function f() { do { return 1; } while (false); } f();
  `));

  it('return inside switch case cleans up frame', () => expectCleanStack(`
    function f(n) { switch (n) { case 1: return 'a'; default: return 'b'; } } f(1);
  `));

  // Throw-propagation cases need a trailing statement after the catch so
  // that a snapshot is emitted *after* the synthetic catch wrapper has had a
  // chance to pop the frames. The last snapshot otherwise lands mid-throw,
  // before any cleanup runs.

  it('throw across function boundary cleans up frames', () => expectCleanStack(`
    function inner() { throw new Error('x'); }
    function outer() { inner(); }
    try { outer(); } catch (e) {}
    let __after = 1;
  `));

  it('throw out of for-loop in function cleans up frames', () => expectCleanStack(`
    function f() { for (let i = 0; i < 5; i++) if (i === 2) throw new Error('x'); }
    try { f(); } catch (e) {}
    let __after = 1;
  `));

  it('throw and rethrow chain cleans up frames', () => expectCleanStack(`
    function inner() { throw new Error('orig'); }
    function outer() {
      try { inner(); }
      catch (e) { throw new Error('wrapped:' + e.message); }
    }
    try { outer(); } catch (e) {}
    let __after = 1;
  `));

  // ── Labels ──

  it('labeled break', () => expectSameBehavior(`
    let pairs = [];
    outer: for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (i === 1 && j === 1) break outer;
        pairs.push(i + ',' + j);
      }
    }
    console.log(pairs.join(';'));
  `));

  // ── Misc real-world textbook patterns ──

  it('flatten nested array', () => expectSameBehavior(`
    function flat(a) {
      let out = [];
      for (const x of a) (Array.isArray(x) ? out.push(...flat(x)) : out.push(x));
      return out;
    }
    console.log(flat([1, [2, [3, [4, 5]], 6], 7]).join(','));
  `));

  it('object deep clone', () => expectSameBehavior(`
    function clone(o) {
      if (o === null || typeof o !== 'object') return o;
      if (Array.isArray(o)) return o.map(clone);
      let out = {};
      for (const k of Object.keys(o)) out[k] = clone(o[k]);
      return out;
    }
    let orig = { a: 1, b: { c: 2 } };
    let c = clone(orig); c.b.c = 99;
    console.log(orig.b.c, c.b.c);
  `));

  it('LRU cache via Map', () => expectSameBehavior(`
    class LRU {
      constructor(n) { this.n = n; this.m = new Map(); }
      get(k) {
        if (!this.m.has(k)) return -1;
        let v = this.m.get(k); this.m.delete(k); this.m.set(k, v); return v;
      }
      put(k, v) {
        if (this.m.has(k)) this.m.delete(k);
        else if (this.m.size >= this.n) this.m.delete(this.m.keys().next().value);
        this.m.set(k, v);
      }
    }
    let c = new LRU(2);
    c.put(1, 'a'); c.put(2, 'b');
    let r1 = c.get(1);
    c.put(3, 'c');
    let r2 = c.get(2);
    console.log(r1, r2);
  `));

  it('linked list reversal', () => expectSameBehavior(`
    function make(arr) {
      let h = null;
      for (let i = arr.length - 1; i >= 0; i--) h = { val: arr[i], next: h };
      return h;
    }
    function reverse(h) {
      let prev = null;
      while (h) { let n = h.next; h.next = prev; prev = h; h = n; }
      return prev;
    }
    function toArr(h) { let out = []; while (h) { out.push(h.val); h = h.next; } return out; }
    console.log(toArr(reverse(make([1,2,3,4,5]))).join(','));
  `));

  it('memoized fib via closure cache', () => expectSameBehavior(`
    function makeFib() {
      let cache = { 0: 0, 1: 1 };
      function fib(n) {
        if (cache[n] !== undefined) return cache[n];
        cache[n] = fib(n-1) + fib(n-2);
        return cache[n];
      }
      return fib;
    }
    let f = makeFib();
    console.log(f(0), f(5), f(10), f(15));
  `));

  // ── Special numeric / value types ──

  it('BigInt arithmetic', () => expectSameBehavior(`
    let a = 9007199254740993n, b = 2n;
    console.log((a * b).toString());
  `));

  it('Symbol as property key', () => expectSameBehavior(`
    let k = Symbol('id');
    let o = { [k]: 42 };
    console.log(o[k]);
  `));

  it('multi-line template literal', () => expectSameBehavior(`
    let s = \`line1\\nline2\\nline3\`;
    console.log(s.split('\\n').length);
  `));

  // ── async (basic) ──

  it('async function with await', () => expectSameBehavior(`
    async function f() { let x = await Promise.resolve(10); return x + 1; }
    f().then(v => console.log(v));
  `));

  it('throw inside async function', () => expectSameBehavior(`
    async function f() { throw new Error('boom'); }
    f().catch(e => console.log('caught:' + e.message));
  `));
});
