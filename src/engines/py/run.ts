/**
 * Running a program through the tracer in a loaded Pyodide: what the worker
 * does with a 'run' request. The CPython differential suite (#29) calls it
 * with a Pyodide loaded in Node, so the suite runs exactly what the browser
 * runs.
 */
import type { WorkerMessage } from '../../types/snapshot';

/** The Pyodide release the worker loads from the CDN, and the suite's goldens come from (CPython 3.12). */
export const PYODIDE_VERSION = '0.27.5';

/** The executor kills a run that hasn't replied after this long (every step is lost). */
export const WORKER_TIMEOUT = 10_000;

/** What the executor replies when it kills a run at WORKER_TIMEOUT. */
export const TIMEOUT_REPLY: WorkerMessage = {
  type: 'error',
  message: `Execution timed out after ${WORKER_TIMEOUT / 1000} seconds. Your code may contain an infinite loop.`,
};

/** The part of Pyodide's API a run uses. */
export interface PyodideApi {
  runPython(code: string): unknown;
}

/** The Pyodides the tracer's definitions are loaded in (once each). */
const withTracer = new WeakSet<object>();

export interface RunOptions {
  /**
   * How long the tracer lets a program run before stopping it with its steps
   * (8.5 s by default, before the worker's kill). The CPython suite turns it
   * off and judges the run's CPU time instead, so its results don't depend on
   * the machine's load.
   */
  timeBudgetSeconds?: number;
  /**
   * How many values the tracer may serialize before stopping the run as out of
   * time (unlimited by default): the CPython suite's stand-in for the time
   * budget, the same on every machine.
   */
  workBudget?: number;
}

/** Run a program through the tracer (`tracerCode`, from getTracerCode()) and return the worker's reply. */
export function runProgram(pyodide: PyodideApi, tracerCode: string, source: string, options: RunOptions = {}): WorkerMessage {
  try {
    if (!withTracer.has(pyodide)) {
      pyodide.runPython(tracerCode);
      withTracer.add(pyodide);
    }
    if (options.timeBudgetSeconds !== undefined) {
      const budget = options.timeBudgetSeconds;
      pyodide.runPython(`_TIME_BUDGET = ${Number.isFinite(budget) ? budget : "float('inf')"}`);
    }
    if (options.workBudget !== undefined) pyodide.runPython(`_WORK_BUDGET = ${options.workBudget}`);

    // Run traced execution — pass user source as a Python string
    const escapedSource = source
      .replace(/\\/g, '\\\\')
      .replace(/"""/g, '\\"\\"\\"');
    const result = pyodide.runPython(`run_traced("""${escapedSource}""")`) as string;

    // result is a JSON string from Python
    return JSON.parse(result) as WorkerMessage;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Try to extract line number from Python traceback
    let line: number | undefined;
    const lineMatch = message.match(/File "<(?:exec|user_code)>", line (\d+)/);
    if (lineMatch) {
      line = parseInt(lineMatch[1], 10);
    }
    return { type: 'error', message, line };
  }
}
