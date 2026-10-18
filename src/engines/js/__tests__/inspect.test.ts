/**
 * The runtime's console formatting (#43) against Node's own: every value
 * here is printed by CONSOLE_SOURCE's `__inspect__` / `__formatArgs__`, run in
 * a vm context as the worker runs it, and by Node's `util.inspect` /
 * `util.format`, and the two must be the same text (an error's stack frames
 * aside, which JSTutor leaves out).
 */
import { Console } from 'node:console';
import { Writable } from 'node:stream';
import util from 'node:util';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CONSOLE_SOURCE } from '../inspect';
import { withoutStackFrames } from './node/harness';

type Formatter = {
  __inspect__: (v: unknown, o?: object) => string;
  __formatArgs__: (args: unknown[]) => string;
  __makeConsole__: (write: (stream: string, text: string) => void) => Record<string, (...a: unknown[]) => void>;
};

function context(): vm.Context & Formatter {
  const ctx = vm.createContext({}) as vm.Context & Formatter;
  vm.runInContext(CONSOLE_SOURCE, ctx);
  return ctx;
}

const ctx = context();

/**
 * Runs `fn` as plain Node would: vitest installs an Error.prepareStackTrace of
 * its own, which writes `Error: ` for an error with an empty message.
 */
function asPlainNode<T>(fn: () => T): T {
  const saved = Error.prepareStackTrace;
  Error.prepareStackTrace = undefined;
  try { return fn(); } finally { Error.prepareStackTrace = saved; }
}

/** Builds the value in the formatter's realm (as a program's values are), and in Node's. */
function both(expr: string): { mine: string; node: string } {
  const valueHere = vm.runInContext(`(${expr})`, ctx);
  const node = asPlainNode(() => util.inspect(vm.runInNewContext(`(${expr})`)));
  return { mine: ctx.__inspect__(valueHere), node };
}

const VALUES = [
  // primitives and strings
  '1', '-0', 'NaN', '-Infinity', '10n', 'true', 'undefined', 'null', 'Symbol("id")', 'Symbol()',
  '["plain", "it\'s", \'say "hi"\', `it\'s "both"`, "it\'s \\"all\\" `three`", "tab\\tnew\\nline", "\\u0001\\u007f", "back\\\\slash", "😀 é 中文"]',
  '["a fairly long string that has a\\nnewline in the middle of it, long enough to split"]',
  '{ s: "x".repeat(200) }',
  // arrays
  '[]', '[1, 2, 3]', '[1, , 3]', 'new Array(5)', '[ , , 1, , ]', '(() => { const a = [1, 2]; a.length = 6; return a; })()',
  'Array.from({ length: 30 }, (_, i) => i)', 'Array.from({ length: 30 }, (_, i) => i * 1000)', 'Array.from({ length: 120 }, (_, i) => i)',
  'Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i))', 'Array.from({ length: 10 }, (_, i) => "word" + i)',
  '[1, "two", [3, [4, [5, [6]]]]]', '(() => { const a = [1, 2]; a.extra = "x"; a[Symbol("s")] = 1; return a; })()',
  '[[1, 2, 3], [4, 5, 6], [7, 8, 9]]', 'Array.from({ length: 8 }, (_, i) => ({ id: i }))', '[-0, 0, NaN, Infinity, undefined, null]',
  '[1.5, 22.25, 333.125, 4, 5, 6, 7, 8, 9, 10]', '[true, false, true, false, true, false, true]',
  // objects
  '({})', '({ a: 1, b: "two", c: [3], d: { e: { f: { g: 1 } } } })', '({ "b-c": 1, $x: 2, _y: 3, "1a": 4, 2: 5, [Symbol("s")]: 6 })',
  '({ make: "Toyota", owner: undefined, year: 2020, tags: ["a", "b"], specs: { hp: 300, doors: 4 } })',
  '({ multi: "line object that is long enough", to: ["wrap", "across", "several", "lines", "here"] })',
  'Object.create(null)', 'Object.assign(Object.create(null), { a: 1 })',
  '({ get g() { return 1; }, set s(v) {}, get gs() { return 1; }, set gs(v) {} })',
  '(() => { const o = { name: "loop" }; o.self = o; o.list = [o, { back: o }]; return o; })()',
  '(() => { const a = { x: 1 }; return { first: a, second: a }; })()',
  '(() => { const o = {}; Object.defineProperty(o, "hidden", { value: 1, enumerable: false }); o.shown = 2; return o; })()',
  '({ a: { b: { c: { d: { e: 1 } } } } })', '({ arr: [[[[1]]]] })',
  '({ k1: 1, k2: 2, k3: 3, k4: 4, k5: 5, k6: 6, k7: 7, k8: 8, k9: 9, k10: 10, k11: 11, k12: 12, k13: 13, k14: 14, k15: 15 })',
  // classes and functions
  '(() => { class Rectangle { constructor() { this._width = 10; this._height = 5; } get area() { return 50; } } return new Rectangle(); })()',
  '(() => { class Empty {} return new Empty(); })()',
  '(() => { class A {} class B extends A { constructor() { super(); this.x = 1; } } return [new B(), B, A]; })()',
  '(() => { function greet(name) { return name; } return [greet, () => 1, function () {}, async function af() {}, function* gen() {}, async function* ag() {}, Math.max]; })()',
  '(() => { function f() {} f.extra = 1; return f; })()',
  '(() => { function* g() { yield 1; } return [g(), [1][Symbol.iterator](), "ab".matchAll(/a/g)]; })()',
  // built-ins
  'new Map([[1, "a"], ["b", { c: 2 }]])',
  '["CountingMap", "MapX", "xMap", "MapS", "Maps", "Map2", "Mapping", "CM"].map(n => new (Function("return class " + n + " extends Map {}")())())',
  '[new (class SetOfThings extends Set {})([1]), new (class Bytes extends Uint8Array {})(2), new (class Stack extends Array {})()]', 'new Map()', 'new Set([1, "1", [1], { one: 1 }, null])', 'new Set()',
  'new Map([[{ id: 1 }, "object key"], [42, [1, 2]], ["nested", new Map([["inner", new Set([1, 2])]])]])',
  'new WeakMap()', 'new WeakSet()', 'new Date(0)', 'new Date(NaN)', '/a+b/gi', 'new RegExp("x/y")',
  'new Uint8Array([255, 0, 255, 3])', 'new Float64Array(3)', 'new Uint8Array(0)', 'new ArrayBuffer(4)', 'new BigInt64Array([1n, 2n])',
  'new Number(3)', 'new String("abc")', 'new Boolean(false)', 'Object(10n)', 'Object(Symbol("b"))',
  '(function () { return arguments; })(1, "two")',
  // errors (frames aside)
  'new Error("boom")', 'new TypeError("bad type")', '(() => { const e = new Error("with code"); e.code = "E1"; return e; })()',
  '(() => { class ValidationError extends Error { constructor(m) { super(m); this.name = "ValidationError"; } } return new ValidationError("bad"); })()',
  '(() => { class HttpError extends Error {} return new HttpError("404"); })()',
  '(() => { class Oops extends Error {} return new Oops("x"); })()',
  '({ err: new RangeError("nested") })', '[new Error("in array")]', 'new Error("outer", { cause: new Error("inner") })',
  '(() => { const e = new Error(""); return e; })()',
];

