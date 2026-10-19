/**
 * loadTracer and runProgram (run.ts): what the worker does with a 'run'
 * request, against a fake Pyodide that records the Python it is given. The
 * CPython suite runs them in a real one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTERNAL_ERROR, TIMEOUT_REPLY, WORKER_TIMEOUT, decodeReply, loadTracer, runProgram, type PyodideApi } from '../run';

const OK = JSON.stringify({ type: 'result', snapshots: [] });

function fakePyodide(runTraced: (source: string, stdin: string) => unknown = () => OK) {
  const ran: string[] = [];
  const sources: string[] = [];
  const stdins: string[] = [];
  let destroyed = 0;
  const py: PyodideApi = {
    runPython(code: string) {
      ran.push(code);
      return undefined;
    },
    globals: {
      get(name: string) {
        if (name !== 'run_traced') return undefined;
        return Object.assign((source: string, stdin: string) => { sources.push(source); stdins.push(stdin); return runTraced(source, stdin); }, { destroy: () => { destroyed++; } });
      },
    },
  };
  return { py, ran, sources, stdins, destroyed: () => destroyed };
}

afterEach(() => vi.restoreAllMocks());

describe('loadTracer and runProgram', () => {
  it('loads the tracer once per interpreter, then runs each program', () => {
    const { py, ran, sources, destroyed } = fakePyodide();
    loadTracer(py, 'TRACER');
    loadTracer(py, 'TRACER');
    expect(runProgram(py, 'x = 1')).toEqual({ type: 'result', snapshots: [] });
    runProgram(py, 'y = 2');
    expect(ran.filter(c => c === 'TRACER')).toHaveLength(1);
    expect(sources).toEqual(['x = 1', 'y = 2']);
    expect(destroyed()).toBe(2);
  });

  it('takes an interpreter restored from a snapshot as having the tracer already', () => {
    const { py, ran } = fakePyodide();
    loadTracer(py, null);
    expect(runProgram(py, 'x = 1').type).toBe('result');
    expect(ran).toEqual([]);
  });

  it('refuses an interpreter without the tracer, as an internal error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { py } = fakePyodide();
    expect(runProgram(py, 'x = 1')).toEqual({ type: 'error', message: INTERNAL_ERROR });
  });

  it('passes the source as data, so any last character works (#30)', () => {
    const { py, ran, sources } = fakePyodide();
    loadTracer(py, 'TRACER');
    const tricky = ['name = "Ada"', '# C:\\', 'doc = """x"""', "t = '''x'''", 'a = "\\\\"\nb = """\\"""" + \'"\''];
    for (const source of tricky) runProgram(py, source);
    expect(sources).toEqual(tricky);
    // The source never becomes Python code.
    expect(ran.some(code => tricky.some(t => code.includes(t)))).toBe(false);
  });

  it("passes the stdin panel's text to run_traced, empty when there is none (#32)", () => {
    const { py, stdins } = fakePyodide();
    loadTracer(py, 'TRACER');
    runProgram(py, 'x = input()', { stdin: 'Ada' });
    runProgram(py, 'x = 1');
    expect(stdins).toEqual(['Ada', '']);
  });

  it("reports PyTutor's own failure as an internal error, with the details only in the console (#30)", () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { py } = fakePyodide(() => {
      throw new Error('Traceback (most recent call last):\n  File "/lib/python312.zip/_pyodide/_base.py", line 513, in eval_code\n  File "<exec>", line 7, in run_traced\nIndexError');
    });
    loadTracer(py, 'TRACER');
    const reply = runProgram(py, 'z');
    expect(reply).toEqual({ type: 'error', message: INTERNAL_ERROR });
    expect(JSON.stringify(reply)).not.toMatch(/_pyodide|<exec>|run_traced/);
    expect(String(error.mock.calls[0]?.[1])).toContain('IndexError');
  });

  it('sets the time and work budgets when asked (the CPython suite trades one for the other)', () => {
    const { py, ran } = fakePyodide();
    loadTracer(py, 'TRACER');
    runProgram(py, 'x = 1', { timeBudgetSeconds: Infinity, workBudget: 500 });
    runProgram(py, 'x = 1', { timeBudgetSeconds: 2 });
    expect(ran).toContain("_TIME_BUDGET = float('inf')");
    expect(ran).toContain('_WORK_BUDGET = 500');
    expect(ran).toContain('_TIME_BUDGET = 2');
  });

  it("names the worker's timeout in its reply", () => {
    expect(TIMEOUT_REPLY).toEqual({ type: 'error', message: `Execution timed out after ${WORKER_TIMEOUT / 1000} seconds. Your code may contain an infinite loop.` });
  });
});

describe('decodeReply (#39)', () => {
  // Parts: 0 x = 1, 1 the module frame, 2 x = 2, 3 the module frame again, 4 a list, 5 its property,
  // 6 stdout ["a"], 7 stdout ["a", "b"] from 6, 8 a console line, 9 the console from nothing.
  const parts = [
    { name: 'x', value: { type: 'number', value: 1 } },
    { name: '<module>', variables: [0] },
    { name: 'x', value: { type: 'number', value: 2 } },
    { name: '<module>', variables: [2] },
    { id: '1', objectType: 'list', properties: [5] },
    { key: '0', value: { type: 'number', value: 7 } },
    { add: ['a'] },
    { base: 6, keep: 1, add: ['b'] },
    { text: 'oops', stream: 'stderr' },
    { add: [8] },
  ];
  const reply = decodeReply(JSON.stringify({
    type: 'result',
    parts,
    snapshots: [
      { step: 0, line: 1, callStack: [1], heap: [4], stdout: 6 },
      { step: 1, line: 2, callStack: [1], heap: [4], stdout: 7, columnRange: { startCol: 0, endCol: 3 } },
      { step: 2, line: 3, callStack: [3], heap: [4], stdout: 7, console: 9 },
    ],
    error: { kind: 'exception', message: 'ValueError: oops' },
  }));

  it('rebuilds each step from the parts it refers to', () => {
    expect(reply).toEqual({
      type: 'result',
      snapshots: [
        { step: 0, line: 1, callStack: [{ name: '<module>', variables: [parts[0]] }], heap: [{ id: '1', objectType: 'list', properties: [parts[5]] }], stdout: ['a'] },
        { step: 1, line: 2, callStack: [{ name: '<module>', variables: [parts[0]] }], heap: [{ id: '1', objectType: 'list', properties: [parts[5]] }], stdout: ['a', 'b'], columnRange: { startCol: 0, endCol: 3 } },
        { step: 2, line: 3, callStack: [{ name: '<module>', variables: [parts[2]] }], heap: [{ id: '1', objectType: 'list', properties: [parts[5]] }], stdout: ['a', 'b'], console: [{ text: 'oops', stream: 'stderr' }] },
      ],
      error: { kind: 'exception', message: 'ValueError: oops' },
    });
    expect('console' in (reply.type === 'result' ? reply.snapshots[0] : {})).toBe(false);
  });

  it('makes each part one object, shared by every step that shows it', () => {
    if (reply.type !== 'result') throw new Error('not a result');
    const [a, b, c] = reply.snapshots;
    expect(b.callStack[0]).toBe(a.callStack[0]);
    expect(c.callStack[0]).not.toBe(a.callStack[0]);
    expect(c.heap[0]).toBe(a.heap[0]);
    expect(c.stdout).toBe(b.stdout);
    expect(b.stdout).not.toBe(a.stdout);
  });

  it('builds a long chain of output lists without recursion', () => {
    const chain: unknown[] = [{ add: ['0'] }];
    for (let i = 1; i < 20_000; i++) chain.push({ base: i - 1, keep: i, add: [String(i)] });
    const long = decodeReply(JSON.stringify({ type: 'result', parts: chain, snapshots: [{ step: 0, line: 1, callStack: [], heap: [], stdout: 19_999 }] }));
    if (long.type !== 'result') throw new Error('not a result');
    expect(long.snapshots[0].stdout).toHaveLength(20_000);
    expect(long.snapshots[0].stdout.at(-1)).toBe('19999');
  });

  it('passes an error reply, and a result without parts, through as they are', () => {
    expect(decodeReply(JSON.stringify({ type: 'error', message: 'SyntaxError: invalid syntax', line: 2 }))).toEqual({ type: 'error', message: 'SyntaxError: invalid syntax', line: 2 });
    expect(decodeReply(OK)).toEqual({ type: 'result', snapshots: [] });
  });
});
