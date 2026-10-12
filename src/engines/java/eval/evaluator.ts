/**
 * The new Java core's evaluator (#14): runs the bound tree (semantic/) and
 * records the steps the UI shows.
 *
 * Java calls don't run on the JavaScript stack. Each Java frame runs as a
 * generator; a call yields the new frame to a trampoline (`drive`), which
 * keeps the frames on an explicit stack and resumes the caller with the
 * result. JavaScript's stack depth is independent of Java's recursion depth,
 * and recursing past `maxDepth` frames is a StackOverflowError a program can
 * catch.
 *
 * An expression that can't call a method of the program (no user calls,
 * object creation or class initialization in it) is evaluated by plain
 * recursion (`pv`); others by the generator (`gv`), which yields frames.
 *
 * Steps follow pythontutor.com (#24): a step shows the state *before* its
 * line runs. There is one before each statement (and each loop test), one
 * when a method is entered (its parameters bound, before its first line),
 * one when it returns (showing `return ↵` with the value), one where an
 * exception is raised, and a last one when main returns, showing the final
 * state.
 */

import type { ConsoleLine, ExecutionSnapshot, StackFrame, Variable, RunError } from '../../../types/snapshot';
import { SnapshotSharer } from '../../../utils/snapshotSharing';
import type * as B from '../semantic/bound';
import type { ClassSymbol, MethodSymbol, FieldSymbol, LocalSymbol, ConstValue } from '../semantic/symbols';
import { type JType, runtimeTypeName, unboxedType, erasure, asSuper, classType, substitute, typeArgMap } from '../semantic/types';
import { InterpreterError, JavaRuntimeError, UnsupportedFeatureError, nullPointer } from '../errors';
import { type Reference, type VariableSlot, assignmentConversion, slotReference, fieldReference, arrayElementReference } from '../references';
import { binaryOperation, unaryOperation, castPrimitive, stepped, numericValue } from '../numeric';
import {
  type JavaValue,
  type JavaHeapEntry,
  type JavaObject,
  type JavaObjectRef,
  type JavaPrimitive,
  type JavaPrimitiveType,
  isJavaArray,
  isJavaObject,
  isBuiltinObject,
  identityHash,
  arrayClassName,
  qualifiedLibraryName,
  defaultValue,
  javaValueToBoolean,
  javaValueToNumber,
  javaValueToString,
  javaInt,
  javaBool,
  javaString,
  internedString,
  sameString,
  javaNull,
  collectionElements,
  mapContents,
} from '../types';
import {
  type StdlibContext,
  HaltSignal,
  StdlibError,
  callStaticMethod,
  getStaticField,
  javaFormat,
  newBuiltin,
  callInstanceMethod,
  forEachIterator,
  charArrayText,
  stringMethod,
  stringBuilderMethod,
  boxedMethod,
  newString,
  isExceptionClass,
  newException,
  exceptionMethod,
  formatException,
  qualifiedExceptionName,
  isLibrarySubtype,
  isStringType,
  isBoxedInstanceOf,
  identityHashCode,
} from '../stdlib';
import { javaToRuntime, reachableHeap } from './display';

// ── Limits ──

/** How long a run may go before it is stopped (tests lower them). */
export interface RunLimits {
  /** Steps recorded before the run is stopped. */
  maxSteps: number;
  /** Steps and loop iterations, recorded or not. */
  maxWork: number;
  /** Milliseconds, checked every 1024 units of work. */
  timeBudgetMs: number;
  /** Java frames before a call throws StackOverflowError. */
  maxDepth: number;
}

export const DEFAULT_LIMITS: RunLimits = { maxSteps: 5000, maxWork: 1_000_000, timeBudgetMs: 8_500, maxDepth: 1200 };

/** What a run reports. */
export interface ExecuteResult {
  snapshots: ExecutionSnapshot[];
  /** A one-line summary of how the run failed, e.g. `Exception in thread "main" java.lang.ArithmeticException: / by zero`. */
  error?: string;
  /** Why the run stopped early, for the UI: kind, line, and what stderr would show. */
  failure?: RunError;
}

/** The name of the frame that holds static fields, shown before main's. */
export const STATIC_FIELDS_FRAME = 'Static fields';
/** The variable a returning frame shows its value in, as the Python engine does. */
export const RETURN_VALUE = 'return ↵';
/** Stack trace lines to keep; a stack overflow would print thousands. */
const MAX_TRACE_FRAMES = 64;
/** Frames a step shows: past this many, the outermost and the deepest, with a note for the rest. */
const MAX_SHOWN_FRAMES = 100;

// ── Signals ──

class ReturnSignal {
  value?: JavaValue;
  line: number;
  constructor(value: JavaValue | undefined, line: number) {
    this.value = value;
    this.line = line;
  }
}

class BreakSignal {
  label?: string;
  constructor(label?: string) {
    this.label = label;
  }
}

class ContinueSignal {
  label?: string;
  constructor(label?: string) {
    this.label = label;
  }
}

class YieldSignal {
  value: JavaValue;
  constructor(value: JavaValue) {
    this.value = value;
  }
}

/** A thrown Java exception propagating up the stack until a matching catch. */
class JavaThrow {
  value: JavaValue;
  constructor(value: JavaValue) {
    this.value = value;
  }
}

/**
 * Stops a run that is too long to show: past the step cap, the work budget or
 * the time limit. It isn't a Java exception, so nothing catches it and no
 * finally block runs; the steps recorded so far are kept.
 */
class ExecutionLimit {
  message: string;
  line: number;
  constructor(message: string, line: number) {
    this.message = message;
    this.line = line;
  }
}

const targets = (signal: BreakSignal | ContinueSignal, labels: readonly string[]) => signal.label === undefined || labels.includes(signal.label);

/** Signals that leave a statement early but aren't exceptions: finally blocks still run for them. */
function isControlSignal(e: unknown): boolean {
  return e instanceof ReturnSignal || e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof YieldSignal;
}

/** A JavaScript stack overflow, from deep recursion in the engine's own code (library callbacks). */
function isStackOverflow(e: unknown): boolean {
  return e instanceof RangeError && (e.message.includes('call stack') || e.message.includes('Stack overflow'));
}

/** `ClassName: detail` at the start of an error message, when ClassName is a known exception class. */
function parseRuntimeException(message: string): { className: string; detail: string } | undefined {
  const m = message.replace(/^Line \d+:\s*/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)(?::\s*(.*))?$/s);
  return m && isExceptionClass(m[1]) ? { className: m[1], detail: m[2] ?? '' } : undefined;
}

// ── Frames and scopes ──

interface Scope {
  vars: Map<string, VariableSlot>;
  parent: Scope | null;
  /** How a block scope is shown: "for", "if", "catch", … */
  label?: string;
}

type Gen<T> = Generator<Frame, T, JavaValue | undefined>;

interface Frame {
  /** As shown: the method's name (`Animal.describe` for one a subclass inherited), a constructor's class name, or `<clinit>`. */
  name: string;
  /** The method's own name, for stack traces. */
  method: string;
  kind: 'method' | 'constructor' | 'clinit';
  cls: ClassSymbol;
  slots: Map<LocalSymbol, VariableSlot>;
  /** Parameters and the body's locals. */
  scope: Scope;
  /** The innermost block scope now. */
  current: Scope;
  thisValue?: JavaValue;
  /** The line the frame is executing: its current statement, or the call it is waiting on. */
  line: number;
  gen?: Gen<JavaValue | undefined>;
  /** Set for the step taken as the frame returns. */
  returning?: { value?: JavaValue };
  /** The line of the frame's last step: another statement on it takes no step of its own, as CPython emits no new line event. */
  lastStepLine?: number;
}

interface StaticSlot extends VariableSlot {
  field: FieldSymbol;
  /** A constant variable: set before the program starts, and reading it doesn't initialize its class. */
  constant: boolean;
}

interface ClassRuntime {
  bound: B.BClass;
  state: 'pending' | 'running' | 'done' | 'failed';
  statics: Map<string, StaticSlot>;
}

/** Where a failure happened, recorded the first time it passes a catch point (while its frames are still on the stack). */
interface FailureSite {
  line: number;
  /** `Main.divide(Main.java:3)`, innermost first, as a Java stack trace lists them. */
  trace: string[];
}

const SYSTEM_OUT_ID = '__system_out__';
const SYSTEM_ERR_ID = '__system_err__';
const SYSTEM_IN_ID = '__system_in__';

/** Library interfaces a program's own classes don't implement in practice: calls through them can't reach the program's code. */
const LIBRARY_ONLY_INTERFACES = new Set(['Collection', 'List', 'Set', 'SortedSet', 'NavigableSet', 'Map', 'SortedMap', 'NavigableMap', 'Queue', 'Deque', 'Iterator', 'Entry', 'CharSequence']);

const BOXES: Record<JavaPrimitiveType, string> = {
  int: 'Integer', long: 'Long', short: 'Short', byte: 'Byte', char: 'Character', float: 'Float', double: 'Double', boolean: 'Boolean',
};

export class Evaluator {
  private readonly program: B.BProgram;
  private readonly source: string;
  private readonly limits: RunLimits;
  private readonly stdin: string;

  readonly heap = new Map<string, JavaHeapEntry>();
  private nextHeapId = 1;
  private frames: Frame[] = [];
  private snapshots: ExecutionSnapshot[] = [];
  private step = 0;
  private work = 0;
  private startTime = 0;
  /** When > 0, no steps are recorded (a library callback such as toString() runs atomically). */
  private suppress = 0;
  private readonly sharer = new SnapshotSharer();
  private fileName = 'Main.java';

  private readonly classes = new Map<ClassSymbol, ClassRuntime>();
  /** The program's classes by simple name (a runtime object's className). */
  private readonly byName = new Map<string, ClassSymbol>();
  private readonly methods = new Map<MethodSymbol, B.BMethod>();
  private readonly hasStatics: boolean;

  private stdoutBuffer = '';
  private consoleLines: ConsoleLine[] = [{ text: '', stream: 'stdout' }];
  private stderrUsed = false;
  /** The stack trace each exception object was created with, by heap id (for printStackTrace). */
  private readonly exceptionTraces = new Map<string, string[]>();
  private readonly failureSites = new WeakMap<object, FailureSite>();
  /** Boxes of small values, shared as Integer.valueOf shares them. */
  private readonly boxCache = new Map<string, JavaPrimitive>();
  private readonly pureCache = new WeakMap<B.BExpr, boolean>();
  /** Each class's instance fields and their keys (see layout). */
  private readonly layouts = new Map<ClassSymbol, Map<FieldSymbol, string>>();
  /** Does any class declare a field its superclass has too (so keys can differ from names)? */
  private readonly hidesFields: boolean;
  /** One Class object per class, for getClass(). */
  private readonly classObjects = new Map<string, JavaObjectRef>();
  /** Virtual dispatch: the method each class runs for a method it may override. */
  private readonly overrides = new Map<MethodSymbol, Map<ClassSymbol, MethodSymbol | undefined>>();
  private readonly constCache = new WeakMap<B.BConst, JavaValue>();
  private readonly ctx: StdlibContext;

  constructor(program: B.BProgram, source: string, stdin = '', limits: Partial<RunLimits> = {}) {
    this.program = program;
    this.source = source;
    this.stdin = stdin;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    for (const bc of program.classes) {
      const statics = new Map<string, StaticSlot>();
      for (const f of bc.symbol.fields.values()) {
        if (f.isStatic) statics.set(f.name, { value: defaultValue(runtimeTypeName(f.type)), type: runtimeTypeName(f.type), field: f, constant: false });
      }
      this.classes.set(bc.symbol, { bound: bc, state: 'pending', statics });
      this.byName.set(bc.symbol.name, bc.symbol);
      for (const m of [...bc.methods, ...bc.constructors]) this.methods.set(m.symbol, m);
    }
    this.hasStatics = [...this.classes.values()].some(c => c.statics.size > 0);
    this.hidesFields = program.classes.some(({ symbol }) => [...symbol.fields.values()].some(f => {
      for (let c = symbol.superclass?.symbol; c && !c.isLibrary; c = c.superclass?.symbol) if (c.fields.get(f.name)?.isStatic === false && !f.isStatic) return true;
      return false;
    }));
    this.ctx = {
      heap: this.heap,
      allocArray: (elementType, elements) => this.allocArray(elementType, elements),
      allocObject: (className, fields) => this.allocObject(className, fields, true),
      random: () => Math.random(),
      stdin: this.stdin,
      writeStdout: text => this.appendStdout(text),
      invokeUserMethod: (ref, name, args) => this.invokeUser(ref, name, args),
      binaryName: className => this.binaryName(className),
      stringify: value => this.stringify(value),
    };
  }

  // ── Running ──

  execute(): ExecuteResult {
    this.startTime = Date.now();
    try {
      const { entry, main } = this.program;
      if (!entry || !main) throw new InterpreterError('No main method found', 0);
      this.fileName = `${entry.name}.java`;
      this.initConstants();
      this.drive(this.runProgram(entry, main));
      return { snapshots: this.snapshots };
    } catch (e) {
      return this.endedBy(e);
    }
  }

