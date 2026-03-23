import { describe, it, expect } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { instrument } from '../../engines/js/instrumenter';
import { getRuntimeCode } from '../../engines/js/runtime';
import type { ExecutionSnapshot } from '../../types/snapshot';

/**
 * Helper: run instrumented code through the full pipeline (without a Web Worker).
 * Returns the resulting snapshots array.
 *
 * Uses Node's `vm.createContext` + `vm.runInContext` to execute code in an
 * isolated sandbox. Each call gets a fresh context so there's no global leakage
 * between tests.
 */
function runPipeline(source: string): ExecutionSnapshot[] {
  const instrumented = instrument(source);
  const fullCode = getRuntimeCode() + '\n' + instrumented;

  // Create a sandboxed context with all builtins the runtime preamble needs
  const sandbox: Record<string, unknown> = {
    // The runtime references `self` for exposing __snapshots__
    self: {},
    // Builtins used by the runtime preamble
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
    },
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Date,
    RegExp,
    Error,
    JSON,
    Math,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    undefined,
    NaN,
    Infinity,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
    URIError,
  };

  const ctx = createContext(sandbox);
  runInContext(fullCode, ctx);

  const snapshots = ctx.__snapshots__ as ExecutionSnapshot[];
  return JSON.parse(JSON.stringify(snapshots));
}

/** Helper to find a variable in a snapshot's callstack */
function findVar(snap: ExecutionSnapshot, varName: string, frameIndex?: number) {
  if (frameIndex !== undefined) {
    const frame = snap.callStack[frameIndex];
    return frame?.variables.find(v => v.name === varName);
  }
  // Search all frames
  for (const frame of snap.callStack) {
    const v = frame.variables.find(v => v.name === varName);
    if (v) return v;
  }
  return undefined;
}

/** Helper to get the last snapshot */
function lastSnap(snaps: ExecutionSnapshot[]): ExecutionSnapshot {
  return snaps[snaps.length - 1];
}

