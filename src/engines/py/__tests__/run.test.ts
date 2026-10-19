/**
 * runProgram (run.ts): what the worker does with a 'run' request, against a
 * fake Pyodide that records the Python it is given. The CPython suite runs it
 * in a real one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTERNAL_ERROR, TIMEOUT_REPLY, WORKER_TIMEOUT, runProgram, type PyodideApi } from '../run';

const OK = JSON.stringify({ type: 'result', snapshots: [] });

function fakePyodide(runTraced: (source: string) => unknown = () => OK) {
  const ran: string[] = [];
  const sources: string[] = [];
  let destroyed = 0;
  const py: PyodideApi = {
    runPython(code: string) {
      ran.push(code);
      return undefined;
    },
    globals: {
      get(name: string) {
        if (name !== 'run_traced') return undefined;
        return Object.assign((source: string) => { sources.push(source); return runTraced(source); }, { destroy: () => { destroyed++; } });
      },
    },
  };
  return { py, ran, sources, destroyed: () => destroyed };
}

afterEach(() => vi.restoreAllMocks());

describe('runProgram', () => {
  it('loads the tracer once per interpreter, then runs each program', () => {
    const { py, ran, sources, destroyed } = fakePyodide();
    expect(runProgram(py, 'TRACER', 'x = 1')).toEqual({ type: 'result', snapshots: [] });
    runProgram(py, 'TRACER', 'y = 2');
    expect(ran.filter(c => c === 'TRACER')).toHaveLength(1);
    expect(sources).toEqual(['x = 1', 'y = 2']);
    expect(destroyed()).toBe(2);
  });

  it('passes the source as data, so any last character works (#30)', () => {
    const { py, ran, sources } = fakePyodide();
    const tricky = ['name = "Ada"', '# C:\\', 'doc = """x"""', "t = '''x'''", 'a = "\\\\"\nb = """\\"""" + \'"\''];
    for (const source of tricky) runProgram(py, 'TRACER', source);
    expect(sources).toEqual(tricky);
    // The source never becomes Python code.
    expect(ran.some(code => tricky.some(t => code.includes(t)))).toBe(false);
  });

  it("reports PyTutor's own failure as an internal error, with the details only in the console (#30)", () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { py } = fakePyodide(() => {
      throw new Error('Traceback (most recent call last):\n  File "/lib/python312.zip/_pyodide/_base.py", line 513, in eval_code\n  File "<exec>", line 7, in run_traced\nIndexError');
    });
    const reply = runProgram(py, 'TRACER', 'z');
    expect(reply).toEqual({ type: 'error', message: INTERNAL_ERROR });
    expect(JSON.stringify(reply)).not.toMatch(/_pyodide|<exec>|run_traced/);
    expect(String(error.mock.calls[0]?.[1])).toContain('IndexError');
  });

  it('sets the time and work budgets when asked (the CPython suite trades one for the other)', () => {
    const { py, ran } = fakePyodide();
    runProgram(py, 'TRACER', 'x = 1', { timeBudgetSeconds: Infinity, workBudget: 500 });
    runProgram(py, 'TRACER', 'x = 1', { timeBudgetSeconds: 2 });
    expect(ran).toContain("_TIME_BUDGET = float('inf')");
    expect(ran).toContain('_WORK_BUDGET = 500');
    expect(ran).toContain('_TIME_BUDGET = 2');
  });

  it("names the worker's timeout in its reply", () => {
    expect(TIMEOUT_REPLY).toEqual({ type: 'error', message: `Execution timed out after ${WORKER_TIMEOUT / 1000} seconds. Your code may contain an infinite loop.` });
  });
});
