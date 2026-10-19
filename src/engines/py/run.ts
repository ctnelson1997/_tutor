/**
 * Running a program through the tracer in a loaded Pyodide: what the worker
 * does with a 'run' request, in a fresh interpreter each time (session.ts).
 * The CPython differential suite (#29) calls it with a Pyodide loaded in Node,
 * so the suite runs exactly what the browser runs.
 */
import type { ConsoleLine, ExecutionSnapshot, HeapObject, Property, RunError, StackFrame, Variable, WorkerMessage } from '../../types/snapshot';

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

/** A step as the tracer writes it (#39): its frames, heap objects and output as indices into the reply's parts. */
interface EncodedSnapshot extends Omit<ExecutionSnapshot, 'callStack' | 'heap' | 'stdout' | 'console'> {
  callStack: number[];
  heap: number[];
  stdout: number;
  console?: number;
}

/** A list of lines as the tracer writes it: the lines added to the first `keep` of another list's, or all of them. */
interface EncodedLines {
  base?: number;
  keep?: number;
  add: unknown[];
}

/**
 * The tracer's reply as a WorkerMessage. A result lists each frame, variable,
 * heap object, property and output list once, in `parts`, the steps referring
 * to them by index (#39): each becomes one object, shared by every step that
 * shows it, so the worker's postMessage (a structured clone) sends it once.
 */
export function decodeReply(text: string): WorkerMessage {
  const raw = JSON.parse(text) as { type: string; parts?: unknown[]; snapshots?: EncodedSnapshot[]; error?: RunError };
  if (raw.type !== 'result' || !raw.parts) return raw as WorkerMessage;
  const parts = raw.parts;
  const built = new Map<number, unknown>();
  const once = <T>(i: number, build: (part: never) => T): T => {
    if (!built.has(i)) built.set(i, build(parts[i] as never));
    return built.get(i) as T;
  };
  // Variables, properties and console lines are parts as they are.
  const frame = (i: number) => once(i, (p: { name: string; variables: number[] }): StackFrame => ({ name: p.name, variables: p.variables.map(v => parts[v] as Variable) }));
  const heapObject = (i: number) => once(i, (p: Omit<HeapObject, 'properties'> & { properties: number[] }): HeapObject => ({ ...p, properties: p.properties.map(q => parts[q] as Property) }));
  // A list of lines from the list it grew from: built in order, never by recursion (a run may print thousands of times).
  const lines = <T>(i: number, item: (x: unknown) => T): T[] => {
    const chain: number[] = [];
    for (let j: number | undefined = i; j !== undefined && !built.has(j); j = (parts[j] as EncodedLines).base) chain.push(j);
    for (const j of chain.reverse()) {
      const p = parts[j] as EncodedLines;
      const added = p.add.map(item);
      built.set(j, p.base === undefined ? added : (built.get(p.base) as T[]).slice(0, p.keep).concat(added));
    }
    return built.get(i) as T[];
  };
  const snapshots = (raw.snapshots ?? []).map(({ callStack, heap, stdout, console: consolePart, ...rest }): ExecutionSnapshot => {
    const out: ExecutionSnapshot = {
      ...rest,
      callStack: callStack.map(frame),
      heap: heap.map(heapObject),
      stdout: lines(stdout, x => x as string),
    };
    if (consolePart !== undefined) out.console = lines(consolePart, x => parts[x as number] as ConsoleLine);
    return out;
  });
  return raw.error ? { type: 'result', snapshots, error: raw.error } : { type: 'result', snapshots };
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
      return decodeReply(runTraced(source, options.stdin ?? '') as string);
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