describe('pipeline (end-to-end)', () => {

  // ── Variables & Types ──

  it('captures primitive variable values', () => {
    const snaps = runPipeline(`let num = 42;
let str = "hello";
let bool = true;
let nothing = null;
let undef = undefined;`);

    expect(snaps.length).toBeGreaterThan(0);

    const last = lastSnap(snaps);
    const num = findVar(last, 'num');
    expect(num?.value).toEqual({ type: 'number', value: 42 });

    const str = findVar(last, 'str');
    expect(str?.value).toEqual({ type: 'string', value: 'hello' });

    const bool = findVar(last, 'bool');
    expect(bool?.value).toEqual({ type: 'boolean', value: true });

    const nothing = findVar(last, 'nothing');
    expect(nothing?.value).toEqual({ type: 'null', value: null });

    const undef = findVar(last, 'undef');
    expect(undef?.value).toEqual({ type: 'undefined', value: null });
  });

  // ── For Loop ──

  it('captures for-loop with correct final values', () => {
    const snaps = runPipeline(`let sum = 0;
for (let i = 1; i <= 3; i++) {
  sum += i;
}`);

    expect(snaps.length).toBeGreaterThan(0);

    // Find the last snapshot where sum is visible
    const last = lastSnap(snaps);
    const sum = findVar(last, 'sum');
    expect(sum?.value).toEqual({ type: 'number', value: 6 });
  });

  it('creates block scope frames for let-based for-loop', () => {
    const snaps = runPipeline(`for (let i = 0; i < 2; i++) {
  let x = i;
}`);

    // Some snapshots should have a block scope frame
    const hasBlockScope = snaps.some(snap =>
      snap.callStack.some(frame => frame.isBlockScope === true)
    );
    expect(hasBlockScope).toBe(true);
  });

  // ── While Loop ──

  it('captures while-loop state progression', () => {
    const snaps = runPipeline(`let n = 1;
while (n < 10) {
  n = n * 2;
}`);

    const last = lastSnap(snaps);
    const n = findVar(last, 'n');
    expect(n?.value).toEqual({ type: 'number', value: 16 });
  });

  // ── Do-While Loop ──

  it('captures do-while loop', () => {
    const snaps = runPipeline(`let n = 1;
do {
  n = n + 1;
} while (n < 5);`);

    const last = lastSnap(snaps);
    const n = findVar(last, 'n');
    expect(n?.value).toEqual({ type: 'number', value: 5 });
  });

  // ── Conditionals ──

  it('captures condition results', () => {
    const snaps = runPipeline(`let x = 5;
if (x > 3) {
  let y = 1;
}`);

    // Should have at least one condition snapshot
    const condSnaps = snaps.filter(s => s.condition);
    expect(condSnaps.length).toBeGreaterThan(0);
    // The condition x > 3 should be true
    expect(condSnaps[0].condition?.result).toBe(true);
  });

  it('captures false condition branches', () => {
    const snaps = runPipeline(`let x = 1;
if (x > 10) {
  let y = 1;
} else {
  let z = 2;
}`);

    const condSnaps = snaps.filter(s => s.condition);
    expect(condSnaps.length).toBeGreaterThan(0);
    expect(condSnaps[0].condition?.result).toBe(false);
  });

  // ── Recursion ──

  it('captures recursive call stack growth', () => {
    const snaps = runPipeline(`function f(n) {
  if (n <= 1) return 1;
  return n * f(n - 1);
}
f(3);`);

    // Max call stack depth should reach 3 (plus Global)
    const maxDepth = Math.max(...snaps.map(s => s.callStack.length));
    expect(maxDepth).toBeGreaterThanOrEqual(4); // Global + f(3) + f(2) + f(1)
  });

  it('captures return values from recursive functions', () => {
    const snaps = runPipeline(`function f(n) {
  if (n <= 1) return 1;
  return n * f(n - 1);
}
let result = f(3);`);

    const last = lastSnap(snaps);
    const result = findVar(last, 'result');
    expect(result?.value).toEqual({ type: 'number', value: 6 });
  });

  // ── Closures ──

  it('captures closure variables', () => {
    const snaps = runPipeline(`function make() {
  let c = 0;
  return function inc() {
    c++;
    return c;
  };
}
let f = make();
f();
f();`);

    // Look for snapshots inside the inc function that have closureVars
    const closureSnaps = snaps.filter(s =>
      s.callStack.some(frame => frame.closureVars && frame.closureVars.length > 0)
    );
    expect(closureSnaps.length).toBeGreaterThan(0);

    // The closure var 'c' should be visible and incrementing
    const lastClosure = closureSnaps[closureSnaps.length - 1];
    const incFrame = lastClosure.callStack.find(f => f.closureVars && f.closureVars.length > 0);
    const cVar = incFrame?.closureVars?.find(v => v.name === 'c');
    expect(cVar).toBeDefined();
  });

  // ── Objects & Heap ──

  it('captures objects on the heap', () => {
    const snaps = runPipeline(`let o = { a: 1, b: 2 };`);

    const last = lastSnap(snaps);
    expect(last.heap.length).toBeGreaterThan(0);

    const obj = last.heap.find(h => h.objectType === 'object');
    expect(obj).toBeDefined();
    expect(obj!.properties.find(p => p.key === 'a')?.value).toEqual({ type: 'number', value: 1 });
  });

  it('tracks object mutations across snapshots', () => {
    const snaps = runPipeline(`let o = { a: 1 };
o.a = 2;`);

    const last = lastSnap(snaps);
    const obj = last.heap.find(h => h.objectType === 'object');
    expect(obj!.properties.find(p => p.key === 'a')?.value).toEqual({ type: 'number', value: 2 });
  });

  // ── Arrays ──

  it('captures arrays on the heap', () => {
    const snaps = runPipeline(`let a = [1, 2, 3];`);

    const last = lastSnap(snaps);
    const arr = last.heap.find(h => h.objectType === 'array');
    expect(arr).toBeDefined();
    expect(arr!.properties.length).toBe(3);
  });

  it('captures array push', () => {
    const snaps = runPipeline(`let a = [1, 2, 3];
a.push(4);`);

    const last = lastSnap(snaps);
    const arr = last.heap.find(h => h.objectType === 'array');
    expect(arr!.properties.length).toBe(4);
  });

  // ── Console output ──

  it('captures console.log output in stdout', () => {
    const snaps = runPipeline(`console.log("hello world");`);

    const last = lastSnap(snaps);
    expect(last.stdout).toContain('hello world');
  });

  it('captures console.warn with prefix', () => {
    const snaps = runPipeline(`console.warn("caution");`);

    const last = lastSnap(snaps);
    expect(last.stdout.some(s => s.includes('[warn]') && s.includes('caution'))).toBe(true);
  });

  it('captures console.error with prefix', () => {
    const snaps = runPipeline(`console.error("oops");`);

    const last = lastSnap(snaps);
    expect(last.stdout.some(s => s.includes('[error]') && s.includes('oops'))).toBe(true);
  });

  it('accumulates stdout across steps', () => {
    const snaps = runPipeline(`console.log("first");
console.log("second");`);

    const last = lastSnap(snaps);
    expect(last.stdout).toContain('first');
    expect(last.stdout).toContain('second');
  });

  // ── Infinite loop guard ──

  it('throws on infinite loop', () => {
    expect(() => runPipeline('while (true) { }')).toThrow(/Infinite loop|exceeded/);
  });

  // ── Snapshot limit ──

  it('caps snapshots at 5000', () => {
    // A loop that generates many snapshots
    const snaps = runPipeline(`let x = 0;
for (let i = 0; i < 5000; i++) {
  x++;
}`);

    expect(snaps.length).toBeLessThanOrEqual(5000);
  });

  // ── Snapshot structure ──

  it('snapshots have required fields', () => {
    const snaps = runPipeline('let x = 1;');

    for (const snap of snaps) {
      expect(snap).toHaveProperty('step');
      expect(snap).toHaveProperty('line');
      expect(snap).toHaveProperty('callStack');
      expect(snap).toHaveProperty('heap');
      expect(snap).toHaveProperty('stdout');
      expect(typeof snap.step).toBe('number');
      expect(typeof snap.line).toBe('number');
      expect(Array.isArray(snap.callStack)).toBe(true);
      expect(Array.isArray(snap.heap)).toBe(true);
      expect(Array.isArray(snap.stdout)).toBe(true);
    }
  });

  it('first frame is always Global', () => {
    const snaps = runPipeline('let x = 1;');

    for (const snap of snaps) {
      expect(snap.callStack[0].name).toBe('Global');
    }
  });

  // ── this context ──

  it('captures this context in methods', () => {
    const snaps = runPipeline(`let obj = {
  x: 42,
  getX: function() { return this.x; }
};
obj.getX();`);

    // Some snapshot inside getX should have thisArg
    const hasThis = snaps.some(s =>
      s.callStack.some(f => f.thisArg !== undefined)
    );
    expect(hasThis).toBe(true);
  });

  // ── Classes ──

  it('captures class instances on heap as "class" type', () => {
    const snaps = runPipeline(`class Foo {
  constructor(val) { this.val = val; }
}
let f = new Foo(10);`);

    const last = lastSnap(snaps);
    const classObj = last.heap.find(h => h.objectType === 'class');
    expect(classObj).toBeDefined();
    expect(classObj!.label).toBe('Foo');
  });

  // ── Functions on heap ──

  it('captures functions on heap', () => {
    const snaps = runPipeline(`function greet() { return "hi"; }
let f = greet;`);

    const last = lastSnap(snaps);
    const funcObj = last.heap.find(h => h.objectType === 'function');
    expect(funcObj).toBeDefined();
  });

  // ── Full example regression tests ──

  it('runs Variables & Types example end-to-end', () => {
    const snaps = runPipeline(`let num = 42;
let str = "hello";
let bool = true;
let nothing = null;
let undef = undefined;
console.log(num, str, bool, nothing, undef);`);

    expect(snaps.length).toBeGreaterThan(5);
    const last = lastSnap(snaps);
    expect(last.stdout.length).toBeGreaterThan(0);
  });

  it('runs For Loop example end-to-end', () => {
    const snaps = runPipeline(`let sum = 0;
for (let i = 1; i <= 5; i++) {
  sum += i;
}
console.log("Sum:", sum);`);

    const last = lastSnap(snaps);
    const sum = findVar(last, 'sum');
    expect(sum?.value).toEqual({ type: 'number', value: 15 });
    expect(last.stdout.some(s => s.includes('15'))).toBe(true);
  });

  it('runs Recursion example end-to-end', () => {
    const snaps = runPipeline(`function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
let result = factorial(5);
console.log("5! =", result);`);

    const last = lastSnap(snaps);
    const result = findVar(last, 'result');
    expect(result?.value).toEqual({ type: 'number', value: 120 });
  });

  it('runs Closures example end-to-end', () => {
    const snaps = runPipeline(`function makeCounter() {
  let count = 0;
  return function increment() {
    count++;
    return count;
  };
}
let counter = makeCounter();
console.log(counter());
console.log(counter());
console.log(counter());`);

    const last = lastSnap(snaps);
    expect(last.stdout).toContain('1');
    expect(last.stdout).toContain('2');
    expect(last.stdout).toContain('3');
  });

  it('runs Linked List example end-to-end', () => {
    const snaps = runPipeline(`function createNode(value, next) {
  return { value: value, next: next };
}
let list = null;
for (let i = 3; i >= 1; i--) {
  list = createNode(i, list);
}
let current = list;
while (current !== null) {
  console.log(current.value);
  current = current.next;
}`);

    const last = lastSnap(snaps);
    expect(last.stdout).toContain('1');
    expect(last.stdout).toContain('2');
    expect(last.stdout).toContain('3');
  });

  it('runs Objects & Methods example end-to-end', () => {
    const snaps = runPipeline(`let person = {
  name: "Alice",
  age: 25,
  greet: function() {
    return "Hi, I'm " + this.name;
  }
};
console.log(person.greet());
person.age = 26;
console.log(person.name, "is", person.age);`);

    const last = lastSnap(snaps);
    expect(last.stdout.some(s => s.includes("Alice"))).toBe(true);
  });

  it('runs Classes example end-to-end', () => {
    const snaps = runPipeline(`class Animal {
  constructor(name, sound) {
    this.name = name;
    this.sound = sound;
  }
  speak() {
    return this.name + " says " + this.sound;
  }
}
let cat = new Animal("Cat", "meow");
let dog = new Animal("Dog", "woof");
console.log(cat.speak());
console.log(dog.speak());`);

    const last = lastSnap(snaps);
    expect(last.stdout.some(s => s.includes("Cat says meow"))).toBe(true);
    expect(last.stdout.some(s => s.includes("Dog says woof"))).toBe(true);
  });
});
