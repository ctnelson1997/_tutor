/**
 * Unit tests for the Node differential harness itself (#42): canonical values,
 * each check against snapshots built to break it, known-failures validation,
 * the Node worker standing in for a Web Worker, and the golden recorder.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { executeInWorker } from '../../executor';
import type { ExecutionSnapshot, HeapObject, RuntimeValue, WorkerMessage } from '../../../../types/snapshot';
import { canon, diffCanon, shownCanon } from './canon';
import type { NodeCase, NodeGolden } from './corpus';
import { capExpected, checkCase, coverageIsExact, shownConsole, uncaughtText, validateKnownFailures } from './harness';
import { nodeWorker } from './nodeWorker';
import { stepStatements, topLevelNames } from './record';

// ── Builders ──

function golden(over: Partial<NodeGolden> = {}): NodeGolden {
  return {
    console: [], calls: [], uncaught: [], endless: false, pendingTimers: false, compileError: null,
    executedLines: [], statementRuns: 1, functionCalls: 0, finalGlobals: {}, sourceSha256: '', ...over,
  };
}

function nodeCase(source: string, category = 'core'): NodeCase {
  return { id: `${category}/t`, category, name: 't', source, origin: '', goldenPath: '' };
}

const num = (value: number, display?: string): RuntimeValue => ({ type: 'number', value, ...(display ? { display } : {}) });
const str = (value: string): RuntimeValue => ({ type: 'string', value });
const ref = (heapId: string): RuntimeValue => ({ type: 'ref', heapId });

function snap(over: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  return { step: 0, line: 1, callStack: [{ name: 'Global', variables: [] }], heap: [], stdout: [], ...over };
}

function result(snapshots: ExecutionSnapshot[], error?: Extract<WorkerMessage, { type: 'result' }>['error']): WorkerMessage {
  return { type: 'result', snapshots, ...(error ? { error } : {}) };
}

// ── canon ──

describe('canon', () => {
  it('tags primitives, keeping -0, NaN, Infinity, BigInt and Symbols apart', () => {
    expect([-0, 0, NaN, Infinity, -Infinity, 'hi', true, 10n, Symbol('id'), null, undefined].map(v => canon(v))).toEqual([
      'num:-0', 'num:0', 'num:NaN', 'num:Infinity', 'num:-Infinity', 'str:hi', 'boolean:true', 'bigint:10', 'sym:id', 'null', 'undefined',
    ]);
  });

  it('marks holes, and reads Map, Set, errors, dates and regexps by kind', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(canon([1, , 3])).toEqual({ array: ['num:1', '<hole>', 'num:3'], len: 3 });
    expect(canon(new Map([[{ id: 1 }, new Set(['a'])]]))).toEqual({ map: [[{ object: '', props: { id: 'num:1' } }, { set: ['str:a'] }]] });
    expect(canon(new TypeError('bad'))).toEqual({ error: 'TypeError: bad' });
    expect(canon(new Date(5))).toEqual({ date: '5' });
    expect(canon(/a+/g)).toEqual({ regexp: '/a+/g' });
  });

  it("names an object's class as obj.constructor.name does, and keeps Symbol keys", () => {
    class Point { x = 1; [Symbol('tag')] = 2; }
    expect(canon(new Point())).toEqual({ object: 'Point', props: { x: 'num:1', '[Symbol(tag)]': 'num:2' } });
    expect(canon(Object.create(null))).toEqual({ object: '', props: {} });
    function* gen() { yield 1; }
    expect(canon(gen())).toEqual({ object: '', props: {} });
    expect(canon('ab'.matchAll(/a/g))).toEqual({ object: 'Iterator', props: {} });
  });

  it('never calls a getter, and marks cycles', () => {
    let reads = 0;
    const o: Record<string, unknown> = { get count() { reads++; return reads; }, set only(_v: unknown) {} };
    o.self = o;
    expect(canon(o)).toEqual({ object: '', props: { count: '<getter>', only: '<setter>', self: '<circular>' } });
    expect(reads).toBe(0);
  });

  it('reads values from another realm (a vm context) as their own', () => {
    const v = vm.runInNewContext('class Car { constructor() { this.tags = new Set([1]); } }; [new Car(), new Map([[1, NaN]])]');
    expect(canon(v)).toEqual({ array: [{ object: 'Car', props: { tags: { set: ['num:1'] } } }, { map: [['num:1', 'num:NaN']] }], len: 2 });
  });
});

// ── shownCanon / diffCanon ──

describe('shownCanon and diffCanon', () => {
  const heap: HeapObject[] = [
    { id: '1', objectType: 'array', properties: [{ key: '0', value: num(1) }, { key: '1', value: { type: 'null', value: null } }] },
    { id: '2', objectType: 'map', properties: [{ key: '[object Object]', value: str('v') }, { key: '42', value: str('n') }] },
    { id: '3', objectType: 'class', label: 'Point', properties: [{ key: 'size', value: str('<getter>') }] },
    { id: '4', objectType: 'function', label: 'greet', properties: [] },
  ];

  it("uses a number's display text over its value", () => {
    expect(shownCanon({ type: 'number', value: null as unknown as number, display: 'NaN' }, [])).toBe('num:NaN');
    expect(shownCanon(num(0, '-0'), [])).toBe('num:-0');
  });

  it('reports values drawn as other values', () => {
    expect(diffCanon({ array: ['num:1', 'num:NaN'], len: 2 }, shownCanon(ref('1'), heap), 'xs')).toEqual(['xs[1]: "num:NaN" drawn as "null"']);
    expect(diffCanon({ array: ['num:1', '<hole>'], len: 2 }, shownCanon(ref('1'), heap), 'xs')).toEqual(['xs[1]: "<hole>" drawn as "null"']);
  });

  it("matches a Map's primitive key by its text, but not an object key drawn as text", () => {
    const want = { map: [[{ object: '', props: { id: 'num:1' } }, 'str:v'], ['num:42', 'str:n']] } as const;
    expect(diffCanon(want as never, shownCanon(ref('2'), heap), 'm')).toEqual([
      'm key 0: {"object":"","props":{"id":"num:1"}} drawn as "str:[object Object]"',
    ]);
  });

  it("accepts JSTutor's getter placeholder, compares functions by kind, and checks class names", () => {
    expect(diffCanon({ object: 'Point', props: { size: '<getter>' } }, shownCanon(ref('3'), heap), 'p')).toEqual([]);
    expect(diffCanon('fn:anything', shownCanon(ref('4'), heap), 'f')).toEqual([]);
    expect(diffCanon({ object: 'Circle', props: { r: 'num:1' } }, shownCanon(ref('3'), heap), 'p')).toEqual([
      'p: class Circle drawn as Point', 'p.r not drawn',
    ]);
  });
});

// ── The checks ──

describe('checks', () => {
  const ok = (r: ReturnType<typeof checkCase>) => Object.entries(r.checks).filter(([, p]) => p.length).map(([n]) => n);

  it('passes a run that matches Node', () => {
    const g = golden({ console: [{ stream: 'stdout', text: 'a b' }], executedLines: [1], finalGlobals: { x: 'num:1' } });
    const s = snap({ callStack: [{ name: 'Global', variables: [{ name: 'x', value: num(1) }] }], stdout: ['a b'] });
    const r = checkCase(nodeCase('let x = 1; console.log("a", "b");'), g, result([s]));
    expect(ok(r)).toEqual([]);
    expect(r.verdict).toBe('match');
  });

  it('reads the console from `console` when the program wrote to stderr, one entry per line', () => {
    const s = snap({ stdout: ['x'], console: [{ text: 'a\nb', stream: 'stdout' }, { text: 'c', stream: 'stderr' }] });
    expect(shownConsole(result([s]))).toEqual([{ stream: 'stdout', text: 'a' }, { stream: 'stdout', text: 'b' }, { stream: 'stderr', text: 'c' }]);
  });

  it('tells a difference in layout from a difference in values', () => {
    const g = golden({ console: [{ stream: 'stdout', text: "[ 1, 'a' ] { k: 1 }" }] });
    const layout = checkCase(nodeCase('x'), g, result([snap({ stdout: ['[1,"a"] {"k":1}'] })]));
    expect(layout.verdict).toBe('layout');
    expect(layout.checks.output.at(-1)).toBe('(the same values, laid out differently)');
    const lossy = checkCase(nodeCase('x'), golden({ console: [{ stream: 'stdout', text: 'Map(1) { 1 => 2 }' }] }), result([snap({ stdout: ['{}'] })]));
    expect(lossy.verdict).toBe('wrong-output');
  });

  it('compares the stream of each line', () => {
    const g = golden({ console: [{ stream: 'stderr', text: 'oops' }] });
    const r = checkCase(nodeCase('x'), g, result([snap({ stdout: ['[error] oops'] })]));
    expect(r.checks.output[0]).toBe('console line 1: Node "oops" (stderr) | JSTutor "[error] oops"');
  });

  it('compares a run stopped at the step cap only as far as it got, and expects the cap only for enough work', () => {
    const g = golden({ console: [{ stream: 'stdout', text: '1' }, { stream: 'stdout', text: '2' }], statementRuns: 9000 });
    const capped = result([snap({ stdout: ['1'] })], { kind: 'limit', message: 'Stopped' });
    expect(ok(checkCase(nodeCase('x'), g, capped))).toEqual([]);
    const small = golden({ ...g, statementRuns: 20 });
    expect(checkCase(nodeCase('x'), small, capped).verdict).toBe('error');
    expect(capExpected(golden({ endless: true, statementRuns: 3 }))).toBe(true);
  });

  it('expects an endless program to stop at the step cap, and an uncaught exception to be reported with its text', () => {
    const endless = checkCase(nodeCase('x'), golden({ endless: true }), result([snap()]));
    expect(endless.checks.ending[0]).toMatch(/^Node never finishes/);
    const thrown = golden({ uncaught: [{ name: 'TypeError', message: 'x is not a function', where: 'script', consoleLines: 0 }] });
    expect(ok(checkCase(nodeCase('x'), thrown, result([snap()], { kind: 'exception', message: 'TypeError: x is not a function' })))).toEqual([]);
    const lost = golden({ uncaught: [{ name: 'RangeError', message: 'bad', where: 'promise', consoleLines: 0 }] });
    const r = checkCase(nodeCase('x'), lost, result([snap()]));
    expect(r.checks.ending).toEqual(['Node: uncaught RangeError: bad (in a promise); JSTutor: no error']);
    expect(r.verdict).toBe('wrong-output');
    expect(uncaughtText({ name: null, message: 'oops' })).toBe('oops');
  });

  it("calls an error Node didn't have a failure", () => {
    const r = checkCase(nodeCase('x'), golden(), result([snap()], { kind: 'exception', message: 'ReferenceError: y is not defined' }));
    expect(r.checks.ending).toEqual(['Node ends normally; JSTutor ends with exception: ReferenceError: y is not defined']);
    expect(r.verdict).toBe('error');
  });

  it("expects a program that doesn't parse to be a compile error with V8's message and line, and no steps", () => {
    const g = golden({ compileError: { message: 'missing ) after argument list', line: 7, column: 30 } });
    const c = nodeCase('x', 'syntax-errors');
    expect(checkCase(c, g, { type: 'error', message: 'Parse error: Unexpected token (7:31)', line: 7 }).verdict).toBe('compile');
    const good = result([], { kind: 'compile', message: 'SyntaxError: missing ) after argument list', line: 7, lines: [7] });
    expect(checkCase(c, g, good).verdict).toBe('match');
  });

  it("finds lines that ran with no step, only where coverage can tell", () => {
    const g = golden({ executedLines: [1, 2, 3] });
    const r = checkCase(nodeCase('a\nb\nc'), g, result([snap({ line: 1 }), snap({ step: 1, line: 3 })]));
    expect(r.checks.coverage[0]).toBe('1 line(s) ran in Node with no step: 2');
    expect(coverageIsExact('try { f(); } catch (e) {}', golden())).toBe(false);
    expect(coverageIsExact('f();', golden({ uncaught: [{ name: 'E', message: '', where: 'script', consoleLines: 0 }] }))).toBe(false);
    expect(coverageIsExact('f();', golden())).toBe(true);
  });

  it('compares the final state as an exported file has it (after JSON)', () => {
    const g = golden({ finalGlobals: { bad: 'num:NaN', gone: 'num:1', later: '<uninitialized>' } });
    const s = snap({ callStack: [{ name: 'Global', variables: [{ name: 'bad', value: num(NaN) }] }] });
    expect(checkCase(nodeCase('x'), g, result([s])).checks['final-state']).toEqual([
      'bad: "num:NaN" drawn as "num:null"', "gone isn't shown in the Global frame",
    ]);
  });

  it('checks the invariants: refs, lines, names, reachable, frames', () => {
    const s = snap({
      line: 9,
      callStack: [
        { name: 'Global', variables: [{ name: 'a', value: ref('1') }, { name: '__loopCount', value: num(1) }] },
        { name: '__capture__', variables: [{ name: 'b', value: ref('7') }, { name: 'c', value: str('__pushFrame__("f")') }] },
      ],
      heap: [
        { id: '1', objectType: 'object', properties: [] },
        { id: '2', objectType: 'object', properties: [{ key: '__capture__(1)', value: num(1) }] },
      ],
      stdout: ['x'],
    });
    const r = checkCase(nodeCase('a b c'), golden({ console: [{ stream: 'stdout', text: 'x' }] }), result([s]));
    expect(r.checks.refs).toEqual(['step 0: __capture__.b refers to missing heap object 7']);
    expect(r.checks.lines).toEqual(["step 0: line 9 isn't a line of the program (1–1)"]);
    expect(r.checks.names).toEqual([
      "step 0: variable Global.__loopCount isn't the program's",
      'step 0: frame named __capture__',
      'step 0: __capture__.c shows instrumented code',
      "step 0: heap 2's key shows instrumented code",
    ]);
    expect(r.checks.reachable).toEqual(['step 0: heap object 2 (object) is drawn but unreachable']);
    expect(r.checks.frames).toEqual(['the run ended normally with frames left: Global > __capture__']);
    expect(r.verdict).toBe('wrong-state');
  });
});

describe('validateKnownFailures', () => {
  it('needs a real case, a real check, issues and a reason', () => {
    const problems = validateKnownFailures({
      'core/a': { output: { issues: [43], reason: 'ok' }, bogus: { issues: [1], reason: 'x' } } as never,
      'core/b': { frames: { issues: [], reason: '' } },
    }, new Set(['core/a']));
    expect(problems).toEqual([
      'core/a.bogus: not a check (output, ending, coverage, final-state, refs, lines, names, reachable, frames)',
      'core/b: no such case',
      'core/b.frames: needs "issues": [<issue number>, ...]',
      'core/b.frames: needs a "reason"',
    ]);
  });
});

// ── The Node worker ──

describe('nodeWorker', () => {
  const run = (code: string, timeoutMs?: number) => executeInWorker(code, nodeWorker, timeoutMs);

  it("gives the program a browser worker's global scope", async () => {
    const reply = await run(`self.__eventLoop__ = done => done(self.__runResult__());
    self.__runResult__ = () => ({ type: 'result', snapshots: [], probe: [
      self === globalThis, typeof setTimeout(() => {}, 0), structuredClone(new Set([1])) instanceof Set,
      typeof process, typeof require, typeof console.log, Object.keys(globalThis).includes('setTimeout'),
    ] });`);
    expect((reply as unknown as { probe: unknown[] }).probe).toEqual([true, 'number', true, 'undefined', 'undefined', 'function', false]);
  });

  it("posts the worker's error reply, and is killed at the timeout", async () => {
    expect(await run('throw new Error("no runtime")')).toEqual({ type: 'error', message: 'no runtime' });
    expect(await run('while (true) {}', 300)).toEqual({
      type: 'error', message: 'Execution timed out after 0.3 seconds. Your code may contain an infinite loop.',
    });
  });

  it('fires unhandledrejection, and sends an uncaught exception in a callback to onerror', async () => {
    const rejection = await run(`const post = self.postMessage; self.postMessage = () => {};
      addEventListener('unhandledrejection', e => post({ type: 'result', snapshots: [], reason: e.reason.message }));
      Promise.reject(new Error('boom'));
      self.__eventLoop__ = () => {};`);
    expect((rejection as unknown as { reason: string }).reason).toBe('boom');
    const late = await run(`self.__eventLoop__ = () => {}; setTimeout(() => { throw new TypeError('late'); }, 0);`);
    expect(late).toEqual({ type: 'error', message: 'Uncaught TypeError: late' });
  });
});

// ── The recorder ──

describe('golden recorder', () => {
  it('expects a step before each statement JSTutor steps at', () => {
    const lines = stepStatements('outer: for (let i = 0; i < 2; i++) {\n  try { f(); } finally {}\n}\ndo {\n  x++;\n} while (x < 3);\nfunction f() {}\n')
      .map(s => s.line);
    expect(lines).toEqual([1, 2, 6, 5]);
  });

  it('lists the top-level names, through destructuring', () => {
    expect(topLevelNames('var a; let { b, c: [d, ...e] } = o; const f = 1; function g() { let h; } class K {}')).toEqual(['a', 'b', 'd', 'e', 'f', 'g', 'K']);
  });

  it("records Node's console text, uncaught errors in callbacks and promises, the lines that ran and the final globals", () => {
    const dir = mkdtempSync(join(tmpdir(), 'js-golden-'));
    try {
      const file = join(dir, 'p.js');
      writeFileSync(file, [
        'let n = 0;',
        'console.log([1, , 3], new Map([[1, "a"]]));',
        'console.error("bad", -0);',
        'setTimeout(() => { n = 2; throw new TypeError("late"); }, 5);',
        'Promise.reject(new RangeError("nope"));',
        'if (n > 5) {',
        '  console.log("never");',
        '}',
      ].join('\n'));
      const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/js-golden.ts', '--record', file], { encoding: 'utf8' });
      const g = JSON.parse(r.stdout) as NodeGolden;
      expect(g.console).toEqual([
        { stream: 'stdout', text: "[ 1, <1 empty item>, 3 ] Map(1) { 1 => 'a' }" },
        { stream: 'stderr', text: 'bad -0' },
      ]);
      expect(g.uncaught).toEqual([
        { name: 'RangeError', message: 'nope', where: 'promise', consoleLines: 2 },
        { name: 'TypeError', message: 'late', where: 'timer', consoleLines: 2 },
      ]);
      expect(g.executedLines).toEqual([1, 2, 3, 4, 5, 6]);
      expect(g.finalGlobals).toEqual({ n: 'num:2' });
      writeFileSync(file, 'let a = 1;\nconsole.log("x", a;\n');
      const bad = JSON.parse(spawnSync(process.execPath, ['--import', 'tsx', 'scripts/js-golden.ts', '--record', file], { encoding: 'utf8' }).stdout) as NodeGolden;
      expect(bad.compileError).toEqual({ message: 'missing ) after argument list', line: 2, column: 17 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