  private *runProgram(entry: ClassSymbol, main: MethodSymbol): Gen<undefined> {
    // Java initializes the entry class before main runs.
    yield* this.initClass(entry);
    const bm = this.methods.get(main)!;
    const frame = this.newFrame('main', 'method', entry);
    // args is an empty String[], bound only when main mentions it (other programs don't show it at every step).
    const args = bm.params[0];
    if (args && bm.body && mentionsLocal(bm.body, args)) {
      this.declare(frame, frame.scope, args, { kind: 'arrayRef', heapId: this.allocArray('String', []) });
    }
    frame.gen = this.runBody(frame, bm.body!, undefined);
    yield frame;
    return undefined;
  }

  /**
   * The trampoline: runs `root` and every frame it calls, keeping Java frames
   * on `this.frames` and their generators on a stack of its own. Library
   * callbacks run a nested drive, on the same frames.
   */
  private drive<T>(root: Gen<T>): T {
    const stack: { gen: Gen<unknown>; frame?: Frame }[] = [{ gen: root as Gen<unknown> }];
    let input: JavaValue | undefined;
    let error: unknown;
    let failed = false;
    for (;;) {
      const top = stack[stack.length - 1];
      let result: IteratorResult<Frame, unknown>;
      try {
        result = failed ? top.gen.throw(error) : top.gen.next(input);
        failed = false;
      } catch (e) {
        // The generator ended by throwing: note where, while its frame is still on the stack.
        const err = this.atFailureSite(e);
        if (top.frame) this.frames.pop();
        stack.pop();
        if (stack.length === 0) throw err;
        failed = true;
        error = err;
        continue;
      }
      if (result.done) {
        if (top.frame) this.frames.pop();
        stack.pop();
        if (stack.length === 0) return result.value as T;
        input = result.value as JavaValue | undefined;
        continue;
      }
      const callee = result.value;
      if (this.frames.length >= this.limits.maxDepth) {
        failed = true;
        error = new JavaRuntimeError('StackOverflowError', '', this.top()?.line ?? 0);
        continue;
      }
      this.frames.push(callee);
      stack.push({ gen: callee.gen!, frame: callee });
      input = undefined;
    }
  }

  private top(): Frame {
    return this.frames[this.frames.length - 1];
  }

  private newFrame(name: string, kind: Frame['kind'], cls: ClassSymbol, thisValue?: JavaValue, method = name): Frame {
    const scope: Scope = { vars: new Map(), parent: null };
    return { name, method, kind, cls, slots: new Map(), scope, current: scope, thisValue, line: 0 };
  }

  /**
   * A method's (or constructor's) body: its statements, run in the frame's
   * own scope, then a step as it returns. `entryLine` is where the step on
   * entering it goes (none for main).
   */
  private *runBody(frame: Frame, body: B.BBlock, entryLine: number | undefined): Gen<JavaValue | undefined> {
    if (entryLine !== undefined) this.stepAt(entryLine);
    let value: JavaValue | undefined;
    let line = body.range.endLine;
    try {
      for (const s of body.statements) yield* this.exec(s, []);
    } catch (e) {
      if (!(e instanceof ReturnSignal)) throw e;
      value = e.value;
      line = e.line;
    }
    frame.current = frame.scope;
    frame.returning = { value };
    this.stepAt(line, true);
    frame.returning = undefined;
    return value;
  }

  // ── Steps ──

  /**
   * A step at `line`, before it runs (also counts work, and stops a run past
   * its limits). Like pythontutor.com's steps, which follow CPython's line
   * events, a statement on the line the frame last stepped at takes no step
   * of its own (`if (n < 2) return n;` is one step), unless `force`d: a
   * loop's next test (a backward jump), a return, a method's entry.
   */
  private stepAt(line: number, force = false): void {
    const frame = this.top();
    if (frame) frame.line = line;
    this.tick(line);
    if (this.suppress > 0) return;
    if (frame) {
      if (!force && frame.lastStepLine === line) return;
      frame.lastStepLine = line;
    }
    if (this.snapshots.length >= this.limits.maxSteps) {
      throw new ExecutionLimit(`Stopped after ${this.limits.maxSteps} steps, the most that can be shown. Your code may contain an infinite loop.`, line);
    }
    this.recordStep(line);
  }

  /** Count one unit of work (a step or a loop iteration), stopping a run that goes on too long to show. */
  private tick(line: number): void {
    if (++this.work > this.limits.maxWork) {
      throw new ExecutionLimit(`Stopped after ${this.limits.maxWork.toLocaleString('en-US')} steps of work (most of them inside calls that show no steps), the most a program can do here`, line);
    }
    if ((this.work & 1023) === 0 && Date.now() - this.startTime > this.limits.timeBudgetMs) {
      throw new ExecutionLimit(`Stopped after ${this.limits.timeBudgetMs / 1000} seconds, the longest a program can run here`, line);
    }
  }

  private recordStep(line: number): void {
    const callStack: StackFrame[] = [];
    if (this.hasStatics) callStack.push(this.staticFieldsFrame());
    let shown = this.frames;
    if (shown.length > MAX_SHOWN_FRAMES) {
      const hidden = shown.length - MAX_SHOWN_FRAMES + 1;
      shown = [shown[0], ...shown.slice(hidden + 1)];
      this.pushFrame(callStack, shown[0]);
      callStack.push({ name: `… ${hidden.toLocaleString('en-US')} more frames`, variables: [] });
      for (const f of shown.slice(1)) this.pushFrame(callStack, f);
    } else {
      for (const f of shown) this.pushFrame(callStack, f);
    }
    this.snapshots.push(this.sharer.share({
      step: this.step++,
      line,
      callStack,
      heap: reachableHeap(callStack, this.heap),
      stdout: this.snapshotStdout(),
      ...(this.stderrUsed ? { console: this.snapshotConsole() } : {}),
    }));
  }

