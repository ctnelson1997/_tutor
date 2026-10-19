// ── Primitive values ──

export interface PrimitiveValue {
  /** `empty` is an array's hole (JS, #48): no element at that index, not even undefined. */
  type: 'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'symbol' | 'bigint' | 'empty';
  value: string | number | boolean | null;
  /**
   * The text to show, when the engine renders the value itself, e.g. Java's
   * `'B'` for a char (not `"B"`), `5.0` for a double, `"a\nb"` for a string
   * with a line break; Python's `5.0`, `-0.0`, `1e+16`, `True`, `None`, a big
   * int's every digit (its `value` the digits as text too), `(3+4j)`. Without
   * it the UI renders `value` by `type`.
   */
  display?: string;
}

// ── Heap references ──

export interface HeapRef {
  type: 'ref';
  heapId: string;
}

export type RuntimeValue = PrimitiveValue | HeapRef;

// ── Heap objects ──

export interface Property {
  key: string;
  value: RuntimeValue;
  /**
   * The key itself, when it is a value rather than a name: a Map's key (JS,
   * #48), drawn as values are, so an object key is a reference to its object.
   * `key` is then only text that tells the entries apart.
   */
  keyValue?: RuntimeValue;
}

export type CommonHeapObjectType =
  | 'object'
  | 'array'
  | 'function'
  | 'class'
  | 'date'
  | 'regexp'
  | 'map'
  | 'set'
  | 'error';

// Open union: engines can emit any string type (e.g. Python's 'dict', 'tuple')
export type HeapObjectType = CommonHeapObjectType | (string & {});

export interface HeapObject {
  id: string;
  objectType: HeapObjectType;
  label?: string;               // e.g. function name, class name
  properties: Property[];
  proto?: HeapRef;
}

// ── Stack frames ──

export interface Variable {
  name: string;
  value: RuntimeValue;
}

export interface StackFrame {
  name: string;
  variables: Variable[];
  isBlockScope?: boolean;
  closureVars?: Variable[];
  thisArg?: RuntimeValue;
}

// ── Execution snapshot ──

export interface ConditionResult {
  expression: string;
  result: boolean;
  line: number;
}

export interface ColumnRange {
  startCol: number;  // 0-indexed
  endCol: number;    // 0-indexed, exclusive
}

/** A line of the console, and the stream the program wrote it to. */
export interface ConsoleLine {
  text: string;
  stream: 'stdout' | 'stderr';
  /**
   * Character ranges `[start, end)` of `text` that echo what the program read
   * from stdin (Python's input(), #32), as a terminal shows what was typed:
   * not the program's output. A line that ended with the input's newline (the
   * Enter that ended a typed line) ends with an empty range at its end.
   */
  input?: [number, number][];
}

export interface ExecutionSnapshot {
  step: number;
  line: number;
  columnRange?: ColumnRange;
  callStack: StackFrame[];
  heap: HeapObject[];
  /** What the program has written to stdout, by line. */
  stdout: string[];
  /**
   * The console in program order, stdout and stderr lines interleaved, once
   * the program has written to stderr (Java's System.err, printStackTrace) or
   * read stdin (Python's input(), echoed). Without it, the console is `stdout`.
   */
  console?: ConsoleLine[];
  condition?: ConditionResult;
  /**
   * Why this step happens when nothing on the stack called it: the first step
   * of a callback the event loop runs after the script (JS, #45), such as
   * `setTimeout callback`, `promise callback` or `resumed after await`.
   */
  label?: string;
}

// ── Execution result from the worker ──

/**
 * Why a run ended before the program finished normally.
 *   exception  the program threw an exception that nothing caught
 *   limit      the run hit the step cap or the time limit
 *   error      the engine stopped it: a construct it can't run yet, or an
 *              internal failure
 *   compile    the program doesn't compile (Java) or parse (JS, #50): nothing
 *              ran, `message` and `line` are the first error, `lines` has every
 *              error's line, and `stderr` lists them all as javac or the
 *              browser's console does
 * `kind` is absent for failures before anything ran (a Python syntax error,
 * the engine failing to load, the worker timing out).
 */
export interface RunError {
  message: string;
  line?: number;
  kind?: 'exception' | 'limit' | 'error' | 'compile';
  /** For a program that doesn't compile: the line of each error, in the compiler's order (the editor marks them all). */
  lines?: number[];
  /** What the program's stderr would show, such as Java's stack trace or javac's errors. The console shows it at the last step. */
  stderr?: string;
}

export type WorkerMessage =
  /** The program ran: the steps it produced, and why it stopped early if it did. */
  | { type: 'result'; snapshots: ExecutionSnapshot[]; error?: RunError }
  /** Nothing ran: a parse error, the engine failing to load, or the worker timing out. */
  | { type: 'error'; message: string; line?: number };
