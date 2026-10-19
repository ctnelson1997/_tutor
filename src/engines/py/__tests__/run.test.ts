/**
 * loadTracer and runProgram (run.ts): what the worker does with a 'run'
 * request, against a fake Pyodide that records the Python it is given. The
 * CPython suite runs them in a real one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTERNAL_ERROR, TIMEOUT_REPLY, WORKER_TIMEOUT, loadTracer, runProgram, type PyodideApi } from '../run';

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
