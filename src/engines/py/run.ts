/**
 * Running a program through the tracer in a loaded Pyodide: what the worker
 * does with a 'run' request, in a fresh interpreter each time (session.ts).
 * The CPython differential suite (#29) calls it with a Pyodide loaded in Node,
 * so the suite runs exactly what the browser runs.
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

/** What a student sees when PyTutor itself fails: never Pyodide's traceback or the tracer's names. */
export const INTERNAL_ERROR = 'Internal PyTutor error (please report it)';

/** The part of Pyodide's API a run uses. */
export interface PyodideApi {
  runPython(code: string): unknown;
  globals: { get(name: string): unknown };
}

/** A Python function as Pyodide hands it to JavaScript. */
type PyCallable = ((...args: unknown[]) => unknown) & { destroy?: () => void };

/** The Pyodides the tracer's definitions are loaded in. */
const withTracer = new WeakSet<object>();

/**
 * Load the tracer's definitions (`tracerCode`, from getTracerCode()) into an
 * interpreter, once; null when it already has them (restored from a snapshot
 * taken after they were loaded).
 */
export function loadTracer(pyodide: PyodideApi, tracerCode: string | null): void {
  if (withTracer.has(pyodide)) return;
  if (tracerCode !== null) pyodide.runPython(tracerCode);
  withTracer.add(pyodide);
}

export interface RunOptions {
  /** What input() and sys.stdin read: the text of the stdin panel (#32). */
  stdin?: string;
  /**
   * How long the tracer lets a program run before stopping it with its steps
   * (8.5 s by default, before the worker's kill). The CPython suite turns it
   * off for a work budget, so its results don't depend on the machine's load.
   */
  timeBudgetSeconds?: number;
  /**
   * How many values the tracer may serialize before stopping the run as out of
   * time (unlimited by default): the CPython suite's stand-in for the time
   * budget, the same on every machine.
   */
  workBudget?: number;
}

/** Run a program through the tracer (loaded with loadTracer) and return the worker's reply. */
export function runProgram(pyodide: PyodideApi, source: string, options: RunOptions = {}): WorkerMessage {
  try {
    if (!withTracer.has(pyodide)) throw new Error('the tracer is not loaded in this interpreter');
    if (options.timeBudgetSeconds !== undefined) {
      const budget = options.timeBudgetSeconds;
      pyodide.runPython(`_TIME_BUDGET = ${Number.isFinite(budget) ? budget : "float('inf')"}`);
    }
    if (options.workBudget !== undefined) pyodide.runPython(`_WORK_BUDGET = ${options.workBudget}`);

    // The source goes to run_traced as a str (data), never into Python code:
    // a program ending in a quote or a backslash runs as written.
    const runTraced = pyodide.globals.get('run_traced') as PyCallable;
    try {
      return JSON.parse(runTraced(source, options.stdin ?? '') as string) as WorkerMessage;
    } finally {
      runTraced.destroy?.();
    }
  } catch (err) {
    // run_traced reports the program's own errors in its reply, so this is
    // PyTutor failing: the details go to the developer's console, not to the
    // student, who would only see Pyodide's internals.
    console.error('PyTutor internal error:', err);
    return { type: 'error', message: INTERNAL_ERROR };
  }
}
