/**
 * Unit tests for the CPython differential suite's own machinery (#29): the
 * recorder's console lines and its reference trace, value comparison, each
 * check against runs built to break it, the verdicts, the corpus format and
 * known-failures validation.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { ExecutionSnapshot, RunError, RuntimeValue, StackFrame, WorkerMessage } from '../../../../types/snapshot';
import { caseHash, consoleLines, expandStack, formatGolden, loadCases, type GoldenEvent, type PyCase, type PyGolden } from './corpus';
import {
  INTERNAL_TEXT,
  RunnerPool,
  capExpected,
  checkCase,
  compareValue,
  exceptionText,
  unrepr,
  validateKnownFailures,
  withoutCarets,
  withoutInput,
  type RunOutcome,
} from './harness';
import { record, recordGolden } from './record';

// ── Builders ──

const num = (value: number): RuntimeValue => ({ type: 'number', value });
const str = (value: string): RuntimeValue => ({ type: 'string', value });
const ref = (heapId: string): RuntimeValue => ({ type: 'ref', heapId });

function frame(name: string, vars: Record<string, RuntimeValue> = {}): StackFrame {
  return { name, variables: Object.entries(vars).map(([n, value]) => ({ name: n, value })) };
}

function snap(step: number, line: number, stack: StackFrame[], stdout: string[] = [], heap: ExecutionSnapshot['heap'] = []): ExecutionSnapshot {
  return { step, line, callStack: stack, heap, stdout };
}

/** A golden; its console is its stdout's lines unless given. */
function golden(over: Partial<PyGolden> = {}): PyGolden {
  const stdout = over.stdout ?? '';
  const console = over.console ?? consoleLines([{ stream: 'stdout', text: stdout }]);
  return {
    stdout, stderr: '', console, exception: null, traceback: null, compileError: null, endless: false,
    events: [], truncated: false, stepEvents: 0, finalGlobals: {}, continuation: [], sourceSha256: '', ...over,
  };
}

function ev(event: GoldenEvent['event'], line: number, stack: string[], locals: Record<string, string> = {}, extra: Partial<GoldenEvent> = {}): GoldenEvent {
  return { event, line, stack, locals, ...extra };
}

function pyCase(source: string, category = 'core'): PyCase {
  return { id: `${category}/t`, category, name: 't', source, stdin: null, origin: 't.py', goldenPath: 't.golden.json' };
}

function outcome(reply: WorkerMessage, over: Partial<RunOutcome> = {}): RunOutcome {
  return { reply, cpuMs: 10, killed: false, lostStdout: '', lostStderr: '', ...over };
}

const result = (snapshots: ExecutionSnapshot[], error?: RunError): WorkerMessage => ({ type: 'result', snapshots, ...(error ? { error } : {}) });

// ── The recorder ──

describe('consoleLines', () => {
  it('gives each line to the stream that wrote its first characters', () => {
    expect(consoleLines([
      { stream: 'stdout', text: 'a\n' },
      { stream: 'stderr', text: 'warn\n' },
      { stream: 'stdout', text: 'partial ' },
      { stream: 'stderr', text: 'ERR\n' },
      { stream: 'stdout', text: 'end' },
    ])).toEqual([
      { stream: 'stdout', text: 'a' },
      { stream: 'stderr', text: 'warn' },
      { stream: 'stdout', text: 'partial ERR' },
      { stream: 'stdout', text: 'end' },
    ]);
  });

  it('keeps empty lines, and a write that is only a newline', () => {
    expect(consoleLines([{ stream: 'stdout', text: '\n\nx\n' }, { stream: 'stderr', text: '\n' }])).toEqual([
      { stream: 'stdout', text: '' },
      { stream: 'stdout', text: '' },
      { stream: 'stdout', text: 'x' },
      { stream: 'stderr', text: '' },
    ]);
  });
});