  /** A frame as a step shows it: its own variables (and `this`, and a return value), then its block scopes nested in it. */
  private pushFrame(callStack: StackFrame[], frame: Frame): void {
    const root: StackFrame = { name: frame.name, variables: this.visibleVariables(frame.scope) };
    if (frame.thisValue) root.thisArg = javaToRuntime(frame.thisValue, this.heap);
    if (frame.returning?.value) root.variables.push({ name: RETURN_VALUE, value: javaToRuntime(frame.returning.value, this.heap) });
    callStack.push(root);
    const blocks: Scope[] = [];
    for (let s: Scope | null = frame.current; s && s !== frame.scope; s = s.parent) blocks.push(s);
    // Outer to inner. A child scope with its parent's label (a for loop's body block) merges into the parent's frame.
    let lastEmitted: Scope | null = null;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const label = blocks[i].label || frame.name;
      const vars = this.visibleVariables(blocks[i]);
      const prev = callStack[callStack.length - 1];
      const directChild = lastEmitted && blocks[i].parent === lastEmitted;
      if (prev.isBlockScope && prev.name === label && directChild) prev.variables.push(...vars);
      else if (vars.length > 0) callStack.push({ name: label, variables: vars, isBlockScope: true });
      lastEmitted = blocks[i];
    }
  }

  /** A scope's variables as a step shows them: without locals that have no value yet. */
  private visibleVariables(scope: Scope): Variable[] {
    const out: Variable[] = [];
    for (const [name, slot] of scope.vars) if (!slot.unassigned) out.push({ name, value: javaToRuntime(slot.value, this.heap) });
    return out;
  }

  /** Every static field of each class that has started initializing, as `Main.moves`. */
  private staticFieldsFrame(): StackFrame {
    const variables: Variable[] = [];
    for (const [cls, rt] of this.classes) {
      if (rt.state === 'pending') continue;
      for (const [name, slot] of rt.statics) variables.push({ name: `${cls.name}.${name}`, value: javaToRuntime(slot.value, this.heap) });
    }
    return { name: STATIC_FIELDS_FRAME, variables };
  }

  // ── Output ──

  private appendStdout(text: string): void {
    this.stdoutBuffer += text;
    this.writeConsole(text, 'stdout');
  }

  private appendStderr(text: string): void {
    this.stderrUsed = true;
    this.writeConsole(text, 'stderr');
  }

  private writeConsole(text: string, stream: ConsoleLine['stream']): void {
    const parts = text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) this.consoleLines.push({ text: '', stream });
      const open = this.consoleLines[this.consoleLines.length - 1];
      if (open.text === '' && parts[i] !== '') open.stream = stream;
      open.text += parts[i];
    }
  }

  private snapshotConsole(): ConsoleLine[] | undefined {
    if (!this.stderrUsed) return undefined;
    const lines = this.consoleLines.slice(0, -1);
    const open = this.consoleLines[this.consoleLines.length - 1];
    if (open.text !== '') lines.push({ ...open });
    return lines;
  }

  private snapshotStdout(): string[] {
    if (this.stdoutBuffer === '') return [];
    const s = this.stdoutBuffer.endsWith('\n') ? this.stdoutBuffer.slice(0, -1) : this.stdoutBuffer;
    return s.split('\n');
  }

  /** What printStackTrace() prints: the exception, the frames it was created in, and its causes ("... n more" for shared frames). */
  private stackTraceText(exception: JavaValue): string {
    const out: string[] = [];
    let current: JavaValue | undefined = exception;
    let enclosing: string[] = [];
    for (let depth = 0; current?.kind === 'objectRef' && depth < 20; depth++) {
      const trace = this.exceptionTraces.get(current.heapId) ?? [];
      let shared = 0;
      while (shared < trace.length && shared < enclosing.length && trace[trace.length - 1 - shared] === enclosing[enclosing.length - 1 - shared]) shared++;
      out.push((depth > 0 ? 'Caused by: ' : '') + this.stringify(current));
      for (const frame of trace.slice(0, trace.length - shared)) out.push(`\tat ${frame}`);
      if (shared > 0) out.push(`\t... ${shared} more`);
      const obj = this.heap.get(current.heapId);
      const cause = obj && isJavaObject(obj) ? obj.fields.get('cause') : undefined;
      enclosing = trace;
      current = cause && cause.kind === 'objectRef' && cause.heapId !== current.heapId ? cause : undefined;
    }
    return out.join('\n') + '\n';
  }

  // ── How a run ends ──

  private endedBy(thrown: unknown): ExecuteResult {
    const snapshots = this.snapshots;
    if (thrown instanceof HaltSignal) return { snapshots };
    if (thrown instanceof ExecutionLimit) {
      const failure: RunError = { kind: 'limit', message: thrown.message, ...(thrown.line ? { line: thrown.line } : {}) };
      return { snapshots, error: thrown.message, failure };
    }
    const e = this.atFailureSite(thrown);
    const site = typeof e === 'object' && e !== null ? this.failureSites.get(e) : undefined;
    const at = site?.line ? { line: site.line } : {};
    if (this.exceptionClassOf(e) !== undefined) {
      const text = this.describeException(e);
      const summary = `Exception in thread "main" ${text}`;
      const trace = site?.trace ?? [];
      const stderr = [summary, ...trace.map(frame => (frame.startsWith('...') ? `\t${frame}` : `\tat ${frame}`))].join('\n');
      return { snapshots, error: summary, failure: { kind: 'exception', message: text, ...at, stderr } };
    }
    let message: string;
    if (e instanceof InterpreterError) message = e.reason;
    else if (e instanceof StdlibError) message = e.message;
    else if (e instanceof BreakSignal || e instanceof ContinueSignal) message = `'${e instanceof BreakSignal ? 'break' : 'continue'}' is only allowed inside a loop`;
    else if (e instanceof YieldSignal) message = "'yield' is only allowed inside a switch expression";
    else {
      const raw = e instanceof Error ? e.message : String(e);
      const internal = 'Internal JavaTutor error (please report it)';
      return { snapshots, error: `${internal}: ${raw}`, failure: { kind: 'error', message: internal, ...at } };
    }
    const summary = site?.line ? `Line ${site.line}: ${message}` : message;
    return { snapshots, error: summary, failure: { kind: 'error', message, ...at } };
  }

  /** An uncaught exception as `java` prints it: `java.lang.ArithmeticException: / by zero`, or its own toString(). */
  private describeException(e: unknown): string {
    if (e instanceof JavaThrow) {
      try {
        return this.stringify(e.value);
      } catch {
        return formatException(e.value, this.heap, this.ctx.binaryName) ?? 'java.lang.Throwable';
      }
    }
    const parsed = e instanceof InterpreterError || e instanceof StdlibError ? parseRuntimeException(e.message) : undefined;
    if (!parsed) return 'java.lang.Throwable';
    return parsed.detail ? `${qualifiedExceptionName(parsed.className)}: ${parsed.detail}` : qualifiedExceptionName(parsed.className);
  }

  /**
   * Note where a failure happened, the first time it passes a catch point,
   * while the frames that threw it are still on the stack: its line, its
   * stack trace, and (for an exception the runtime raised, such as / by zero)
   * a step showing the frame where it happened, unless the step before it
   * already does.
   */
  private atFailureSite(thrown: unknown): unknown {
    if (typeof thrown !== 'object' || thrown === null) return thrown;
    if (isControlSignal(thrown) || thrown instanceof HaltSignal || thrown instanceof ExecutionLimit) return thrown;
    if (this.failureSites.has(thrown)) return thrown;
    const top = this.top();
    const e = isStackOverflow(thrown) ? new JavaRuntimeError('StackOverflowError', '', top?.line ?? 0) : thrown;
    const line = e instanceof InterpreterError && e.line > 0 ? e.line : top?.line ?? 0;
    this.failureSites.set(e, { line, trace: this.stackTrace(line) });
    const overflow = e instanceof JavaRuntimeError && e.className === 'StackOverflowError';
    const runtimeException = !(e instanceof JavaThrow) && this.exceptionClassOf(e) !== undefined;
    if (runtimeException && !overflow && top && this.suppress === 0 && this.snapshots.length < this.limits.maxSteps && !this.lastStepShows(line)) {
      top.line = line;
      this.recordStep(line);
    }
    return e;
  }

  /** Is the last step already at this line, with the frames there are now? */
  private lastStepShows(line: number): boolean {
    const last = this.snapshots[this.snapshots.length - 1];
    if (!last || last.line !== line) return false;
    const frames = last.callStack.filter(f => !f.isBlockScope && f.name !== STATIC_FIELDS_FRAME).length;
    return frames === Math.min(this.frames.length, MAX_SHOWN_FRAMES + 1);
  }

  /** The frames of a Java stack trace, innermost first: `Main.divide(Main.java:3)`. */
  private stackTrace(line: number): string[] {
    const trace: string[] = [];
    const innermost = this.frames.length - 1;
    for (let i = innermost; i >= 0 && trace.length < MAX_TRACE_FRAMES; i--) {
      const frame = this.frames[i];
      const method = frame.kind === 'constructor' ? '<init>' : frame.kind === 'clinit' ? '<clinit>' : frame.method;
      trace.push(`${frame.cls.binaryName}.${method}(${this.fileName}:${i === innermost ? line : frame.line})`);
    }
    if (innermost + 1 > MAX_TRACE_FRAMES) trace.push(`... ${innermost + 1 - MAX_TRACE_FRAMES} more`);
    return trace;
  }

  /** The class of the Java exception a thrown JS value stands for; undefined for signals and engine errors. */
  private exceptionClassOf(e: unknown): string | undefined {
    if (e instanceof JavaThrow) return e.value.kind === 'objectRef' ? e.value.className : undefined;
    if (e instanceof JavaRuntimeError) return e.className;
    if (e instanceof InterpreterError || e instanceof StdlibError) return parseRuntimeException(e.message)?.className;
    return undefined;
  }

  /** The exception object a catch clause binds: the thrown value, or a new object for a runtime error. */
  private toExceptionValue(e: unknown): JavaValue | null {
    if (e instanceof JavaThrow) return e.value;
    if (e instanceof InterpreterError || e instanceof StdlibError) {
      const parsed = parseRuntimeException(e.message);
      if (parsed) {
        const value = newException(parsed.className, parsed.detail ? [javaString(parsed.detail)] : [], this.ctx);
        const trace = this.failureSites.get(e)?.trace;
        if (trace && value.kind === 'objectRef') this.exceptionTraces.set(value.heapId, trace);
        return value;
      }
    }
    return null;
  }

  // ── Classes ──

  /** Give every constant variable its value before the program starts (javac folds them into the code). */
  private initConstants(): void {
    for (const rt of this.classes.values()) {
      for (const slot of rt.statics.values()) {
        const c = slot.field.constant;
        if (c === undefined) continue;
        slot.value = constValue(c, slot.field.type);
        slot.constant = true;
      }
    }
  }

  /**
   * Initialize a class at its first active use (JLS §12.4.1): its static
   * field initializers and static blocks run once, in textual order, in a
   * `<clinit>` frame. A class already being initialized isn't initialized
   * again. An exception becomes ExceptionInInitializerError, and later uses
   * NoClassDefFoundError.
   */
  private *initClass(cls: ClassSymbol): Gen<void> {
    const rt = this.classes.get(cls);
    if (!rt || rt.state === 'done' || rt.state === 'running') return;
    if (rt.state === 'failed') {
      throw new JavaThrow(this.newThrowable('NoClassDefFoundError', `Could not initialize class ${cls.binaryName}`));
    }
    rt.state = 'running';
    const items = rt.bound.staticInit.filter(i => i.kind !== 'field' || !rt.statics.get(i.field.name)?.constant);
    if (items.length === 0) {
      rt.state = 'done';
      return;
    }
    const frame = this.newFrame('<clinit>', 'clinit', cls);
    frame.gen = this.runStaticInit(frame, rt, items);
    try {
      yield frame;
      rt.state = 'done';
    } catch (thrown) {
      const exc = this.toExceptionValue(thrown);
      if (!exc) throw thrown;
      rt.state = 'failed';
      const isError = exc.kind === 'objectRef' && this.isSubclass(exc.className, 'Error');
      throw new JavaThrow(isError ? exc : this.newThrowable('ExceptionInInitializerError', null, exc));
    }
  }

  private *runStaticInit(frame: Frame, rt: ClassRuntime, items: B.BInitializer[]): Gen<undefined> {
    for (const item of items) {
      if (item.kind === 'field') {
        this.stepAt(item.range.line);
        const v = this.isPure(item.value) ? this.pv(item.value) : yield* this.gv(item.value);
        rt.statics.get(item.field.name)!.value = v;
      } else {
        yield* this.blockIn(item.body, frame.scope, 'static');
      }
    }
    return undefined;
  }

  private newThrowable(className: string, message: string | null, cause?: JavaValue): JavaValue {
    const ref = newException(className, message === null ? [] : [javaString(message)], this.ctx);
    if (cause && ref.kind === 'objectRef') (this.heap.get(ref.heapId) as JavaObject).fields.set('cause', cause);
    return ref;
  }

  /** Is class `cls` the type `type` or a subtype: a user class's interfaces and superclass, then the library's hierarchy. */
  private isSubclass(cls: string, type: string, seen = new Set<string>()): boolean {
    if (cls === type || type === 'Object') return true;
    const sym = this.byName.get(cls);
    if (!sym) {
      if (cls === 'String') return isStringType(type);
      const unboxed = Object.entries(BOXES).find(([, b]) => b === cls)?.[0] as JavaPrimitiveType | undefined;
      return unboxed ? isBoxedInstanceOf(unboxed, type) : isLibrarySubtype(cls, type);
    }
    seen.add(cls);
    if (sym.interfaces.some(i => !seen.has(i.symbol.name) && this.isSubclass(i.symbol.name, type, seen))) return true;
    const sup = sym.superclass?.symbol;
    return sup !== undefined && sup.name !== 'Object' && this.isSubclass(sup.name, type, seen);
  }

  private isThrowable(value: JavaValue): boolean {
    return value.kind === 'objectRef' && this.isSubclass(value.className, 'Throwable');
  }

  private binaryName(className: string): string {
    const sym = this.byName.get(className);
    return sym ? sym.binaryName : qualifiedExceptionName(className);
  }

  private javaClassName(className: string): string {
    const sym = this.byName.get(className);
    if (sym) return sym.binaryName;
    return isExceptionClass(className) ? qualifiedExceptionName(className) : qualifiedLibraryName(className);
  }

  // ── Heap ──

  private allocArray(elementType: string, elements: JavaValue[]): string {
    const id = String(this.nextHeapId++);
    this.heap.set(id, { elementType, elements });
    return id;
  }

  private allocObject(className: string, fields: Map<string, JavaValue>, builtin = false): string {
    const id = String(this.nextHeapId++);
    this.heap.set(id, builtin ? { className, fields, builtin } : { className, fields });
    return id;
  }

  // ── Statements ──

  private declare(frame: Frame, scope: Scope, local: LocalSymbol, value: JavaValue | undefined): VariableSlot {
    const type = runtimeTypeName(local.type);
    const slot: VariableSlot = value === undefined ? { value: defaultValue(type), type, unassigned: true } : { value, type };
    frame.slots.set(local, slot);
    if (local.name !== '_') scope.vars.set(local.name, slot);
    return slot;
  }

  private pushScope(label?: string): Scope {
    const frame = this.top();
    const scope: Scope = { vars: new Map(), parent: frame.current, label };
    frame.current = scope;
    return scope;
  }

  /** Run a block in a new scope nested in `parent`, so its locals end with it. */
  private *blockIn(block: B.BBlock, parent: Scope, label: string | undefined): Gen<void> {
    const frame = this.top();
    const scope: Scope = { vars: new Map(), parent, label };
    frame.current = scope;
    try {
      for (const s of block.statements) yield* this.exec(s, []);
    } catch (e) {
      throw this.atFailureSite(e); // while the block's locals are still shown
    } finally {
      frame.current = parent;
    }
  }

  private *exec(s: B.BStmt, labels: readonly string[]): Gen<void> {
    const frame = this.top();
    const line = s.range.line;
    switch (s.kind) {
      case 'Block': {
        // A block inherits its parent scope's label, so a loop body's variables show in the loop's block.
        yield* this.blockIn(s, frame.current, frame.current.label);
        return;
      }
      case 'LocalDecl':
        this.stepAt(line);
        yield* this.localDecl(s);
        return;
      case 'ExprStmt':
        this.stepAt(line);
        if (this.isPure(s.expr)) this.pv(s.expr);
        else yield* this.gv(s.expr);
        return;
      case 'If': return yield* this.ifStmt(s);
      case 'While': {
        const outer = frame.current;
        for (let first = true; ; first = false) {
          frame.current = outer;
          this.stepAt(line, !first);
          if (!javaValueToBoolean(this.isPure(s.cond) ? this.pv(s.cond) : yield* this.gv(s.cond))) break;
          try {
            yield* this.blockScoped(s.body, outer, 'while');
          } catch (e) {
            if (e instanceof BreakSignal && targets(e, labels)) break;
            if (e instanceof ContinueSignal && targets(e, labels)) continue;
            throw e;
          }
        }
        frame.current = outer;
        return;
      }
      case 'DoWhile': {
        const outer = frame.current;
        for (let first = true; ; first = false) {
          this.tick(line);
          if (!first) frame.lastStepLine = undefined; // jumped back to the body
          try {
            yield* this.blockScoped(s.body, outer, 'do-while');
          } catch (e) {
            if (e instanceof BreakSignal && targets(e, labels)) break;
            if (!(e instanceof ContinueSignal && targets(e, labels))) throw e;
          }
          frame.current = outer;
          this.stepAt(s.cond.range.line);
          if (!javaValueToBoolean(this.isPure(s.cond) ? this.pv(s.cond) : yield* this.gv(s.cond))) break;
        }
        frame.current = outer;
        return;
      }
      case 'For': {
        const outer = frame.current;
        const forScope = this.pushScope('for');
        try {
          for (const init of s.init) {
            if (init.kind === 'LocalDecl') yield* this.localDecl(init);
            else if (init.kind === 'ExprStmt') { if (this.isPure(init.expr)) this.pv(init.expr); else yield* this.gv(init.expr); }
          }
          for (let first = true; ; first = false) {
            frame.current = forScope;
            this.stepAt(line, !first);
            if (s.cond && !javaValueToBoolean(this.isPure(s.cond) ? this.pv(s.cond) : yield* this.gv(s.cond))) break;
            try {
              yield* this.blockScoped(s.body, forScope, 'for');
            } catch (e) {
              if (e instanceof BreakSignal && targets(e, labels)) break;
              if (!(e instanceof ContinueSignal && targets(e, labels))) throw e;
            }
            frame.current = forScope;
            for (const u of s.update) {
              if (this.isPure(u)) this.pv(u);
              else yield* this.gv(u);
            }
          }
        } finally {
          frame.current = outer;
        }
        return;
      }
      case 'ForEach': return yield* this.forEach(s, labels);
      case 'Labeled':
        try {
          yield* this.exec(s.body, [...labels, s.label]);
        } catch (e) {
          if (e instanceof BreakSignal && e.label === s.label) return;
          throw e;
        }
        return;
      case 'SwitchStmt':
        this.stepAt(line);
        yield* this.switch_(s.switch, false);
        return;
      case 'Break': this.stepAt(line); throw new BreakSignal(s.label);
      case 'Continue': this.stepAt(line); throw new ContinueSignal(s.label);
      case 'Return': {
        this.stepAt(line);
        const value = s.value ? (this.isPure(s.value) ? this.pv(s.value) : yield* this.gv(s.value)) : undefined;
        throw new ReturnSignal(value, line);
      }
      case 'Yield': {
        this.stepAt(line);
        throw new YieldSignal(this.isPure(s.value) ? this.pv(s.value) : yield* this.gv(s.value));
      }
      case 'Throw': {
        this.stepAt(line);
        const before = this.snapshots.length;
        const value = this.isPure(s.value) ? this.pv(s.value) : yield* this.gv(s.value);
        if (value.kind === 'null') throw nullPointer(`Cannot throw exception because "${this.text(s.value)}" is null`, line);
        // Creating the exception ran its constructor: show the throw again, where the exception starts.
        if (this.snapshots.length !== before) this.stepAt(line, true);
        throw new JavaThrow(value);
      }
      case 'Try': return yield* this.tryStmt(s);
      case 'Synchronized': {
        this.stepAt(line);
        const lock = this.isPure(s.lock) ? this.pv(s.lock) : yield* this.gv(s.lock);
        if (lock.kind === 'null') throw nullPointer(`Cannot enter synchronized block because "${this.text(s.lock)}" is null`, line);
        yield* this.blockIn(s.body, frame.current, 'synchronized');
        return;
      }
      case 'Assert':
        // `java` runs with assertions disabled, so the condition isn't evaluated; the step shows it was reached.
        this.stepAt(line);
        return;
      case 'Empty': return;
      case 'Unsupported': throw new UnsupportedFeatureError(s.construct, line, s.singular ?? false);
    }
  }

  /** A loop or if body: a block nests in a scope with the construct's label; a single statement runs in it. */
  private *blockScoped(body: B.BStmt, parent: Scope, label: string): Gen<void> {
    const frame = this.top();
    const scope: Scope = { vars: new Map(), parent, label };
    frame.current = scope;
    try {
      if (body.kind === 'Block') {
        for (const st of body.statements) yield* this.exec(st, []);
      } else {
        yield* this.exec(body, []);
      }
    } catch (e) {
      throw this.atFailureSite(e);
    } finally {
      frame.current = parent;
    }
  }

  private *localDecl(s: B.BLocalDecl): Gen<void> {
    const frame = this.top();
    for (const d of s.declarators) {
      if (!d.init) {
        this.declare(frame, frame.current, d.local, undefined);
        continue;
      }
      const value = this.isPure(d.init) ? this.pv(d.init) : yield* this.gv(d.init);
      this.declare(frame, frame.current, d.local, value);
    }
  }

  private *ifStmt(s: B.BIf): Gen<void> {
    const frame = this.top();
    const outer = frame.current;
    this.stepAt(s.range.line);
    // A condition with a pattern (o instanceof String s) binds in a scope of its own, which the branches nest in.
    const condScope = hasBinding(s.cond) ? this.pushScope('if') : outer;
    try {
      const cond = javaValueToBoolean(this.isPure(s.cond) ? this.pv(s.cond) : yield* this.gv(s.cond));
      const branch = cond ? s.then : s.else;
      if (branch) yield* this.blockScoped(branch, condScope, cond ? 'if' : 'else');
      frame.current = outer;
      // `if (!(o instanceof String s)) return;` leaves s in scope after the if.
      if (condScope !== outer && !cond && !s.else && !canCompleteNormally(s.then)) {
        for (const [name, slot] of condScope.vars) outer.vars.set(name, slot);
      }
    } finally {
      frame.current = outer;
    }
  }

  private *forEach(s: B.BForEach, labels: readonly string[]): Gen<void> {
    const frame = this.top();
    const outer = frame.current;
    const line = s.range.line;
    this.stepAt(line);
    const iterable = this.isPure(s.iterable) ? this.pv(s.iterable) : yield* this.gv(s.iterable);
    let next: () => JavaValue | undefined;
    if (iterable.kind === 'null') {
      throw nullPointer(`Cannot iterate over "${this.text(s.iterable)}" because it is null`, line);
    } else if (iterable.kind === 'arrayRef') {
      const arr = this.heap.get(iterable.heapId);
      const elements = arr && isJavaArray(arr) ? arr.elements : [];
      let i = 0;
      next = () => (i < elements.length ? elements[i++] : undefined);
    } else {
      const iterator = iterable.kind === 'objectRef' && isBuiltinObject(this.heap.get(iterable.heapId))
        ? this.stdlib(line, () => forEachIterator(iterable, this.ctx))
        : undefined;
      if (!iterator) throw new InterpreterError('Enhanced for loop requires an array or collection', line);
      next = () => this.stdlib(line, () => (iterator.hasNext() ? iterator.next() : undefined));
    }
    const forScope = this.pushScope('for');
    const slot = this.declare(frame, forScope, s.local, undefined);
    const sourceSlot: VariableSlot = { value: javaNull(), type: runtimeTypeName(s.elementSource.type) };
    frame.slots.set(s.elementSource, sourceSlot);
    let first = true;
    try {
      for (;;) {
        frame.current = forScope;
        if (!first) this.stepAt(line, true);
        first = false;
        const element = next();
        if (element === undefined) break;
        sourceSlot.value = element;
        slot.value = this.isPure(s.element) ? this.pv(s.element) : yield* this.gv(s.element);
        slot.unassigned = false;
        try {
          yield* this.blockScoped(s.body, forScope, 'for');
        } catch (e) {
          if (e instanceof BreakSignal && targets(e, labels)) break;
          if (e instanceof ContinueSignal && targets(e, labels)) continue;
          throw e;
        }
      }
    } finally {
      frame.current = outer;
    }
  }

  /**
   * try/catch/finally (and try-with-resources): a Java exception is matched
   * against the catch clauses; finally runs however the try or catch part
   * ends, and if it ends abruptly itself, that replaces the pending outcome.
   * System.exit and engine errors (an unsupported feature, the step limit)
   * run no catch or finally.
   */
  private *tryStmt(s: B.BTry): Gen<void> {
    const frame = this.top();
    const outer = frame.current;
    let pending: unknown;
    let hasPending = false;
    try {
      if (s.resources.length) yield* this.withResources(s, outer);
      else yield* this.blockIn(s.block, outer, 'try');
    } catch (thrown) {
      if (thrown instanceof HaltSignal) throw thrown;
      const e = this.atFailureSite(thrown);
      const excClass = this.exceptionClassOf(e);
      if (excClass === undefined && !isControlSignal(e)) throw e;
      const clause = excClass !== undefined ? s.catches.find(c => c.types.some(t => this.isSubclass(excClass, t.name))) : undefined;
      if (!clause) {
        pending = e;
        hasPending = true;
      } else {
        const exc = this.toExceptionValue(e)!;
        const catchScope: Scope = { vars: new Map(), parent: outer, label: 'catch' };
        frame.current = catchScope;
        try {
          this.declare(frame, catchScope, clause.local, exc);
          for (const st of clause.body.statements) yield* this.exec(st, []);
        } catch (thrownInCatch) {
          const inCatch = this.atFailureSite(thrownInCatch);
          if (inCatch instanceof HaltSignal || !(isControlSignal(inCatch) || this.exceptionClassOf(inCatch) !== undefined)) throw inCatch;
          pending = inCatch;
          hasPending = true;
        } finally {
          frame.current = outer;
        }
      }
    }
    if (s.finally) yield* this.blockIn(s.finally, outer, 'finally');
    if (hasPending) throw pending;
  }

  /** try-with-resources: open the resources in order (visible only in the try), close the opened ones in reverse. */
  private *withResources(s: B.BTry, outer: Scope): Gen<void> {
    const frame = this.top();
    const resourceScope: Scope = { vars: new Map(), parent: outer, label: 'try' };
    frame.current = resourceScope;
    const opened: { value: JavaValue; name: string }[] = [];
    let pending: unknown;
    let hasPending = false;
    try {
      for (const r of s.resources) {
        if (r.kind === 'LocalDecl') {
          this.stepAt(r.range.line);
          const d = r.declarators[0];
          const value = d.init ? (this.isPure(d.init) ? this.pv(d.init) : yield* this.gv(d.init)) : javaNull();
          this.declare(frame, resourceScope, d.local, value);
          opened.push({ value, name: d.local.name });
        } else {
          const expr = r as B.BExpr;
          opened.push({ value: this.isPure(expr) ? this.pv(expr) : yield* this.gv(expr), name: this.text(expr) });
        }
      }
      yield* this.blockIn(s.block, resourceScope, 'try');
    } catch (thrown) {
      const e = this.atFailureSite(thrown);
      if (e instanceof HaltSignal || !(isControlSignal(e) || this.exceptionClassOf(e) !== undefined)) throw e;
      pending = e;
      hasPending = true;
    }
    for (let i = opened.length - 1; i >= 0; i--) {
      const { value, name } = opened[i];
      if (value.kind === 'null') continue;
      try {
        yield* this.callByName(value, 'close', [], name, s.range.line);
      } catch (thrown) {
        const e = this.atFailureSite(thrown);
        if (e instanceof HaltSignal || this.exceptionClassOf(e) === undefined) throw e;
        if (!hasPending) {
          pending = e;
          hasPending = true;
        }
      }
    }
    frame.current = outer;
    if (hasPending) throw pending;
  }

  /**
   * A switch statement, or (`asExpression`) expression. The first matching
   * label wins, `default` only when none matches; colon groups fall through
   * until a break (or, in an expression, a yield). The block is one scope.
   */
  private *switch_(sw: B.BSwitch, asExpression: boolean): Gen<JavaValue> {
    const frame = this.top();
    const outer = frame.current;
    const line = sw.range.line;
    const selector = this.isPure(sw.selector) ? this.pv(sw.selector) : yield* this.gv(sw.selector);
    const scope = this.pushScope('switch');
    try {
      if (selector.kind === 'null' && !sw.cases.some(c => c.labels.some(l => l.kind === 'null'))) {
        throw nullPointer(`Cannot invoke "Object.hashCode()" because "${this.text(sw.selector)}" is null`, line);
      }
      let match = -1;
      let defaultIndex = -1;
      search: for (let i = 0; i < sw.cases.length; i++) {
        const c = sw.cases[i];
        for (const label of c.labels) {
          if (label.kind === 'default') { defaultIndex = i; continue; }
          if (this.labelMatches(label, selector, scope, line)) {
            if (c.guard && !javaValueToBoolean(this.isPure(c.guard) ? this.pv(c.guard) : yield* this.gv(c.guard))) continue;
            match = i;
            break search;
          }
        }
      }
      if (match < 0) match = defaultIndex;
      if (match < 0) {
        if (asExpression) throw new InterpreterError('No case of the switch expression matched', line);
        return javaNull();
      }
      if (sw.arrow) {
        const c = sw.cases[match];
        if (c.value) return this.isPure(c.value) ? this.pv(c.value) : yield* this.gv(c.value);
        for (const st of c.body) yield* this.exec(st, []);
        if (asExpression) throw new InterpreterError('The switch expression ended without yielding a value', line);
        return javaNull();
      }
      for (let i = match; i < sw.cases.length; i++) for (const st of sw.cases[i].body) yield* this.exec(st, []);
      if (asExpression) throw new InterpreterError('The switch expression ended without yielding a value', line);
      return javaNull();
    } catch (e) {
      if (asExpression && e instanceof YieldSignal) return e.value;
      if (!asExpression && e instanceof BreakSignal && e.label === undefined) return javaNull();
      throw this.atFailureSite(e);
    } finally {
      frame.current = outer;
    }
  }

  private labelMatches(label: B.BCaseLabel, selector: JavaValue, scope: Scope, line: number): boolean {
    switch (label.kind) {
      case 'null': return selector.kind === 'null';
      case 'constant':
        if (selector.kind === 'string') return typeof label.value === 'string' && selector.value === label.value;
        if (selector.kind === 'primitive') return typeof label.value !== 'string' && javaValueToNumber(selector) === Number(label.value);
        return false;
      case 'enum': return false;
      case 'pattern': {
        if (!this.instanceOf(selector, label.type)) return false;
        if (label.binding) this.declare(this.top(), scope, label.binding, selector);
        return true;
      }
      case 'unsupported': throw new UnsupportedFeatureError(label.construct, line);
      default: return false;
    }
  }

  // ── Expressions ──

  /** Can this expression run without calling the program's code (so without yielding a frame)? */
  private isPure(e: B.BExpr): boolean {
    const cached = this.pureCache.get(e);
    if (cached !== undefined) return cached;
    const pure = this.computePure(e);
    this.pureCache.set(e, pure);
    return pure;
  }

  private computePure(e: B.BExpr): boolean {
    const p = (x: B.BExpr | undefined) => !x || this.isPure(x);
    switch (e.kind) {
      case 'Const': case 'Local': case 'This': case 'Unsupported': return true;
      case 'StaticField': return e.field.owner.isLibrary || e.field.constant !== undefined;
      case 'Field': return p(e.target);
      case 'ArrayLength': return p(e.array);
      case 'ArrayElement': return p(e.array) && p(e.index);
      case 'Call': {
        if (!e.method.owner.isLibrary) return false;
        if (!e.method.isStatic && !this.libraryReceiver(e.target)) return false;
        return p(e.target) && e.args.every(p);
      }
      case 'DynamicCall': return false;
      case 'New': return e.cls.isLibrary && e.args.every(p);
      case 'NewArray': return e.dims.every(p);
      case 'ArrayLiteral': return e.elements.every(p);
      case 'Unary': return p(e.operand);
      case 'IncDec': return this.isPure(e.target);
      case 'Binary': case 'Logical': case 'RefEquals': case 'Concat': return p(e.left) && p(e.right);
      case 'Assign': case 'CompoundAssign': return this.isPure(e.target) && p(e.value);
      case 'Conditional': return p(e.cond) && p(e.then) && p(e.else);
      case 'Convert': return p(e.expr);
      case 'InstanceOf': return p(e.expr);
      case 'SwitchExpr': return false;
    }
  }

  /** Is a library method called on this receiver surely the library's (not a program class's implementation)? */
  private libraryReceiver(target: B.BExpr | undefined): boolean {
    if (!target) return true;
    const t = target.type;
    if (t.tag === 'array') return true;
    if (t.tag !== 'class') return false;
    const sym = t.symbol;
    if (!sym.isLibrary) return false;
    if (sym.name === 'Object' || this.isSubclassSym(sym, 'Throwable')) return false;
    return !sym.isInterface || LIBRARY_ONLY_INTERFACES.has(sym.name);
  }

  private isSubclassSym(sym: ClassSymbol, name: string): boolean {
    for (let c: ClassSymbol | undefined = sym; c; c = c.superclass?.symbol) if (c.name === name) return true;
    return false;
  }

  /** The source text of an expression, for messages (`because "n.next" is null`). */
  private text(e: B.BExpr): string {
    return this.source.slice(e.range.start, e.range.end);
  }

  private line(e: B.BExpr): number {
    return this.top()?.line || e.range.line;
  }

  /** Evaluate a pure expression. */
  private pv(e: B.BExpr): JavaValue {
    switch (e.kind) {
      case 'Const': return this.constant(e);
      case 'Local': return slotReference(this.top().slots.get(e.local)!, e.local.name, this.line(e)).get();
      case 'StaticField': return this.readStatic(e.field);
      case 'Field': return this.fieldRef(this.pv(e.target), e).get();
      case 'This': return this.top().thisValue ?? javaNull();
      case 'ArrayLength': return this.arrayLength(this.pv(e.array), e);
      case 'ArrayElement': return this.elementRef(this.pv(e.array), this.pv(e.index), e).get();
      case 'Call': return this.callLibraryNow(e, e.target ? this.pv(e.target) : undefined, e.args.map(a => this.pv(a)));
      case 'New': return this.newLibrary(e, e.args.map(a => this.pv(a)));
      case 'NewArray': return this.newArray(e, e.dims.map(d => this.pv(d)));
      case 'ArrayLiteral': return this.arrayLiteral(e.type.component, e.elements.map(x => this.pv(x)));
      case 'Unary': return this.unaryOp(e, this.pv(e.operand));
      case 'IncDec': return this.incDec(e, this.refPure(e.target));
      case 'Binary': return this.binaryOp(e, this.pv(e.left), this.pv(e.right));
      case 'Logical': {
        const l = javaValueToBoolean(this.pv(e.left));
        if (e.op === '&&' ? !l : l) return javaBool(l);
        return javaBool(javaValueToBoolean(this.pv(e.right)));
      }
      case 'RefEquals': return javaBool(refEquals(this.pv(e.left), this.pv(e.right)) !== e.negate);
      case 'Concat': return this.concat(this.pv(e.left), this.pv(e.right));
      case 'Assign': {
        const ref = this.refPure(e.target);
        return ref.set(this.pv(e.value));
      }
      case 'CompoundAssign': {
        const ref = this.refPure(e.target);
        const current = ref.get();
        return ref.set(this.compound(e, current, this.pv(e.value)));
      }
      case 'Conditional': return javaValueToBoolean(this.pv(e.cond)) ? this.pv(e.then) : this.pv(e.else);
      case 'Convert': return this.convert(e, this.pv(e.expr));
      case 'InstanceOf': return this.instanceOfExpr(e, this.pv(e.expr));
      case 'Unsupported': throw new UnsupportedFeatureError(e.construct, this.line(e), e.singular ?? false);
      default: throw new InterpreterError(`Can't evaluate ${e.kind} here`, this.line(e));
    }
  }

  /** Evaluate an expression that may call the program's code, yielding frames. */
  private *gv(e: B.BExpr): Gen<JavaValue> {
    switch (e.kind) {
      case 'StaticField': {
        yield* this.initClass(e.field.owner);
        return this.readStatic(e.field);
      }
      case 'Field': return this.fieldRef(this.isPure(e.target) ? this.pv(e.target) : yield* this.gv(e.target), e).get();
      case 'ArrayLength': return this.arrayLength(this.isPure(e.array) ? this.pv(e.array) : yield* this.gv(e.array), e);
      case 'ArrayElement': {
        const array = this.isPure(e.array) ? this.pv(e.array) : yield* this.gv(e.array);
        const index = this.isPure(e.index) ? this.pv(e.index) : yield* this.gv(e.index);
        return this.elementRef(array, index, e).get();
      }
      case 'Call': {
        if (e.method.isStatic && !e.method.owner.isLibrary) yield* this.initClass(e.method.owner);
        const target = e.target ? (this.isPure(e.target) ? this.pv(e.target) : yield* this.gv(e.target)) : undefined;
        const args: JavaValue[] = [];
        for (const a of e.args) args.push(this.isPure(a) ? this.pv(a) : yield* this.gv(a));
        if (e.method.owner.isLibrary) return yield* this.callLibrary(e, target, args);
        return yield* this.callUser(e.method, e.dispatch, target, args, e);
      }
      case 'DynamicCall': {
        const target = e.target ? (this.isPure(e.target) ? this.pv(e.target) : yield* this.gv(e.target)) : undefined;
        const args: JavaValue[] = [];
        for (const a of e.args) args.push(this.isPure(a) ? this.pv(a) : yield* this.gv(a));
        if (!target) return this.callStatic(e.owner?.name ?? '?', e.name, args, this.line(e));
        return yield* this.callByName(target, e.name, args, e.target ? this.text(e.target) : '', this.line(e));
      }
      case 'New': {
        if (!e.cls.isLibrary) yield* this.initClass(e.cls);
        const args: JavaValue[] = [];
        for (const a of e.args) args.push(this.isPure(a) ? this.pv(a) : yield* this.gv(a));
        if (e.cls.isLibrary) return this.newLibrary(e, args);
        return yield* this.newUser(e, args);
      }
      case 'NewArray': {
        const dims: JavaValue[] = [];
        for (const d of e.dims) dims.push(this.isPure(d) ? this.pv(d) : yield* this.gv(d));
        return this.newArray(e, dims);
      }
      case 'ArrayLiteral': {
        const values: JavaValue[] = [];
        for (const x of e.elements) values.push(this.isPure(x) ? this.pv(x) : yield* this.gv(x));
        return this.arrayLiteral(e.type.component, values);
      }
      case 'Unary': return this.unaryOp(e, this.isPure(e.operand) ? this.pv(e.operand) : yield* this.gv(e.operand));
      case 'IncDec': return this.incDec(e, yield* this.refGen(e.target));
      case 'Binary': {
        const l = this.isPure(e.left) ? this.pv(e.left) : yield* this.gv(e.left);
        const r = this.isPure(e.right) ? this.pv(e.right) : yield* this.gv(e.right);
        return this.binaryOp(e, l, r);
      }
      case 'Logical': {
        const l = javaValueToBoolean(this.isPure(e.left) ? this.pv(e.left) : yield* this.gv(e.left));
        if (e.op === '&&' ? !l : l) return javaBool(l);
        return javaBool(javaValueToBoolean(this.isPure(e.right) ? this.pv(e.right) : yield* this.gv(e.right)));
      }
      case 'RefEquals': {
        const l = this.isPure(e.left) ? this.pv(e.left) : yield* this.gv(e.left);
        const r = this.isPure(e.right) ? this.pv(e.right) : yield* this.gv(e.right);
        return javaBool(refEquals(l, r) !== e.negate);
      }
      case 'Concat': {
        const l = this.isPure(e.left) ? this.pv(e.left) : yield* this.gv(e.left);
        const r = this.isPure(e.right) ? this.pv(e.right) : yield* this.gv(e.right);
        return this.concat(l, r);
      }
      case 'Assign': {
        if (e.target.kind === 'StaticField') {
          // putstatic comes after the right-hand side, so C.x = f() runs f() before initializing C.
          const value = this.isPure(e.value) ? this.pv(e.value) : yield* this.gv(e.value);
          yield* this.initClass(e.target.field.owner);
          return this.staticRef(e.target.field).set(value);
        }
        const ref = yield* this.refGen(e.target);
        return ref.set(this.isPure(e.value) ? this.pv(e.value) : yield* this.gv(e.value));
      }
      case 'CompoundAssign': {
        const ref = yield* this.refGen(e.target);
        const current = ref.get();
        const value = this.isPure(e.value) ? this.pv(e.value) : yield* this.gv(e.value);
        return ref.set(this.compound(e, current, value));
      }
      case 'Conditional': {
        const c = javaValueToBoolean(this.isPure(e.cond) ? this.pv(e.cond) : yield* this.gv(e.cond));
        const branch = c ? e.then : e.else;
        return this.isPure(branch) ? this.pv(branch) : yield* this.gv(branch);
      }
      case 'Convert': return this.convert(e, this.isPure(e.expr) ? this.pv(e.expr) : yield* this.gv(e.expr));
      case 'InstanceOf': return this.instanceOfExpr(e, this.isPure(e.expr) ? this.pv(e.expr) : yield* this.gv(e.expr));
      case 'SwitchExpr': return yield* this.switch_(e.switch, true);
      default: return this.pv(e);
    }
  }

  private constant(e: B.BConst): JavaValue {
    let v = this.constCache.get(e);
    if (!v) {
      v = e.value === null ? javaNull() : constValue(e.value, e.type);
      this.constCache.set(e, v);
    }
    return v;
  }

  private readStatic(field: FieldSymbol): JavaValue {
    if (field.owner.isLibrary) {
      const v = this.libraryStatic(field);
      if (!v) throw new InterpreterError(`Unknown field: ${field.owner.name}.${field.name}`, this.top()?.line ?? 0);
      return v;
    }
    return this.classes.get(field.owner)!.statics.get(field.name)!.value;
  }

  private libraryStatic(field: FieldSymbol): JavaValue | undefined {
    if (field.owner.name === 'System') {
      if (field.name === 'out') return { kind: 'objectRef', heapId: SYSTEM_OUT_ID, className: 'PrintStream' };
      if (field.name === 'err') return { kind: 'objectRef', heapId: SYSTEM_ERR_ID, className: 'PrintStream' };
      if (field.name === 'in') return { kind: 'objectRef', heapId: SYSTEM_IN_ID, className: 'InputStream' };
    }
    const v = getStaticField(field.owner.name, field.name, this.ctx);
    return v ? this.toStatic(v, field.type) : undefined;
  }

  // ── References (what assignment, ++ and compound assignment write) ──

  private refPure(lv: B.BLValue): Reference {
    switch (lv.kind) {
      case 'Local': return slotReference(this.top().slots.get(lv.local)!, lv.local.name, this.line(lv));
      case 'StaticField': return this.staticRef(lv.field);
      case 'Field': return this.fieldRef(this.pv(lv.target), lv);
      case 'ArrayElement': return this.elementRef(this.pv(lv.array), this.pv(lv.index), lv);
    }
  }

  private *refGen(lv: B.BLValue): Gen<Reference> {
    switch (lv.kind) {
      case 'Local': return slotReference(this.top().slots.get(lv.local)!, lv.local.name, this.line(lv));
      case 'StaticField':
        yield* this.initClass(lv.field.owner);
        return this.staticRef(lv.field);
      case 'Field': return this.fieldRef(this.isPure(lv.target) ? this.pv(lv.target) : yield* this.gv(lv.target), lv);
      case 'ArrayElement': {
        const array = this.isPure(lv.array) ? this.pv(lv.array) : yield* this.gv(lv.array);
        const index = this.isPure(lv.index) ? this.pv(lv.index) : yield* this.gv(lv.index);
        return this.elementRef(array, index, lv);
      }
    }
  }

  private staticRef(field: FieldSymbol): Reference {
    const slot = this.classes.get(field.owner)!.statics.get(field.name)!;
    return slotReference(slot, field.name, this.top()?.line ?? 0);
  }

  private fieldRef(target: JavaValue, e: B.BField): Reference {
    return fieldReference(this.heap, target, this.fieldKey(target, e.field), runtimeTypeName(e.field.type), this.text(e.target), this.line(e));
  }

  /** Where an object keeps a field: under its name, unless a subclass of the field's class declares the same name. */
  private fieldKey(target: JavaValue, field: FieldSymbol): string {
    if (!this.hidesFields || target.kind !== 'objectRef') return field.name;
    const cls = this.byName.get(target.className);
    return (cls && this.layout(cls).get(field)) ?? field.name;
  }

  /**
   * The instance fields of a class's objects (JLS §8.3), its superclasses'
   * first, each with its key: its name, or `Owner.name` for one hidden by a
   * field of the same name in a subclass, so both are kept (and drawn).
   */
  private layout(cls: ClassSymbol): Map<FieldSymbol, string> {
    let keys = this.layouts.get(cls);
    if (keys) return keys;
    const chain: ClassSymbol[] = [];
    for (let c: ClassSymbol | undefined = cls; c && !c.isLibrary; c = c.superclass?.symbol) chain.push(c);
    const taken = new Set<string>();
    const named = new Map<FieldSymbol, string>();
    for (const c of chain) {
      for (const f of c.fields.values()) {
        if (f.isStatic) continue;
        named.set(f, taken.has(f.name) ? `${c.name}.${f.name}` : f.name);
        taken.add(f.name);
      }
    }
    keys = new Map();
    for (const c of chain.reverse()) for (const f of c.fields.values()) if (!f.isStatic) keys.set(f, named.get(f)!);
    this.layouts.set(cls, keys);
    return keys;
  }

  private elementRef(array: JavaValue, index: JavaValue, e: B.BArrayElement): Reference {
    const component = e.array.type.tag === 'array' ? runtimeTypeName(e.array.type.component) : undefined;
    return arrayElementReference(this.heap, array, javaValueToNumber(index), this.text(e.array), this.line(e), component);
  }

  private arrayLength(array: JavaValue, e: B.BArrayLength): JavaValue {
    if (array.kind === 'null') throw nullPointer(`Cannot read the array length because "${this.text(e.array)}" is null`, this.line(e));
    const arr = array.kind === 'arrayRef' ? this.heap.get(array.heapId) : undefined;
    return javaInt(arr && isJavaArray(arr) ? arr.elements.length : 0);
  }

  // ── Operators ──

  private unaryOp(e: B.BUnary, v: JavaValue): JavaValue {
    if (e.op === '!') return javaBool(!javaValueToBoolean(v));
    return this.numeric(() => unaryOperation(e.op, this.primitive(v, e)));
  }

  private binaryOp(e: B.BBinary, l: JavaValue, r: JavaValue): JavaValue {
    if (e.type.tag === 'dynamic') {
      // Operands of a type the binder didn't know: a string makes it a concatenation, null an NPE.
      if (e.op === '+' && (l.kind === 'string' || r.kind === 'string')) return this.concat(l, r);
      if ((e.op === '==' || e.op === '!=') && (l.kind !== 'primitive' || r.kind !== 'primitive')) return javaBool(refEquals(l, r) !== (e.op === '!='));
    }
    return this.numeric(() => binaryOperation(e.op, this.primitive(l, e), this.primitive(r, e)));
  }

  /** A primitive operand: unboxed; null is the NullPointerException unboxing would throw. */
  private primitive(v: JavaValue, e: B.BExpr): JavaPrimitive {
    if (v.kind === 'primitive') return v;
    if (v.kind === 'null') throw nullPointer('Cannot unbox a null value', this.line(e));
    throw new InterpreterError(`A ${v.kind === 'string' ? 'String' : 'reference'} isn't a number`, this.line(e));
  }

  /** Run numeric code, giving an error it raises (line 0) the current line. */
  private numeric<T>(f: () => T): T {
    try {
      return f();
    } catch (err) {
      if (err instanceof JavaRuntimeError && err.line === 0) throw new JavaRuntimeError(err.className, err.detail, this.top()?.line ?? 0);
      if (err instanceof InterpreterError && err.line === 0) throw new InterpreterError(err.reason, this.top()?.line ?? 0);
      throw err;
    }
  }

  private concat(l: JavaValue, r: JavaValue): JavaValue {
    return javaString(this.stringify(l) + this.stringify(r));
  }

  /** `x op= v`: the operation on x's value, converted back to x's type (JLS §15.26.2). */
  private compound(e: B.BCompoundAssign, current: JavaValue, value: JavaValue): JavaValue {
    if (e.concat) return this.concat(current, value);
    const target = e.target.type;
    const prim = this.primitive(current, e);
    const result = this.numeric(() => binaryOperation(e.op, prim, this.primitive(value, e)));
    const p = target.tag === 'primitive' ? target.name : unboxedType(target)?.name ?? prim.javaType;
    const narrowed = castPrimitive(result, p as JavaPrimitiveType);
    return target.tag === 'primitive' ? narrowed : this.box(narrowed);
  }

  private incDec(e: B.BIncDec, ref: Reference): JavaValue {
    const old = ref.get();
    const prim = this.primitive(old, e);
    const next = stepped(prim.boxed ? { kind: 'primitive', javaType: prim.javaType, value: prim.value } : prim, e.op === '++' ? 1 : -1);
    const stored = ref.set(e.type.tag === 'primitive' ? next : this.box(next));
    return e.prefix ? stored : old;
  }

  /** A conversion node: primitive widening/narrowing, boxing, unboxing, or a checked cast. */
  private convert(e: B.BConvert, v: JavaValue): JavaValue {
    switch (e.conversion) {
      case 'widen': case 'narrow':
        if (v.kind === 'primitive' && e.type.tag === 'primitive') return castPrimitive(v, e.type.name as JavaPrimitiveType);
        return v;
      case 'box': return this.box(v);
      case 'unbox': return this.unbox(v, e.expr);
      case 'checkcast': return this.checkcast(v, e);
    }
  }

  private box(v: JavaValue): JavaValue {
    if (v.kind !== 'primitive' || v.boxed) return v;
    const cacheable = (v.javaType === 'int' || v.javaType === 'short' || v.javaType === 'byte' || v.javaType === 'long')
      ? Number(v.value) >= -128 && Number(v.value) <= 127
      : v.javaType === 'char' ? Number(v.value) <= 127 : v.javaType === 'boolean';
    if (!cacheable) return { ...v, boxed: true };
    const key = `${v.javaType}:${String(v.value)}`;
    let cached = this.boxCache.get(key);
    if (!cached) this.boxCache.set(key, (cached = { ...v, boxed: true }));
    return cached;
  }

  private unbox(v: JavaValue, source: B.BExpr): JavaValue {
    if (v.kind === 'null') {
      const box = source.type.tag === 'class' ? source.type.symbol.name : 'Integer';
      const p = unboxedType(source.type)?.name ?? 'int';
      throw nullPointer(`Cannot invoke "java.lang.${box}.${p}Value()" because "${this.text(source)}" is null`, this.line(source));
    }
    if (v.kind === 'primitive' && v.boxed) return { kind: 'primitive', javaType: v.javaType, value: v.value };
    return v;
  }

  /** A cast to a reference type (or from a value whose type wasn't known), checked as Java checks it. */
  private checkcast(v: JavaValue, e: B.BConvert): JavaValue {
    const t = e.type;
    if (t.tag === 'primitive') {
      // From a dynamic value: a number of whatever type, converted.
      if (v.kind === 'null') throw nullPointer(`Cannot cast null to ${t.name}`, this.line(e));
      if (v.kind === 'primitive') return assignmentConversion(this.unbox(v, e.expr), t.name);
      throw new JavaRuntimeError('ClassCastException', `class ${this.runtimeClassName(v)} cannot be cast to class ${BOXES[t.name as JavaPrimitiveType]}`, this.line(e));
    }
    if (v.kind === 'null') return v;
    if (t.tag === 'class' && v.kind === 'primitive' && !v.boxed) v = this.box(v);
    if (t.tag === 'typevar' || t.tag === 'dynamic' || t.tag === 'error') return v;
    if (!this.instanceOf(v, t)) {
      throw new JavaRuntimeError('ClassCastException', `class ${this.runtimeClassName(v)} cannot be cast to class ${this.typeText(t)}`, this.line(e));
    }
    return v;
  }

  private typeText(t: JType): string {
    const e = erasure(t);
    if (e.tag === 'class') return e.symbol.isLibrary ? qualifiedLibraryName(e.symbol.name) : e.symbol.binaryName;
    return runtimeTypeName(e);
  }

  private runtimeClassName(value: JavaValue): string {
    switch (value.kind) {
      case 'string': return 'java.lang.String';
      case 'primitive': return `java.lang.${BOXES[value.javaType]}`;
      case 'arrayRef': {
        const arr = this.heap.get(value.heapId);
        return arr && isJavaArray(arr) ? arrayClassName(arr.elementType, n => this.javaClassName(n)) : '[Ljava.lang.Object;';
      }
      case 'objectRef': return this.javaClassName(value.className);
      case 'null': return 'null';
    }
  }

  private instanceOfExpr(e: B.BInstanceOf, v: JavaValue): JavaValue {
    const ok = this.instanceOf(v, e.target);
    if (ok && e.binding) {
      const frame = this.top();
      this.declare(frame, frame.current, e.binding, v);
    }
    return javaBool(ok);
  }

  /** `value instanceof type`: the program's classes and interfaces, library types, boxes, arrays. */
  private instanceOf(value: JavaValue, type: JType): boolean {
    if (value.kind === 'null') return false;
    const t = erasure(type);
    if (t.tag === 'dynamic' || t.tag === 'error') return true;
    if (t.tag === 'array') {
      if (value.kind !== 'arrayRef') return false;
      const arr = this.heap.get(value.heapId);
      return !!arr && isJavaArray(arr) && this.arrayElementAssignable(arr.elementType, runtimeTypeName(t.component));
    }
    if (t.tag !== 'class') return false;
    const name = t.symbol.name;
    switch (value.kind) {
      case 'string': return isStringType(name);
      case 'primitive': return isBoxedInstanceOf(value.javaType, name);
      case 'arrayRef': return ['Object', 'Cloneable', 'Serializable'].includes(name);
      case 'objectRef':
        return isBuiltinObject(this.heap.get(value.heapId)) ? isLibrarySubtype(value.className, name) : this.isSubclass(value.className, name);
    }
  }

  private arrayElementAssignable(elementType: string, target: string): boolean {
    const prims = ['int', 'long', 'short', 'byte', 'char', 'float', 'double', 'boolean'];
    if (prims.includes(elementType) || prims.includes(target)) return elementType === target;
    const ea = elementType.endsWith('[]'), ta = target.endsWith('[]');
    if (ea && ta) return this.arrayElementAssignable(elementType.slice(0, -2), target.slice(0, -2));
    if (ea) return ['Object', 'Cloneable', 'Serializable'].includes(target);
    return !ta && this.isSubclass(elementType, target);
  }

  // ── Arrays ──

  private newArray(e: B.BNewArray, dims: JavaValue[]): JavaValue {
    const lengths = dims.map(d => Math.trunc(javaValueToNumber(d)));
    const negative = lengths.find(n => n < 0);
    if (negative !== undefined) throw new JavaRuntimeError('NegativeArraySizeException', String(negative), this.line(e));
    return this.allocArrayOfLengths(e.type, lengths);
  }

  private allocArrayOfLengths(type: JType, lengths: number[]): JavaValue {
    const component = type.tag === 'array' ? type.component : type;
    const [length, ...inner] = lengths;
    const elementType = runtimeTypeName(component);
    const elements: JavaValue[] = [];
    for (let i = 0; i < length; i++) elements.push(inner.length > 0 ? this.allocArrayOfLengths(component, inner) : defaultValue(elementType));
    return { kind: 'arrayRef', heapId: this.allocArray(elementType, elements) };
  }

  private arrayLiteral(component: JType, values: JavaValue[]): JavaValue {
    return { kind: 'arrayRef', heapId: this.allocArray(runtimeTypeName(component), values) };
  }

  // ── Calls ──

  /** The program's method a call runs: for a virtual call, the receiver's class's override, if any. */
  private target(method: MethodSymbol, dispatch: B.BCall['dispatch'], receiver: JavaValue | undefined): MethodSymbol {
    if (dispatch !== 'virtual' || receiver?.kind !== 'objectRef') return method;
    const cls = this.byName.get(receiver.className);
    if (!cls || cls === method.owner) return method;
    return this.findOverride(cls, method) ?? method;
  }

  /**
   * The method of `cls` (or the nearest superclass) that overrides `method`
   * (JLS §8.4.8): same name, and the same parameter types once `method`'s
   * are seen from `cls`, its supertypes' type arguments substituted, and
   * erased. So `cmp(Point a)` overrides `Cmp<T>.cmp(T a)` in a class that
   * implements `Cmp<Point>`.
   */
  private findOverride(cls: ClassSymbol, method: MethodSymbol): MethodSymbol | undefined {
    let byClass = this.overrides.get(method);
    if (!byClass) this.overrides.set(method, (byClass = new Map()));
    if (byClass.has(cls)) return byClass.get(cls);
    let found: MethodSymbol | undefined;
    const implementation = (c: ClassSymbol) => {
      const view = asSuper(classType(c, c.typeParams), method.owner);
      const map = view ? typeArgMap(view) : new Map<number, JType>();
      const wanted = method.params.map(p => runtimeTypeName(erasure(substitute(p.type, map))));
      return (c.methods.get(method.name) ?? []).find(m => !m.isStatic && m.arity === method.arity && this.methods.get(m)?.body
        && m.params.every((p, i) => runtimeTypeName(erasure(p.type)) === wanted[i]));
    };
    for (let c: ClassSymbol | undefined = cls; c && !c.isLibrary && !found; c = c.superclass?.symbol) found = implementation(c);
    // No class implements it: a default method of an interface the class implements.
    const interfaces: ClassSymbol[] = [];
    for (let c: ClassSymbol | undefined = cls; c && !c.isLibrary; c = c.superclass?.symbol) interfaces.push(...c.interfaces.map(i => i.symbol));
    for (let i = 0; i < interfaces.length && !found; i++) {
      const iface = interfaces[i];
      if (iface.isLibrary) continue;
      found = implementation(iface);
      for (const s of iface.interfaces) if (!interfaces.includes(s.symbol)) interfaces.push(s.symbol);
    }
    byClass.set(cls, found);
    return found;
  }

  private *callUser(method: MethodSymbol, dispatch: B.BCall['dispatch'], receiver: JavaValue | undefined, args: JavaValue[], e: B.BExpr): Gen<JavaValue> {
    if (!method.isStatic) {
      if (!receiver || receiver.kind === 'null') {
        const target = e.kind === 'Call' ? e.target : undefined;
        throw nullPointer(`Cannot invoke "${this.methodText(method, target)}" because "${target ? this.text(target) : 'this'}" is null`, this.line(e));
      }
    }
    const actual = this.target(method, dispatch, receiver);
    const frame = this.methodFrame(actual, receiver, args, this.line(e));
    const value = yield frame;
    return value ?? javaNull();
  }

  /** A frame for one of the program's methods, its parameters bound. */
  private methodFrame(method: MethodSymbol, receiver: JavaValue | undefined, args: JavaValue[], line: number): Frame {
    const bm = this.methods.get(method);
    if (!bm?.body) throw new InterpreterError(`${method.name}() is abstract, so it has no code to run`, line);
    // A method the receiver's class inherited is shown with its class: Animal.describe.
    const inherited = !method.isStatic && receiver?.kind === 'objectRef' && receiver.className !== method.owner.name;
    const frame = this.newFrame(inherited ? `${method.owner.name}.${method.name}` : method.name, 'method', method.owner,
      method.isStatic ? undefined : receiver, method.name);
    bm.params.forEach((p, i) => this.declare(frame, frame.scope, p, args[i] ?? javaNull()));
    const decl = method.decl;
    frame.gen = this.runBody(frame, bm.body, decl?.range.line);
    return frame;
  }

  /**
   * Run one of the program's methods to completion now, on the same frames
   * (a library callback, such as a toString() for println, or compareTo() for
   * a sort). `quiet` records no steps inside it, so the call is atomic.
   */
  private callNow(method: MethodSymbol, receiver: JavaValue, args: JavaValue[], quiet: boolean): JavaValue {
    const frame = this.methodFrame(method, receiver, args, this.top()?.line ?? 0);
    if (quiet) this.suppress++;
    try {
      return this.drive(callFrame(frame)) ?? javaNull();
    } finally {
      if (quiet) this.suppress--;
    }
  }

  /** The program's instance method of this name and arity in a user object's class (for library code calling back: toString, compareTo, …). */
  private userMethod(value: JavaValue, name: string, arity: number): MethodSymbol | undefined {
    if (value.kind !== 'objectRef' || isBuiltinObject(this.heap.get(value.heapId))) return undefined;
    for (let c: ClassSymbol | undefined = this.byName.get(value.className); c && !c.isLibrary; c = c.superclass?.symbol) {
      const m = (c.methods.get(name) ?? []).find(x => !x.isStatic && x.arity === arity && this.methods.get(x)?.body);
      if (m) return m;
    }
    return undefined;
  }

  /** ctx.invokeUserMethod: a user class's own method, run atomically; undefined if it has none. */
  private invokeUser(ref: JavaValue, name: string, args: JavaValue[]): JavaValue | undefined {
    const method = this.userMethod(ref, name, args.length);
    return method ? this.callNow(method, ref, args, true) : undefined;
  }

  /** A call of a library method from the generator: one a program class implements (compareTo, toString, …) runs as a frame. */
  private *callLibrary(e: B.BCall, target: JavaValue | undefined, args: JavaValue[]): Gen<JavaValue> {
    if (target && !e.method.isStatic && e.dispatch !== 'special') {
      const own = this.userMethod(target, e.method.name, args.length);
      if (own) {
        const frame = this.methodFrame(own, target, args, this.line(e));
        return (yield frame) ?? javaNull();
      }
    }
    return this.callLibraryNow(e, target, args);
  }

  /** A call of a library method (the stdlib runs it); a program class's implementation runs at once. */
  private callLibraryNow(e: B.BCall, target: JavaValue | undefined, args: JavaValue[]): JavaValue {
    const line = this.line(e);
    const m = e.method;
    if (m.isStatic) return this.toStatic(this.callStatic(m.owner.name, m.name, args, line), e.type);
    if (!target || target.kind === 'null') {
      throw nullPointer(`Cannot invoke "${this.methodText(m, e.target)}" because "${e.target ? this.text(e.target) : 'this'}" is null`, line);
    }
    // super.toString() and the like run Object's (or Throwable's) own method, whatever the class overrides.
    if (e.dispatch === 'special' && target.kind === 'objectRef') return this.toStatic(this.objectMethod(target, m.name, args, line), e.type);
    const own = this.userMethod(target, m.name, args.length);
    if (own) return this.callNow(own, target, args, false);
    return this.toStatic(this.instanceCall(target, m.name, args, e.target ? this.text(e.target) : '', line), e.type);
  }

  /** A library class's own implementation of an instance method on a program's object: Object's and Throwable's. */
  private objectMethod(target: JavaObjectRef, name: string, args: JavaValue[], line: number): JavaValue {
    switch (name) {
      case 'toString': return javaString(this.ownString(target));
      case 'equals': return javaBool(args[0]?.kind === 'objectRef' && args[0].heapId === target.heapId);
      case 'hashCode': return javaInt(identityHashCode(target.heapId));
      case 'clone': {
        if (!this.isSubclass(target.className, 'Cloneable')) throw new JavaRuntimeError('CloneNotSupportedException', this.binaryName(target.className), line);
        const obj = this.heap.get(target.heapId) as JavaObject;
        return { kind: 'objectRef', heapId: this.allocObject(target.className, new Map(obj.fields)), className: target.className };
      }
    }
    return this.instanceCall(target, name, args, 'super', line);
  }

  /**
   * A method as a helpful NullPointerException names it: the receiver's
   * static class and the erased parameter types, `Main$Node.link(Main$Node, int)`,
   * `java.util.List.add(Object)`, `String.length()`.
   */
  private methodText(m: MethodSymbol, target: B.BExpr | undefined): string {
    const t = target ? erasure(target.type) : undefined;
    const holder = t?.tag === 'class' ? t.symbol : m.owner;
    return `${npeClassName(holder)}.${m.name}(${m.params.map(p => npeTypeText(p.type)).join(', ')})`;
  }

  /** A library value converted to its static type: boxed where the type is a reference, unboxed where it is primitive. */
  private toStatic(v: JavaValue, t: JType): JavaValue {
    if (v.kind !== 'primitive') return v;
    if (t.tag === 'primitive') return v.boxed ? { kind: 'primitive', javaType: v.javaType, value: v.value } : v;
    if (t.tag === 'class' || t.tag === 'typevar') return this.box(v);
    return v;
  }

  private callStatic(className: string, name: string, args: JavaValue[], line: number): JavaValue {
    const result = this.stdlib(line, () => callStaticMethod(className, name, args, this.ctx));
    if (result === undefined) throw new InterpreterError(`Unknown method: ${className}.${name}()`, line);
    return result;
  }

  /** A method by name on a value (dynamic calls, and close() for try-with-resources). */
  private *callByName(target: JavaValue, name: string, args: JavaValue[], text: string, line: number): Gen<JavaValue> {
    if (target.kind === 'null') throw nullPointer(`Cannot invoke "${name}()" because "${text}" is null`, line);
    const own = this.userMethod(target, name, args.length);
    if (own) {
      const frame = this.methodFrame(own, target, args, line);
      return (yield frame) ?? javaNull();
    }
    return this.instanceCall(target, name, args, text, line);
  }

  /** A library instance method on a value: strings, boxes, System.out, StringBuilder, collections, exceptions, Object's methods. */
  private instanceCall(target: JavaValue, name: string, args: JavaValue[], text: string, line: number): JavaValue {
    if (name === 'getClass' && args.length === 0) return this.classObject(target);
    if (target.kind === 'string') {
      const r = this.stdlib(line, () => stringMethod(target, name, args, this.ctx));
      if (r !== undefined) return r;
    } else if (target.kind === 'primitive') {
      const r = this.stdlib(line, () => boxedMethod(target, name, args, this.ctx));
      if (r !== undefined) return r;
    } else if (target.kind === 'arrayRef') {
      if (name === 'clone') {
        // A new array with the same elements (a shallow copy), JLS §10.7.
        const arr = this.heap.get(target.heapId);
        if (arr && isJavaArray(arr)) return { kind: 'arrayRef', heapId: this.allocArray(arr.elementType, [...arr.elements]) };
      }
      if (name === 'toString') return javaString(this.stringify(target));
      if (name === 'equals') return javaBool(args[0]?.kind === 'arrayRef' && args[0].heapId === target.heapId);
      if (name === 'hashCode') return javaInt(identityHashCode(target.heapId));
    } else if (target.kind === 'objectRef') {
      if (target.heapId === SYSTEM_OUT_ID || target.heapId === SYSTEM_ERR_ID) return this.printStream(name, args, text, line, target.heapId === SYSTEM_ERR_ID);
      const obj = this.heap.get(target.heapId);
      if (isBuiltinObject(obj) && target.className === 'Class') {
        const r = this.classMethod(target, name);
        if (r) return r;
      }
      if (isBuiltinObject(obj)) {
        if (name === 'printStackTrace' && args.length === 0 && this.isThrowable(target)) {
          this.appendStderr(this.stackTraceText(target));
          return javaNull();
        }
        if (target.className === 'StringBuilder' || target.className === 'StringBuffer') {
          const r = this.stdlib(line, () => stringBuilderMethod(target, name, args, this.ctx));
          if (r !== undefined) return r;
        } else {
          const r = this.stdlib(line, () => callInstanceMethod(target, name, args, this.ctx));
          if (r !== undefined) return r;
        }
      }
      if (this.isThrowable(target)) {
        if (name === 'printStackTrace') {
          this.appendStderr(this.stackTraceText(target));
          return javaNull();
        }
        if (['getMessage', 'getLocalizedMessage', 'toString', 'getCause'].includes(name)) return exceptionMethod(target, name, this.ctx) ?? javaNull();
      }
      if (name === 'equals' && args.length === 1) return javaBool(args[0].kind === 'objectRef' && args[0].heapId === target.heapId);
      if (name === 'hashCode' && args.length === 0) return javaInt(identityHashCode(target.heapId));
      if (name === 'toString' && args.length === 0) return javaString(this.stringify(target));
    }
    throw new InterpreterError(`Unknown method: ${text || 'value'}.${name}()`, line);
  }

  /**
   * `value.getClass()`: the value's Class object, one per class (so
   * `getClass() == o.getClass()` compares classes), showing its name.
   */
  private classObject(value: JavaValue): JavaValue {
    const name = this.runtimeClassName(value);
    let ref = this.classObjects.get(name);
    if (!ref) {
      const fields = new Map<string, JavaValue>([['name', javaString(name)], ['__simpleName__', javaString(this.simpleClassName(value))]]);
      ref = { kind: 'objectRef', heapId: this.allocObject('Class', fields, true), className: 'Class' };
      this.classObjects.set(name, ref);
    }
    return ref;
  }

  /** The methods of a Class object JavaTutor has: getName, getSimpleName, toString. */
  private classMethod(cls: JavaObjectRef, name: string): JavaValue | undefined {
    const fields = (this.heap.get(cls.heapId) as JavaObject).fields;
    switch (name) {
      case 'getName': case 'getTypeName': return fields.get('name');
      case 'getSimpleName': return fields.get('__simpleName__');
      case 'toString': return javaString(`class ${javaValueToString(fields.get('name')!, this.heap)}`);
    }
    return undefined;
  }

  /** Class.getSimpleName(): `Dog` for Main$Dog, `String`, `int[]`. */
  private simpleClassName(value: JavaValue): string {
    switch (value.kind) {
      case 'string': return 'String';
      case 'primitive': return BOXES[value.javaType];
      case 'arrayRef': {
        const arr = this.heap.get(value.heapId);
        return `${arr && isJavaArray(arr) ? arr.elementType : 'Object'}[]`;
      }
      case 'objectRef': return value.className;
      case 'null': return 'null';
    }
  }

  /** System.out, or with `err` System.err. */
  private printStream(name: string, args: JavaValue[], text: string, line: number, err: boolean): JavaValue {
    const write = (s: string) => (err ? this.appendStderr(s) : this.appendStdout(s));
    switch (name) {
      case 'println':
        write((args.length > 0 ? charArrayText(args[0], this.ctx) ?? this.stringify(args[0]) : '') + '\n');
        return javaNull();
      case 'print':
        write(args.length > 0 ? charArrayText(args[0], this.ctx) ?? this.stringify(args[0]) : '');
        return javaNull();
      case 'printf': case 'format': {
        const fmt = args.length > 0 ? javaValueToString(args[0], this.heap) : '';
        write(this.stdlib(line, () => javaFormat(fmt, args.slice(1), this.heap, v => this.stringify(v))));
        return javaNull();
      }
      case 'flush': return javaNull();
    }
    throw new InterpreterError(`Unknown method: ${text}.${name}()`, line);
  }

  private stdlib<T>(line: number, call: () => T): T {
    try {
      return call();
    } catch (e) {
      if (e instanceof StdlibError) throw new InterpreterError(e.message, line);
      throw e;
    }
  }

  // ── Objects ──

  private newLibrary(e: B.BNew, args: JavaValue[]): JavaValue {
    const line = this.line(e);
    const name = e.cls.name;
    if (name === 'Object') return { kind: 'objectRef', heapId: this.allocObject('Object', new Map(), true), className: 'Object' };
    if (name === 'String') return this.stdlib(line, () => newString(args, this.ctx));
    if (name === 'StringBuilder' || name === 'StringBuffer') {
      const initial = args.length > 0 && args[0].kind !== 'primitive' ? javaValueToString(args[0], this.heap) : '';
      return { kind: 'objectRef', heapId: this.allocObject(name, new Map([['value', javaString(initial)]]), true), className: name };
    }
    const built = this.stdlib(line, () => newBuiltin(name, args, this.ctx));
    if (!built) throw new UnsupportedFeatureError(`The ${name} class`, line, true);
    if (built.kind === 'objectRef' && this.isThrowable(built)) this.exceptionTraces.set(built.heapId, this.stackTrace(line));
    return built;
  }

  /** `new C(…)` for a program class: the object with the default value of every field of its class chain, then its constructor. */
  private *newUser(e: B.BNew, args: JavaValue[]): Gen<JavaValue> {
    const cls = e.cls;
    const fields = new Map<string, JavaValue>();
    for (const [f, key] of this.layout(cls)) fields.set(key, defaultValue(runtimeTypeName(f.type)));
    const heapId = this.allocObject(cls.name, fields);
    const self: JavaObjectRef = { kind: 'objectRef', heapId, className: cls.name };
    if (this.isThrowable(self)) this.exceptionTraces.set(heapId, this.stackTrace(this.line(e)));
    yield* this.construct(cls, e.ctor, self, args);
    return self;
  }

  /**
   * One constructor call (JLS §12.5): parameters bound, then `this(…)`, or
   * the superclass constructor (a frame of its own for a program's class)
   * and the instance initializers, then the body. A class's default
   * constructor gets a frame only if it runs something: a program's
   * superclass constructor or initializers.
   */
  private *construct(cls: ClassSymbol, ctor: MethodSymbol | undefined, self: JavaObjectRef, args: JavaValue[]): Gen<void> {
    const rt = this.classes.get(cls)!;
    const bm = ctor ? this.methods.get(ctor) : undefined;
    if (!bm?.body) {
      const call = bm?.explicitCall;
      if (rt.bound.instanceInit.length === 0 && !(call?.ctor && !call.ctor.owner.isLibrary)) {
        if (call) this.superConstructor(cls, self, []);
        return;
      }
      const frame = this.newFrame(cls.name, 'constructor', cls, self);
      frame.gen = this.runDefaultConstructor(frame, rt, call, self);
      yield frame;
      return;
    }
    const frame = this.newFrame(cls.name, 'constructor', cls, self);
    bm.params.forEach((p, i) => this.declare(frame, frame.scope, p, args[i] ?? javaNull()));
    frame.gen = this.runConstructor(frame, rt, bm, self);
    yield frame;
  }

  private *runDefaultConstructor(frame: Frame, rt: ClassRuntime, call: B.BMethod['explicitCall'], self: JavaObjectRef): Gen<undefined> {
    if (call) yield* this.superCall(call, rt, self, []);
    yield* this.instanceInit(frame, rt);
    return undefined;
  }

  private *runConstructor(frame: Frame, rt: ClassRuntime, bm: B.BMethod, self: JavaObjectRef): Gen<undefined> {
    const decl = bm.symbol.decl!;
    this.stepAt(decl.range.line);
    const call = bm.explicitCall;
    if (call && !call.implicit) {
      this.stepAt(call.range.line);
      const args: JavaValue[] = [];
      for (const a of call.args) args.push(this.isPure(a) ? this.pv(a) : yield* this.gv(a));
      if (call.target === 'this') {
        yield* this.construct(rt.bound.symbol, call.ctor, self, args);
      } else {
        yield* this.superCall(call, rt, self, args);
        yield* this.instanceInit(frame, rt);
      }
    } else {
      if (call) yield* this.superCall(call, rt, self, []);
      yield* this.instanceInit(frame, rt);
    }
    yield* this.runBody(frame, bm.body!, undefined);
    return undefined;
  }

  /** `super(…)`: a program's superclass runs its constructor; a library exception records the message and cause. */
  private *superCall(call: NonNullable<B.BMethod['explicitCall']>, rt: ClassRuntime, self: JavaObjectRef, args: JavaValue[]): Gen<void> {
    const sup = call.ctor?.owner;
    if (sup && !sup.isLibrary) yield* this.construct(sup, call.ctor, self, args);
    else this.superConstructor(rt.bound.symbol, self, args);
  }

  /** The superclass constructor: Object's does nothing; a library exception's records the message and cause. */
  private superConstructor(cls: ClassSymbol, self: JavaObjectRef, args: JavaValue[]): void {
    if (!cls.superclass || cls.superclass.symbol.name === 'Object') return;
    const obj = this.heap.get(self.heapId) as JavaObject;
    const [first, second] = args;
    if (first) {
      if (!obj.fields.has('message')) obj.fields.set('message', first.kind === 'null' ? javaNull() : javaString(this.stringify(first)));
      if (this.isThrowable(first)) obj.fields.set('cause', first);
    }
    if (second) obj.fields.set('cause', second);
  }

  /**
   * The instance field initializers and initializer blocks, in textual order,
   * in the constructor's frame with a scope holding only `this` (they can't
   * see the constructor's parameters).
   */
  private *instanceInit(frame: Frame, rt: ClassRuntime): Gen<void> {
    if (rt.bound.instanceInit.length === 0) return;
    const saved = { scope: frame.scope, current: frame.current };
    const initScope: Scope = { vars: new Map(), parent: null };
    frame.scope = initScope;
    frame.current = initScope;
    try {
      for (const item of rt.bound.instanceInit) {
        if (item.kind === 'field') {
          this.stepAt(item.range.line);
          const v = this.isPure(item.value) ? this.pv(item.value) : yield* this.gv(item.value);
          fieldReference(this.heap, frame.thisValue!, this.fieldKey(frame.thisValue!, item.field), runtimeTypeName(item.field.type), 'this', item.range.line).set(v);
        } else {
          yield* this.blockIn(item.body, initScope, undefined);
        }
      }
    } catch (e) {
      throw this.atFailureSite(e);
    } finally {
      frame.scope = saved.scope;
      frame.current = saved.current;
    }
  }

  // ── Printing ──

  /** A value as String.valueOf prints it, with a user class's own toString(). */
  stringify(value: JavaValue): string {
    if (value.kind === 'objectRef') {
      const user = this.invokeUser(value, 'toString', []);
      if (user !== undefined && user.kind === 'string') return user.value;
    }
    return this.ownString(value);
  }

  /** A value as the library's own toString() prints it: Object's `Main$Pt@hash` for a program's object, without its class's toString(). */
  private ownString(value: JavaValue): string {
    if (value.kind === 'objectRef') {
      const obj = this.heap.get(value.heapId);
      if (obj && isJavaObject(obj)) {
        if (this.isThrowable(value)) {
          const exc = formatException(value, this.heap, this.ctx.binaryName);
          if (exc !== undefined) return exc;
        }
        if (!obj.builtin) return `${this.binaryName(value.className)}@${identityHash(value.heapId)}`;
        const element = (e: JavaValue, self: string) => (e.kind === 'objectRef' && e.heapId === value.heapId ? self : this.stringify(e));
        const map = mapContents(obj, this.heap);
        if (map) return '{' + map.keys.map((k, i) => element(k, '(this Map)') + '=' + element(map.values[i], '(this Map)')).join(', ') + '}';
        const elements = collectionElements(obj, this.heap);
        if (elements) return '[' + elements.map(e => element(e, '(this Collection)')).join(', ') + ']';
        if (value.className === 'MapEntry') return this.stringify(obj.fields.get('key')!) + '=' + this.stringify(obj.fields.get('value')!);
      }
    }
    if (value.kind === 'arrayRef') {
      const arr = this.heap.get(value.heapId);
      if (arr && isJavaArray(arr)) return `${arrayClassName(arr.elementType, name => this.javaClassName(name))}@${identityHash(value.heapId)}`;
    }
    return javaValueToString(value, this.heap);
  }
}

