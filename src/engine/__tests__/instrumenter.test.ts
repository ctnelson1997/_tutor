import { describe, it, expect } from 'vitest';
import { instrument } from '../../engines/js/instrumenter';

describe('instrument', () => {
  // ── Parse errors ──

  it('throws on invalid JavaScript', () => {
    expect(() => instrument('let = ;')).toThrow();
  });

  it('parse error includes location info', () => {
    try {
      instrument('let x = 1;\nlet = ;');
      expect.fail('should have thrown');
    } catch (e: unknown) {
      // Acorn attaches a loc property
      expect((e as Record<string, unknown>).loc).toBeDefined();
    }
  });

  // ── Basic instrumentation ──

  it('injects __capture__ for a simple variable declaration', () => {
    const out = instrument('let x = 1;');
    expect(out).toContain('__capture__');
  });

  it('injects multiple captures for multiple statements', () => {
    const out = instrument('let x = 1;\nlet y = 2;');
    const count = (out.match(/__capture__/g) || []).length;
    // At least one per statement plus the initial capture
    expect(count).toBeGreaterThanOrEqual(3);
  });

  // ── Eval blocking ──

  it('prepends eval blocker', () => {
    const out = instrument('let x = 1;');
    expect(out).toContain('var eval = undefined');
  });

  // ── Loop guard ──

  it('prepends loop counter', () => {
    const out = instrument('let x = 1;');
    expect(out).toContain('var __loopCount = 0');
    expect(out).toContain('var __MAX_LOOPS = 10000');
  });

  it('injects loop guard in for-loop body', () => {
    const out = instrument('for (let i = 0; i < 5; i++) { let x = i; }');
    expect(out).toContain('__loopCount');
    expect(out).toContain('__MAX_LOOPS');
  });

  it('injects loop guard in while-loop body', () => {
    const out = instrument('while (true) { break; }');
    expect(out).toContain('__loopCount');
  });

  it('injects loop guard in do-while loop', () => {
    const out = instrument('do { break; } while (true);');
    expect(out).toContain('__loopCount');
  });

  // ── Function instrumentation ──

  it('injects __pushFrame__ and __popFrame__ for function declarations', () => {
    const out = instrument('function foo(a) { return a; }');
    expect(out).toContain('__pushFrame__');
    expect(out).toContain('__popFrame__');
  });

  it('injects __pushFrame__ for function expressions', () => {
    const out = instrument('let f = function bar(x) { return x; };');
    expect(out).toContain('__pushFrame__');
    expect(out).toContain('__popFrame__');
  });

  it('injects __pushFrame__ for arrow functions', () => {
    const out = instrument('let f = (x) => { return x; };');
    expect(out).toContain('__pushFrame__');
    expect(out).toContain('__popFrame__');
  });

  it('converts arrow expression body to block with return', () => {
    const out = instrument('let f = (x) => x + 1;');
    expect(out).toContain('__pushFrame__');
    expect(out).toContain('__popFrame__');
    expect(out).toContain('return');
  });

  // ── Pre-call capture ──

  it('inserts a pre-call capture before statements containing function calls', () => {
    const out = instrument('function foo() { return 1; }\nlet x = foo();');
    const lines = out.split('\n');
    const letLine = lines.findIndex(l => l.includes('let x'));
    // There should be a __capture__ on a line before the let statement
    const before = lines.slice(0, letLine);
    const preCallCaptures = before.filter(l => l.includes('__capture__'));
    // At least 2: initial capture + pre-call capture
    expect(preCallCaptures.length).toBeGreaterThanOrEqual(2);
  });

  it('inserts a pre-call capture for bare function call statements', () => {
    const out = instrument('function foo() { return 1; }\nfoo();');
    const lines = out.split('\n');
    const callLine = lines.findIndex(l => l.match(/^foo\(\)/));
    // There should be a capture before foo() — either a dedicated pre-call
    // or the initial capture (which doubles as the pre-call when foo() is
    // the first executable statement after function declarations).
    const before = lines.slice(0, callLine);
    const hasCaptureBefore = before.some(l => l.includes('__capture__'));
    expect(hasCaptureBefore).toBe(true);
  });

  it('does not insert pre-call capture for statements without calls', () => {
    const out = instrument('let x = 1;\nlet y = 2;');
    const captures = (out.match(/__capture__/g) || []).length;
    // initial capture + 1 per statement = 3, no pre-call captures
    expect(captures).toBe(3);
  });

  it('does not insert pre-call capture for function definitions containing calls', () => {
    // Arrow function body that contains a call — should NOT trigger pre-call capture
    // because the call is inside a function definition, not at the statement level
    const out = instrument('let f = () => { return foo(); };');
    const lines = out.split('\n');
    const letLine = lines.findIndex(l => l.includes('let f'));
    // Only the initial capture should precede the let statement (no pre-call)
    const before = lines.slice(0, letLine);
    const capturesBefore = before.filter(l => l.includes('__capture__'));
    // Just the initial capture
    expect(capturesBefore.length).toBe(1);
  });

  // ── Condition wrapping ──

  it('wraps if-statement test with __condition__', () => {
    const out = instrument('if (true) { let x = 1; }');
    expect(out).toContain('__condition__');
  });

  it('wraps else-if test with __condition__', () => {
    const out = instrument('if (false) { } else if (true) { let x = 1; }');
    const count = (out.match(/__condition__/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('wraps while-loop test with __condition__', () => {
    const out = instrument('let x = 0; while (x < 5) { x++; }');
    expect(out).toContain('__condition__');
  });

  it('wraps for-loop test with __condition__', () => {
    const out = instrument('for (let i = 0; i < 5; i++) { }');
    expect(out).toContain('__condition__');
  });

  // ── Console rewriting ──
  // Note: console rewriting is done in the runtime, not the instrumenter.
  // The instrumenter does NOT rewrite console calls — verified here.

  it('does not rewrite console.log in the instrumenter', () => {
    const out = instrument('console.log("hello");');
    // The instrumenter preserves console.log as-is
    expect(out).toContain('console.log');
  });

  // ── Hoisting ──

  it('captures var-declared variables from the start (hoisted)', () => {
    const out = instrument('var x = 1;\nvar y = 2;');
    // The initial capture should include hoisted vars
    // There should be a capture before the first statement
    expect(out).toContain('__capture__');
  });

  it('handles function declaration hoisting', () => {
    const out = instrument('foo();\nfunction foo() { return 1; }');
    // Should not throw during instrumentation
    expect(out).toContain('__capture__');
    expect(out).toContain('__pushFrame__');
  });

  it('skips capture after top-level function declarations', () => {
    const out = instrument('function foo() { return 1; }\nlet x = foo();');
    // Between the function declaration and `let x`, the only capture allowed
    // is the pre-call capture for `let x = foo()` (which contains a call).
    // There should be NO capture for the function declaration itself.
    const lines = out.split('\n');
    const funcEnd = lines.findIndex(l => l.trim() === '}');
    const letLine = lines.findIndex(l => l.includes('let x'));
    const between = lines.slice(funcEnd + 1, letLine);
    const capturesBetween = between.filter(l => l.includes('__capture__'));
    // At most 1 capture (the pre-call capture for the let statement's foo() call)
    expect(capturesBetween.length).toBeLessThanOrEqual(1);
  });

  it('sets initial capture line to first non-function-declaration line', () => {
    const out = instrument('function foo() { return 1; }\nfunction bar() { return 2; }\nlet x = 1;');
    // The initial capture (first __capture__ call) should use line 3 (the let statement)
    const match = out.match(/__capture__\((\d+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('3');
  });

  // ── Block scope ──

  it('creates block scope frame for for-loop with let', () => {
    const out = instrument('for (let i = 0; i < 3; i++) { let x = i; }');
    expect(out).toContain('__pushFrame__');
    expect(out).toContain('__popFrame__');
  });

  // ── Destructuring ──

  it('handles object destructuring', () => {
    const out = instrument('let { a, b } = { a: 1, b: 2 };');
    expect(out).toContain('__capture__');
    // Should not throw
  });

  it('handles array destructuring', () => {
    const out = instrument('let [x, y] = [1, 2];');
    expect(out).toContain('__capture__');
  });

  it('handles nested destructuring', () => {
    const out = instrument('let { a: { b } } = { a: { b: 1 } };');
    expect(out).toContain('__capture__');
  });

  it('handles rest elements in destructuring', () => {
    const out = instrument('let [first, ...rest] = [1, 2, 3];');
    expect(out).toContain('__capture__');
  });

  // ── Nested functions & closures ──

  it('tracks closure variables in nested functions', () => {
    const out = instrument(`
      function outer() {
        let x = 1;
        function inner() {
          return x;
        }
        return inner();
      }
    `);
    expect(out).toContain('__pushFrame__');
    // Two pushFrame calls: one for outer, one for inner
    const pushCount = (out.match(/__pushFrame__/g) || []).length;
    expect(pushCount).toBeGreaterThanOrEqual(2);
  });

  // ── Return wrapping ──

  it('wraps return values with __popFrame__', () => {
    const out = instrument('function f() { return 42; }');
    // return 42 should become return __popFrame__(42, lineNum)
    expect(out).toContain('__popFrame__(42');
  });

  it('wraps bare return with __popFrame__', () => {
    const out = instrument('function f() { return; }');
    expect(out).toContain('__popFrame__(undefined');
  });

  // ── Classes ──

  it('instruments class methods', () => {
    const out = instrument(`
      class Foo {
        constructor(x) { this.x = x; }
        bar() { return this.x; }
      }
    `);
    expect(out).toContain('__pushFrame__');
    // At least two methods: constructor and bar
    const pushCount = (out.match(/__pushFrame__/g) || []).length;
    expect(pushCount).toBeGreaterThanOrEqual(2);
  });

  // ── Switch statement ──

  it('instruments switch case bodies', () => {
    const out = instrument(`
      let x = 1;
      switch (x) {
        case 1: let y = 10; break;
        case 2: let z = 20; break;
      }
    `);
    expect(out).toContain('__capture__');
  });

  // ── Try-catch ──

  it('instruments try-catch blocks', () => {
    const out = instrument(`
      try {
        let x = 1;
      } catch (e) {
        let y = 2;
      }
    `);
    expect(out).toContain('__capture__');
  });

  // ── For-in / For-of ──

  it('instruments for-in loops', () => {
    const out = instrument('let obj = {a:1}; for (let k in obj) { let v = obj[k]; }');
    expect(out).toContain('__pushFrame__');
    expect(out).toContain('__loopCount');
  });

  it('instruments for-of loops', () => {
    const out = instrument('let arr = [1,2]; for (let v of arr) { let x = v; }');
    expect(out).toContain('__pushFrame__');
    expect(out).toContain('__loopCount');
  });

  // ── Empty and minimal programs ──

  it('handles empty source code', () => {
    const out = instrument('');
    // Should produce something (at least the preamble)
    expect(out).toContain('var __loopCount');
  });

  it('handles comments-only code', () => {
    const out = instrument('// just a comment');
    expect(out).toContain('var __loopCount');
  });

  // ── All examples from examples.ts parse and instrument without error ──

  const exampleCodes = [
    // Variables & Types
    `let num = 42;
let str = "hello";
let bool = true;
let nothing = null;
let undef = undefined;
console.log(num, str, bool, nothing, undef);`,
    // For Loop
    `let sum = 0;
for (let i = 1; i <= 5; i++) {
  sum += i;
}
console.log("Sum:", sum);`,
    // While Loop
    `let n = 1;
while (n < 100) {
  n = n * 2;
}
console.log(n);`,
    // Conditionals
    `let age = 20;
let category;

if (age < 13) {
  category = "child";
} else if (age < 18) {
  category = "teenager";
} else {
  category = "adult";
}
console.log(category);`,
    // Recursion
    `function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

let result = factorial(5);
console.log("5! =", result);`,
    // Closures
    `function makeCounter() {
  let count = 0;
  return function increment() {
    count++;
    return count;
  };
}

let counter = makeCounter();
console.log(counter());
console.log(counter());
console.log(counter());`,
    // Higher-Order Functions
    `let numbers = [1, 2, 3, 4, 5];

let tripled = numbers.map(function(n) {
  return n * 3;
});

let evens = tripled.filter(function(n) {
  return n % 2 === 0;
});

console.log("tripled:", tripled);
console.log("evens:", evens);`,
    // Linked List
    `function createNode(value, next) {
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
}`,
    // Stack
    `let stack = [];

stack.push(10);
stack.push(20);
stack.push(30);
console.log("Stack:", stack);

let top = stack.pop();
console.log("Popped:", top);
console.log("Stack now:", stack);`,
    // Objects & Methods
    `let person = {
  name: "Alice",
  age: 25,
  greet: function() {
    return "Hi, I'm " + this.name;
  }
};

console.log(person.greet());
person.age = 26;
console.log(person.name, "is", person.age);`,
    // Classes
    `class Animal {
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
console.log(dog.speak());`,
  ];

  for (let idx = 0; idx < exampleCodes.length; idx++) {
    it(`instruments example ${idx + 1} without throwing`, () => {
      expect(() => instrument(exampleCodes[idx])).not.toThrow();
    });
  }
});