describe('the reference recorder (Pyodide)', () => {
  it('records the console in program order, the trace with reprs, and the final globals', async () => {
    const src = 'import sys\nx = 5.0\nprint("out", end="")\nsys.stderr.write("err\\n")\ndef f(n):\n    return n * 2\ny = f(21)\nbig = 10 ** 5000\n';
    const g = await record(src, null);
    expect(g.console).toEqual([{ stream: 'stdout', text: 'outerr' }]);
    expect(g.stdout).toBe('out');
    expect(g.stderr).toBe('err\n');
    const ret = g.events.find(e => e.event === 'return' && e.stack.join('>') === '<module>>f');
    expect(ret).toMatchObject({ line: 6, value: '42', locals: { n: '21' } });
    expect(g.finalGlobals).toMatchObject({ x: '5.0', y: '42', sys: '<module>', f: '<function>', big: '<int with 5001 digits>' });
  }, 30_000);

  it('reads input from stdin, writing the prompt to stdout', async () => {
    const g = await record('name = input("Name: ")\nprint("hi", name)\ninput()\n', 'Ada\n');
    expect(g.stdout).toBe('Name: hi Ada\n');
    expect(g.exception).toEqual({ class: 'EOFError', message: 'EOF when reading a line' });
  }, 30_000);

  it('fails at the same recursion depth traced as untraced, and the trace stays on afterwards', async () => {
    // (Events record the deep stacks as runs: <module>, down*n.)
    const src = [
      'import sys',
      'sys.setrecursionlimit(80)',
      'deepest = 0',
      'def down(n):',
      '    global deepest',
      '    deepest = n',
      '    down(n + 1)',
      'try:',
      '    down(0)',
      'except RecursionError as e:',
      '    print(deepest, e, sys.getrecursionlimit())',
      'after = 1',
    ].join('\n');
    const traced = await record(src, null, true);
    const plain = await record(src, null, false);
    expect(traced.stdout).toBe(plain.stdout);
    expect(plain.stdout).toMatch(/^\d+ maximum recursion depth exceeded 80\n$/);
    expect(traced.events.some(e => e.line === 12)).toBe(true);
    expect(traced.events.some(e => /^down\*\d+$/.test(e.stack[1] ?? ''))).toBe(true);
  }, 30_000);

  it("doesn't change a class body with a comprehension (3.12's f_locals would warn)", async () => {
    const { golden: g, problem } = await recordGolden('class C:\n    xs = [v * 2 for v in range(3)]\nprint(C.xs)\n', null);
    expect(problem).toBeNull();
    expect(g.console).toEqual([{ stream: 'stdout', text: '[0, 2, 4]' }]);
    expect(g.events.some(e => '!unreadable' in e.locals)).toBe(true);
  }, 30_000);

  it('stops an endless program and says so', async () => {
    const g = await record('print("go")\nwhile True:\n    pass\n', null);
    expect(g.endless).toBe(true);
    expect(g.stdout).toBe('go\n');
  }, 30_000);

  it("records a SyntaxError as CPython prints it, and doesn't run anything", async () => {
    const g = await record('print(1)\nif x = 1:\n    pass\n', null);
    expect(g.compileError).toMatchObject({ class: 'SyntaxError', line: 2 });
    expect(g.compileError!.text).toContain('File "main.py", line 2');
    expect(g.stdout).toBe('');
  }, 30_000);
});

// ── Values ──

describe('value comparison', () => {
  it('reads str reprs', () => {
    expect(unrepr("'a\\nb'")).toBe('a\nb');
    expect(unrepr('"it\'s"')).toBe("it's");
    expect(unrepr("'\\x41\\u00e9'")).toBe('Aé');
    expect(unrepr('42')).toBeNull();
    expect(unrepr("b'x'")).toBeNull();
  });

  it('compares what a step shows with the reference repr', () => {
    expect(compareValue('5', num(5))).toBeNull();
    expect(compareValue('5.0', num(5))).toBe('5.0 shown as 5');
    expect(compareValue("'hi'", str('hi'))).toBeNull();
    expect(compareValue("'hi'", str('ho'))).toMatch(/shown as/);
    expect(compareValue('<list>', ref('3'))).toBeNull();
    expect(compareValue('<list>', num(1))).toMatch(/shown as/);
    expect(compareValue('None', { type: 'null', value: null })).toBeNull();
    expect(compareValue('True', { type: 'boolean', value: true })).toBeNull();
    expect(compareValue('inf', { type: 'number', value: 'Infinity' })).toBeNull();
    expect(compareValue("'long…", str('anything'))).toBeNull();
  });

  it('formats exceptions and drops traceback carets', () => {
    expect(exceptionText({ class: 'ValueError', message: 'bad' })).toBe('ValueError: bad');
    expect(exceptionText({ class: 'StopIteration', message: '' })).toBe('StopIteration');
    expect(withoutCarets('Traceback\n  File "main.py", line 1\n    x = 1 / 0\n        ~~^~~\nZeroDivisionError')).toBe('Traceback\n  File "main.py", line 1\n    x = 1 / 0\nZeroDivisionError');
  });

  it('expects the step cap only for long or endless programs', () => {
    expect(capExpected(golden({ endless: true }))).toBe(true);
    expect(capExpected(golden({ stepEvents: 4600 }))).toBe(true);
    expect(capExpected(golden({ stepEvents: 300 }))).toBe(false);
  });
});

