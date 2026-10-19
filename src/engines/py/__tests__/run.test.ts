/**
 * runProgram (run.ts): what the worker does with a 'run' request, against a
 * fake Pyodide that records the Python it is given. The CPython suite runs it
 * in a real one.
 */
import { describe, expect, it } from 'vitest';
import { TIMEOUT_REPLY, WORKER_TIMEOUT, runProgram, type PyodideApi } from '../run';

function fakePyodide(reply: (code: string) => unknown = () => JSON.stringify({ type: 'result', snapshots: [] })) {
  const ran: string[] = [];
  const py: PyodideApi = {
    runPython(code: string) {
      ran.push(code);
      return code.startsWith('run_traced(') ? reply(code) : undefined;
    },
  };
  return { py, ran };
}

describe('runProgram', () => {
  it('loads the tracer once per interpreter, then runs each program', () => {
    const { py, ran } = fakePyodide();
    expect(runProgram(py, 'TRACER', 'x = 1')).toEqual({ type: 'result', snapshots: [] });
    runProgram(py, 'TRACER', 'y = 2');
    expect(ran.filter(c => c === 'TRACER')).toHaveLength(1);
    expect(ran.filter(c => c.startsWith('run_traced('))).toHaveLength(2);
  });

  it('turns an exception from Pyodide into an error reply with its line', () => {
    const { py } = fakePyodide(() => { throw new Error('Traceback (most recent call last):\n  File "<exec>", line 7, in <module>\nNameError'); });
    expect(runProgram(py, 'TRACER', 'z')).toEqual({ type: 'error', message: expect.stringContaining('NameError'), line: 7 });
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