// ── Helpers ──

/** A class as the JVM's NullPointerException messages name it: by binary name, String and Object without their package. */
function npeClassName(sym: ClassSymbol): string {
  if (sym.isLibrary && (sym.name === 'String' || sym.name === 'Object')) return sym.name;
  return sym.binaryName;
}

function npeTypeText(t: JType): string {
  const e = erasure(t);
  switch (e.tag) {
    case 'primitive': return e.name;
    case 'array': return `${npeTypeText(e.component)}[]`;
    case 'class': return npeClassName(e.symbol);
    default: return 'Object';
  }
}

/** A generator that runs one frame and returns its result (for a nested drive). */
function* callFrame(frame: Frame): Gen<JavaValue | undefined> {
  return yield frame;
}

/** A constant's value as a JavaValue of its type (strings interned). */
function constValue(value: ConstValue, type: JType): JavaValue {
  if (typeof value === 'string') return internedString(value);
  if (typeof value === 'boolean') return javaBool(value);
  const t = type.tag === 'primitive' ? type.name : unboxedType(type)?.name ?? (typeof value === 'bigint' ? 'long' : 'int');
  if (t === 'boolean') return javaBool(Boolean(value));
  const prim = numericValue(t as Exclude<JavaPrimitiveType, 'boolean'>, value);
  return type.tag === 'primitive' ? prim : { ...prim, boxed: true };
}

