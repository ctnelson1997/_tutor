/**
 * What a program can see of its instrumentation (#47): nothing. Each test runs
 * the program as the app does (runJsTutor: the worker script in a Node thread),
 * where Error.prepareStackTrace is honored as in a browser worker.
 */
import { describe, expect, it } from 'vitest';
import { instrument, sourceKey } from '../instrumenter';
import { runJsTutor } from './node/harness';

/** What the program printed, line by line. */
async function printed(source: string): Promise<string[]> {
  const reply = await runJsTutor(source);
  if (reply.type !== 'result') throw new Error(reply.message);
  if (reply.error) throw new Error(reply.error.message);
  return reply.snapshots[reply.snapshots.length - 1].stdout;
}

describe("the program doesn't see its instrumentation (#47)", () => {
  it("gives each function's own text to toString, however it is defined", async () => {
    const lines = await printed(`function add(a, b) { return a + b; }
const twice = (x) => x * 2;
const obj = { greet(n) { return "hi " + n; }, get size() { return 1; } };
class Box {
  static of(v) { return new Box(v); }
  constructor(v) { this.v = v; }
}
console.log(add.toString());
console.log(String(twice));
console.log(Function.prototype.toString.call(obj.greet));
console.log(Object.getOwnPropertyDescriptor(obj, "size").get.toString());
console.log(Box.of.toString());
console.log(\`\${Box}\`.split("\\n")[0]);`);
    expect(lines).toEqual([
      'function add(a, b) { return a + b; }',
      '(x) => x * 2',
      'greet(n) { return "hi " + n; }',
      'get size() { return 1; }',
      'of(v) { return new Box(v); }',
      'class Box {',
    ]);
  });

  it("makes the runtime's functions look like the browser's own", async () => {
    const lines = await printed(`console.log(String(console.log));
console.log(setTimeout.toString(), Function.prototype.toString.toString());`);
    expect(lines).toEqual([
      'function log() { [native code] }',
      'function setTimeout() { [native code] } function toString() { [native code] }',
    ]);
  });

  it("doesn't freeze an error's stack by drawing it, and draws it without the stack", async () => {
    const reply = await runJsTutor(`class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.field = "email";
  }
}
const e = new ValidationError("bad email");
console.log(e.stack.split("\\n")[0]);`);
    if (reply.type !== 'result') throw new Error(reply.message);
    const last = reply.snapshots[reply.snapshots.length - 1];
    expect(last.stdout).toEqual(['ValidationError: bad email']);
    const error = last.heap.find(h => h.objectType === 'error');
    expect(error?.properties.map(p => p.key)).toEqual(['message', 'name', 'field']);
  });

  it("names the program's functions and lines in a stack, leaving out the runtime's and the worker's frames", async () => {
    const lines = await printed(`function divide(a, b) {
  if (b === 0) throw new RangeError("divide by zero");
  return a / b;
}
function report() {
  try {
    divide(1, 0);
  } catch (e) {
    console.log(e.stack);
  }
}
report();`);
    expect(lines).toEqual(['RangeError: divide by zero', '    at divide (main.js:2)', '    at report (main.js:7)', '    at main.js:12']);
  });

  it("quotes a function's own text in a DataCloneError", async () => {
    const lines = await printed(`try {
  structuredClone({ handler: () => 42 });
} catch (e) {
  console.log(e.name, e.message);
}`);
    expect(lines).toEqual(['DataCloneError () => 42 could not be cloned.']);
  });
});

describe("the instrumenter's facts for the runtime (#47)", () => {
  it('puts the line map and the functions texts first', () => {
    const lines = instrument('function f() {\n  return 1;\n}\nf();').split('\n');
    expect(lines[0]).toMatch(/^__programLines__\(\[0,0,0,/);
    expect(lines[1]).toMatch(/^__sourceTexts__\(\{"\d+:[0-9a-z]+":"function f\(\) \{\\n {2}return 1;\\n\}"\}\);$/);
  });

  it('keys a text by its length and hash', () => {
    expect(sourceKey('abc')).toBe(sourceKey('abc'));
    expect(sourceKey('abc')).not.toBe(sourceKey('abd'));
    expect(sourceKey('abc')).toMatch(/^3:/);
  });
});