// ── Checks ──

describe('checkCase', () => {
  const src = 'x = 1\ny = x + 1\nprint(y)\n';
  const c = pyCase(src);
  const events = [
    ev('call', 0, ['<module>']),
    ev('line', 1, ['<module>']),
    ev('line', 2, ['<module>'], { x: '1' }),
    ev('line', 3, ['<module>'], { x: '1', y: '2' }),
    ev('return', 3, ['<module>'], { x: '1', y: '2' }, { value: 'None' }),
  ];
  const g = golden({ stdout: '2\n', events, finalGlobals: { x: '1', y: '2' } });
  const good = [
    snap(0, 1, [frame('<module>')]),
    snap(1, 2, [frame('<module>', { x: num(1) })]),
    snap(2, 3, [frame('<module>', { x: num(1), y: num(2) })]),
    snap(3, 3, [frame('<module>', { x: num(1), y: num(2) })], ['2']),
  ];

  it('passes a run that is CPython', () => {
    const r = checkCase(c, g, outcome(result(good)));
    expect(Object.values(r.checks).flat()).toEqual([]);
    expect(r.verdict).toBe('match');
  });

  it('leaves the echoed input out, as CPython shows no echo', () => {
    expect(withoutInput([
      { stream: 'stdout', text: 'Name: Ada', input: [[6, 9], [9, 9]] },
      { stream: 'stdout', text: 'Hi Ada' },
      { stream: 'stdout', text: '> ', input: [[2, 2]] },
      { stream: 'stdout', text: '> q', input: [[2, 3], [3, 3]] },
      { stream: 'stdout', text: 'xy', input: [[0, 2]] },
      { stream: 'stdout', text: 'Age: 7', input: [[5, 6], [6, 6]] },
    ])).toEqual([
      { stream: 'stdout', text: 'Name: Hi Ada' },
      // 'xy' was read without a newline: the program's own newline after it ends the line.
      { stream: 'stdout', text: '> > ' },
      { stream: 'stdout', text: 'Age: ' },
    ]);
    expect(withoutInput([{ stream: 'stderr', text: 'e' }])).toEqual([{ stream: 'stderr', text: 'e' }]);
  });

  it('compares stderr lines too, in program order', () => {
    const withErr = golden({ ...g, console: [{ stream: 'stdout', text: '2' }, { stream: 'stderr', text: 'warn' }] });
    const asStdout = good.map((s, i) => (i === good.length - 1 ? { ...s, stdout: ['2', 'warn'] } : s));
    expect(checkCase(c, withErr, outcome(result(asStdout))).checks.output[0]).toMatch(/console line 2: CPython "warn" \(stderr\) \| PyTutor "warn"$/);
    const withConsole = good.map((s, i) => (i === good.length - 1 ? { ...s, console: [{ stream: 'stdout' as const, text: '2' }, { stream: 'stderr' as const, text: 'warn' }] } : s));
    expect(checkCase(c, withErr, outcome(result(withConsole))).checks.output).toEqual([]);
  });

  it('reports wrong output as wrong output', () => {
    const bad = good.map(s => ({ ...s, stdout: s.stdout.length ? ['3'] : [] }));
    const r = checkCase(c, g, outcome(result(bad)));
    expect(r.checks.output[0]).toMatch(/console line 1/);
    expect(r.verdict).toBe('wrong-output');
  });

  it('reports output Pyodide sent to the browser console', () => {
    const r = checkCase(c, g, outcome(result(good), { lostStdout: 'lost\n' }));
    expect(r.checks.output.join()).toMatch(/never shown/);
  });

  it('compares a run stopped at the step cap as far as it got', () => {
    const long = golden({ stdout: 'a\nb\nc\n', stepEvents: 9000, events });
    const capped = (n: number) => result(Array.from({ length: n }, (_, i) => snap(i, 1, [frame('<module>')], ['a', 'b'])), { kind: 'limit', message: 'Stopped' });
    expect(checkCase(c, long, outcome(capped(5000))).checks.output).toEqual([]);
    expect(checkCase(c, long, outcome(capped(5000))).checks.ending).toEqual([]);
    // Stopped before the cap (for time), or a program CPython runs in a few steps: not what CPython does.
    expect(checkCase(c, long, outcome(capped(3000))).checks.ending[0]).toMatch(/stopped after 3000 steps/);
    expect(checkCase(c, golden({ stdout: 'a\n', events }), outcome(capped(5000))).checks.ending[0]).toMatch(/stopped after 5000 steps/);
    expect(checkCase(c, golden({ endless: true }), outcome(capped(10))).checks.ending).toEqual([]);
  });

  it('tells each kind of wrong ending apart', () => {
    const raises = golden({ ...g, exception: { class: 'ValueError', message: 'bad' } });
    expect(checkCase(c, raises, outcome(result(good))).verdict).toBe('wrong-output');
    const r1 = checkCase(c, g, outcome(result(good, { kind: 'exception', message: 'TypeError: x' })));
    expect(r1.checks.ending[0]).toMatch(/ends normally/);
    expect(r1.verdict).toBe('error');
    const r2 = checkCase(c, raises, outcome(result(good, { kind: 'exception', message: 'ValueError: other' })));
    expect(r2.checks.ending[0]).toMatch(/ValueError: bad \| PyTutor/);
    expect(r2.verdict).toBe('wrong-state');
    const r3 = checkCase(c, g, outcome({ type: 'error', message: 'timed out' }, { killed: true, cpuMs: 60_000 }));
    expect(r3.checks.ending[0]).toMatch(/never finishes/);
    expect(r3.verdict).toBe('error');
    const r4 = checkCase(c, golden({ endless: true }), outcome(result(good)));
    expect(r4.checks.ending[0]).toMatch(/never finishes/);
  });

  it('checks a program CPython rejects: no steps, its message and line', () => {
    const sc = pyCase('if x = 1:\n    pass\n', 'syntax-errors');
    const sg = golden({ compileError: { class: 'SyntaxError', msg: 'invalid syntax', line: 1, offset: 4, text: '' } });
    expect(checkCase(sc, sg, outcome({ type: 'error', message: 'SyntaxError: invalid syntax', line: 1 })).verdict).toBe('match');
    const wrong = checkCase(sc, sg, outcome({ type: 'error', message: 'SyntaxError: invalid syntax', line: 2 }));
    expect(wrong.checks.ending[0]).toMatch(/line 1 \| PyTutor: line 2/);
    expect(wrong.verdict).toBe('compile');
  });

  it('compares tracebacks without their carets', () => {
    const raises = golden({ ...g, exception: { class: 'ZeroDivisionError', message: 'division by zero' }, traceback: 'Traceback (most recent call last):\n  File "main.py", line 2, in <module>\n    y = x / 0\n        ~~^~~\nZeroDivisionError: division by zero\n' });
    const err = (stderr: string): RunError => ({ kind: 'exception', message: 'ZeroDivisionError: division by zero', stderr });
    expect(checkCase(c, raises, outcome(result(good, err('Traceback (most recent call last):\n  File "main.py", line 2, in <module>\n    y = x / 0\nZeroDivisionError: division by zero')))).checks.traceback).toEqual([]);
    expect(checkCase(c, raises, outcome(result(good, err('ZeroDivisionError: division by zero')))).checks.traceback[0]).toMatch(/traceback line 1/);
  });

  it('finds steps CPython never took, and lines CPython ran without a step', () => {
    const extra = [good[0], snap(1, 3, [frame('<module>', { x: num(1) })]), ...good.slice(1)];
    expect(checkCase(c, g, outcome(result(extra))).checks.steps.join()).toMatch(/match no CPython event/);
    const skipping = [good[0], good[2], good[3]];
    expect(checkCase(c, g, outcome(result(skipping))).checks.steps.join()).toMatch(/have no step, lines 2/);
  });

  it("doesn't count a multi-line statement's inner lines, or a comprehension's own frame", () => {
    const g2 = golden({ ...g, continuation: [2] });
    expect(checkCase(c, g2, outcome(result([good[0], good[2], good[3]]))).checks.steps).toEqual([]);
    const withComp = [...good.slice(0, 2), snap(9, 2, [frame('<module>', { x: num(1) }), frame('list comprehension', { i: num(0) })]), ...good.slice(2)];
    expect(checkCase(c, g, outcome(result(withComp))).checks.steps).toEqual([]);
  });

  it('finds missing and extra variables, and wrong values', () => {
    const missing = good.map(s => (s.line === 3 ? { ...s, callStack: [frame('<module>', { x: num(1) })] } : s));
    expect(checkCase(c, g, outcome(result(missing))).checks.variables.join()).toMatch(/not shown: <module>\.y/);
    const extra = good.map(s => ({ ...s, callStack: [frame('<module>', { ...Object.fromEntries(s.callStack[0].variables.map(v => [v.name, v.value])), secret: num(0) })] }));
    expect(checkCase(c, g, outcome(result(extra))).checks.variables.join()).toMatch(/shown but not in CPython's frame: <module>\.secret/);
    const wrong = good.map(s => (s.line === 2 ? { ...s, callStack: [frame('<module>', { x: num(7) })] } : s));
    expect(checkCase(c, g, outcome(result(wrong))).checks.values.join()).toMatch(/<module>\.x: 1 shown as 7/);
  });

  it("skips a class body's bookkeeping, modules, and events the recorder couldn't read", () => {
    const g2 = golden({
      ...g,
      events: [ev('line', 1, ['<module>'], { __module__: "'__main__'", __qualname__: "'C'", json: '<module>' }), ev('line', 2, ['<module>'], { '!unreadable': 'x' }), ...events.slice(3)],
    });
    const r = checkCase(c, g2, outcome(result([snap(0, 1, [frame('<module>')]), snap(1, 2, [frame('<module>', { anything: num(1) })]), ...good.slice(2)])));
    expect(r.checks.variables).toEqual([]);
  });

  it('checks return values', () => {
    const fc = pyCase('def f():\n    return 5.0\nf()\n');
    const fg = golden({ events: [ev('line', 3, ['<module>']), ev('call', 1, ['<module>', 'f']), ev('line', 2, ['<module>', 'f']), ev('return', 2, ['<module>', 'f'], {}, { value: '5.0' })] });
    const steps = (ret: RuntimeValue | null) => [
      snap(0, 3, [frame('<module>', { f: ref('1') })], [], [{ id: '1', objectType: 'function', properties: [] }]),
      snap(1, 1, [frame('<module>', { f: ref('1') }), frame('f')], [], [{ id: '1', objectType: 'function', properties: [] }]),
      snap(2, 2, [frame('<module>', { f: ref('1') }), frame('f')], [], [{ id: '1', objectType: 'function', properties: [] }]),
      snap(3, 2, [frame('<module>', { f: ref('1') }), frame('f', ret ? { 'return ↵': ret } : {})], [], [{ id: '1', objectType: 'function', properties: [] }]),
    ];
    expect(checkCase(fc, fg, outcome(result(steps(num(5))))).checks.values.join()).toMatch(/f return: 5\.0 shown as 5/);
    expect(checkCase(fc, fg, outcome(result(steps(null)))).checks.values.join()).toMatch(/no return ↵/);
  });

  it("checks the final globals in the last step's module frame", () => {
    const r = checkCase(c, golden({ ...g, finalGlobals: { x: '1', y: '2', z: '3' } }), outcome(result(good)));
    expect(r.checks['final-state']).toEqual(["z isn't shown in the module frame"]);
  });

  it('checks the invariants', () => {
    const broken = [
      snap(0, 1, [frame('<module>', { x: ref('9') })]),
      snap(1, 99, [frame('<module>', { _tracer_state: num(1) })], [], [{ id: '4', objectType: 'list', properties: [] }]),
    ];
    const r = checkCase(c, g, outcome(result(broken)));
    expect(r.checks.refs.join()).toMatch(/missing heap object 9/);
    expect(r.checks.lines.join()).toMatch(/line 99 isn't a line/);
    expect(r.checks.names.join()).toMatch(/_tracer_state isn't the program's/);
    expect(r.checks.reachable.join()).toMatch(/heap object 4 \(list\) is drawn but unreachable/);
  });

  it("calls the engine's internals in a message an error", () => {
    expect(INTERNAL_TEXT.test('File "/lib/python312.zip/_pyodide/_base.py", line 513')).toBe(true);
    const r = checkCase(c, g, outcome({ type: 'error', message: 'Traceback (most recent call last):\n  File "<exec>", line 1, in run_traced' }));
    expect(r.checks.names.join()).toMatch(/engine's internals/);
    expect(r.verdict).toBe('error');
  });
});

// ── Corpus and known failures ──

describe('the corpus', () => {
  it('writes runs of frames in a stack as name*n', () => {
    expect(expandStack(['<module>', 'f*3', 'g'])).toEqual(['<module>', 'f', 'f', 'f', 'g']);
    expect(expandStack(['<lambda>'])).toEqual(['<lambda>']);
  });

  it('hashes the stdin with the source', () => {
    expect(caseHash('x', null)).not.toBe(caseHash('x', ''));
    expect(caseHash('x', 'a')).not.toBe(caseHash('x', 'b'));
  });

  it('writes goldens in a stable layout, one event per line', () => {
    const g = golden({ events: [ev('line', 1, ['<module>'], { a: "'$&'" })], sourceSha256: 'h' });
    const text = formatGolden(g);
    expect(JSON.parse(text)).toEqual(g);
    expect(text).toContain('\n  {"event":"line"');
    expect(formatGolden(JSON.parse(text) as PyGolden)).toBe(text);
  });

  it('reads stdin files and the shipped examples', () => {
    const cases = loadCases();
    expect(cases.some(c => c.stdin !== null)).toBe(true);
    expect(cases.some(c => c.id.startsWith('examples/'))).toBe(true);
    expect(cases.every(c => !c.source.includes('\r'))).toBe(true);
  });

  it('validates known failures', () => {
    const ids = new Set(['a/b']);
    expect(validateKnownFailures({ 'a/b': { output: { issues: [31], reason: 'x' } } }, ids)).toEqual([]);
    expect(validateKnownFailures({ 'a/c': { output: { issues: [31], reason: 'x' } } }, ids)).toEqual(['a/c: no such case']);
    expect(validateKnownFailures({ 'a/b': { nope: { issues: [31], reason: 'x' } } } as never, ids)[0]).toMatch(/not a check/);
    expect(validateKnownFailures({ 'a/b': { output: { issues: [], reason: '' } } }, ids)).toHaveLength(2);
  });
});

// ── The runner ──

describe('RunnerPool', () => {
  const pool = new RunnerPool(1);
  afterAll(() => pool.close());

  it('runs a program through the worker code in a fresh Pyodide, as the browser does', async () => {
    // os.write goes around sys.stdout, to Pyodide's own stdout: the browser's console.
    const first = await pool.run('import os\nx = 1\nos.write(1, b"direct\\n")\nprint(x)\n');
    expect(first.reply.type).toBe('result');
    expect(first.killed).toBe(false);
    expect(first.lostStdout).toBe('direct\n');
    // A fresh interpreter each run: nothing the first program did is left.
    const second = await pool.run('print("x" in dir())\n');
    expect(second.reply.type === 'result' && second.reply.snapshots.at(-1)!.stdout).toEqual(['False']);
  }, 60_000);

  it('feeds the stdin to input(), echoing it on the console (#32)', async () => {
    const r = await pool.run('n = input("n? ")\nprint(int(n) * 2)\ninput()\n', '21');
    expect(r.reply.type === 'result' && r.reply.snapshots.at(-1)!.console).toEqual([
      { text: 'n? 21', stream: 'stdout', input: [[3, 5], [5, 5]] },
      { text: '42', stream: 'stdout' },
    ]);
    expect(r.reply.type === 'result' && r.reply.error?.message).toBe('EOFError: EOF when reading a line');
  }, 60_000);
});