describe('__inspect__ matches util.inspect', () => {
  for (const expr of VALUES) {
    it(expr.length > 70 ? expr.slice(0, 70) + '…' : expr, () => {
      const { mine, node } = both(expr);
      expect(mine).toBe(withoutStackFrames(node.split('\n')).join('\n'));
    });
  }

  it('takes options as util.inspect does (depth, showHidden, breakLength, maxArrayLength)', () => {
    const v = '({ a: { b: { c: { d: [1, 2, 3, 4] } } }, list: [1, 2, 3] })';
    const here = vm.runInContext(`(${v})`, ctx);
    const there = vm.runInNewContext(`(${v})`);
    for (const opts of [{ depth: 0 }, { depth: null }, { depth: 5 }, { showHidden: true }, { breakLength: Infinity }, { maxArrayLength: 2 }, { depth: -1 }]) {
      expect(ctx.__inspect__(here, opts), JSON.stringify(opts)).toBe(util.inspect(there, opts));
    }
  });

  it("doesn't run the program's code where Node would: a toStringTag getter, a static Symbol.hasInstance", () => {
    const v = vm.runInContext('globalThis.calls = 0; class Tagged { get [Symbol.toStringTag]() { calls++; return "T"; } static [Symbol.hasInstance]() { calls++; return false; } } new Tagged()', ctx);
    // Node prints "{}" here: it calls both, and the hasInstance answer drops the class name.
    expect(ctx.__inspect__(v)).toBe('Tagged {}');
    expect(vm.runInContext('calls', ctx)).toBe(0);
  });

  it('never calls a getter or toJSON', () => {
    const reads = vm.runInContext('globalThis.reads = 0; ({ get count() { return ++globalThis.reads; }, toJSON() { globalThis.reads += 100; } })', ctx);
    ctx.__inspect__(reads);
    expect(vm.runInContext('reads', ctx)).toBe(0);
  });
});