/** `==` on references: the same object, or both null. A String compares by identity (interned literals are shared). */
function refEquals(a: JavaValue, b: JavaValue): boolean {
  if (a.kind === 'null' || b.kind === 'null') return a.kind === b.kind;
  if (a.kind === 'string' && b.kind === 'string') return sameString(a, b);
  if (a.kind === 'primitive' && b.kind === 'primitive') return a === b || (!a.boxed && !b.boxed && a.value === b.value && a.javaType === b.javaType);
  if ((a.kind === 'objectRef' || a.kind === 'arrayRef') && a.kind === b.kind) return a.heapId === (b as JavaObjectRef).heapId;
  return false;
}

/** Does a bound subtree mention a local (main's `args`)? */
function mentionsLocal(node: unknown, local: LocalSymbol): boolean {
  const seen = new Set<unknown>();
  const visit = (x: unknown): boolean => {
    if (!x || typeof x !== 'object' || seen.has(x)) return false;
    seen.add(x);
    const n = x as { kind?: string; local?: unknown };
    if (n.kind === 'Local' && n.local === local) return true;
    for (const [k, v] of Object.entries(x)) {
      if (k === 'type' || k === 'method' || k === 'field' || k === 'cls' || k === 'ctor' || k === 'range' || k === 'binding' || k === 'elementSource') continue;
      if (k === 'local' && n.kind !== 'Local') continue;
      if (Array.isArray(v) ? v.some(visit) : visit(v)) return true;
    }
    return false;
  };
  return visit(node);
}

/** Does an expression bind a pattern variable (o instanceof String s)? */
function hasBinding(e: B.BExpr): boolean {
  switch (e.kind) {
    case 'InstanceOf': return e.binding !== undefined || hasBinding(e.expr);
    case 'Logical': case 'Binary': return hasBinding(e.left) || hasBinding(e.right);
    case 'Unary': return hasBinding(e.operand);
    case 'Conditional': return hasBinding(e.cond) || hasBinding(e.then) || hasBinding(e.else);
    default: return false;
  }
}

/** Whether a statement can finish normally (JLS §14.22, roughly). */
function canCompleteNormally(s: B.BStmt): boolean {
  switch (s.kind) {
    case 'Return': case 'Throw': case 'Break': case 'Continue': case 'Yield': return false;
    case 'Block': return s.statements.length === 0 || canCompleteNormally(s.statements[s.statements.length - 1]);
    case 'If': return !s.else || canCompleteNormally(s.then) || canCompleteNormally(s.else);
    default: return true;
  }
}