describe('__formatArgs__ matches util.format', () => {
  const CALLS = [
    '["Item: %s", "apple"]', '["%s costs %d dollars", "apple", 1.25]', '["int %i, float %f", 42.9, "3.5"]', '["%d of %s", "7", 42]',
    '["object %o", { item: "apple", qty: 3, tags: ["fruit"] }]', '["object %O", { item: "apple", tags: ["fruit"] }]',
    '["json %j", { a: [1, "b"] }]', '["%c styled", "color: red"]', '["100%% done, %s", "really"]', '["missing %s and %d"]',
    '["extra %s", "one", "two", 3]', '["%s", null, undefined, [1, 2]]', '["%d", 12n, "%i", -0]', '[5, "%s is not a format here", "x"]',
    '["%s|%s", { a: 1 }, ["b"]]', '["%s", new Date(0)]', '["%s", new Error("e")]', '["%s", new Map([[1, 2]])]',
    '["%s", (() => { class P { toString() { return "custom P"; } } return new P(); })()]',
    '["%s", (() => { class Q { constructor() { this.x = { deep: { er: 1 } }; } } return new Q(); })()]',
    '["%d %i %f", "abc", Symbol("s"), "1.5e3"]', '["%j", (() => { const o = {}; o.o = o; return o; })()]',
    '["%s", Symbol("sym")]', '["%x %", 1]', '["trailing %"]', '[]', '["a", "b"]', '[{ a: 1 }, "b", 2]', '["%s"]',
    '["%o", [1, 2]]', '["%s %s", "only one"]',
  ];
  for (const expr of CALLS) {
    it(expr, () => {
      const here = vm.runInContext(expr, ctx) as unknown[];
      const there = vm.runInNewContext(expr) as unknown[];
      expect(ctx.__formatArgs__(here)).toBe(withoutStackFrames(asPlainNode(() => util.format(...there)).split('\n')).join('\n'));
    });
  }
});

describe('the console methods match Node', () => {
  /** What Node's console prints for a script that calls `console`, and what the runtime's console does, as {stream, text} lines. */
  function run(script: string) {
    const mine: { stream: string; text: string }[] = [];
    const myCtx = context();
    const con = myCtx.__makeConsole__((stream, text) => { for (const t of text.split('\n')) mine.push({ stream, text: t }); });
    vm.runInContext(script, Object.assign(myCtx, { console: con }));
    const node: { stream: string; text: string }[] = [];
    const sink = (stream: string) => new Writable({
      write(chunk: Buffer, _e, done) { for (const text of chunk.toString().replace(/\n$/, '').split('\n')) node.push({ stream, text }); done(); },
    });
    const nodeCon = new Console({ stdout: sink('stdout'), stderr: sink('stderr'), colorMode: false, groupIndentation: 2 });
    asPlainNode(() => vm.runInNewContext(script, { console: nodeCon }));
    return { mine, node };
  }

  const SCRIPTS: Record<string, string> = {
    'log, info, debug, warn, error, dirxml': 'console.log("a", 1); console.info({ i: 1 }); console.debug([2]); console.warn("w %s", "x"); console.error(new Error("e").message); console.dirxml("d");',
    'group, groupCollapsed, groupEnd': 'console.group("g1"); console.log("in"); console.group(); console.log({ multi: "line object that is long enough", to: ["wrap", "across", "several", "lines", "here"] }); console.log(); console.groupEnd(); console.groupEnd(); console.groupEnd(); console.groupCollapsed("c"); console.log("x"); console.groupEnd(); console.log("out");',
    'count, countReset': 'console.count(); console.count(); console.count("x"); console.countReset("x"); console.count("x"); console.count(5);',
    'assert': 'console.assert(true, "no"); console.assert(false); console.assert(false, "failed %s", "here"); console.assert(0, { a: 1 }); console.assert(false, 42, "more");',
    'table': [
      'console.table([{ name: "Ann", grade: 91, passed: true }, { name: "Bob", grade: 58 }]);',
      'console.table({ madison: { pop: 270000, state: "WI" }, austin: { pop: 960000 } });',
      'console.table([2, 3, 5]); console.table([[1, 2], [3, 4, 5]]); console.table([{ a: 1, b: 2 }], ["a"]);',
      'console.table("not tabular"); console.table([]); console.table(new Map([["k", { v: 1 }]])); console.table(new Set(["s", 2]));',
      'console.table([{ nested: { a: 1, b: 2, c: 3 } }, { nested: [1, 2, 3, 4, 5] }, "prim"]);',
    ].join('\n'),
    'dir': 'console.dir({ a: { b: { c: { d: 1 } } } }); console.dir({ a: { b: { c: { d: 1 } } } }, { depth: 0 }); console.dir("str");',
    'trace (frames aside)': 'console.trace("here %d", 1); console.trace();',
  };
  for (const [name, script] of Object.entries(SCRIPTS)) {
    it(name, () => {
      const { mine, node } = run(script);
      const nodeLines = node.map(l => l.text);
      const kept = withoutStackFrames(nodeLines);
      expect(mine.map(l => l.text)).toEqual(kept);
      // streams line up with the kept lines
      const streams = node.filter((_, i) => !/^\s+at /.test(nodeLines[i])).map(l => l.stream);
      expect(mine.map(l => l.stream)).toEqual(streams);
    });
  }
});
