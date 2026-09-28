/**
 * Java AST-Walking Interpreter
 *
 * Walks the Chevrotain CST from java-parser and interprets Java programs,
 * emitting ExecutionSnapshot[] at each statement for visualization.
 *
 * Supports an educational subset of Java: primitives, strings, arrays,
 * static methods, control flow, basic OOP concepts, and common builtins.
 */

import type {
  ExecutionSnapshot,
  StackFrame,
  Variable,
  HeapObject,
  RuntimeValue,
  RunError,
} from '../../types/snapshot';
import {
  type CstNode,
  type CstToken,
  child,
  children,
  token,
  tokens,
  has,
  getLine,
  isCstNode,
  isCstToken,
} from './parser';
import { InterpreterError, JavaRuntimeError, UnsupportedFeatureError, nullPointer } from './errors';
import {
  type Reference,
  type VariableSlot,
  assignmentConversion,
  notInitialized,
  slotReference,
  fieldReference,
  arrayElementReference,
  arrayLength,
} from './references';
import { stringLiteralValue, charLiteralValue, textBlockValue, escapeJava } from './literals';
import {
  type JavaValue,
  type JavaType,
  type JavaHeapEntry,
  type JavaArray,
  type JavaObject,
  type JavaObjectRef,
  type JavaPrimitiveType,
  isJavaArray,
  isBuiltinObject,
  isJavaObject,
  defaultValue,
  javaValueToNumber,
  javaValueToBoolean,
  javaValueToString,
  javaValuesEqual,
  javaInt,
  javaDouble,
  javaBool,
  javaChar,
  javaString,
  javaNull,
} from './types';
import {
  type StdlibContext,
  HaltSignal,
  StdlibError,
  callStaticMethod,
  getStaticField,
  javaFormat,
  newBuiltin,
  callInstanceMethod,
  getIterableElements,
  scannerRemaining,
  LIST_LIKE,
  SET_LIKE,
  MAP_LIKE,
  isExceptionClass,
  newException,
  exceptionMethod,
  formatException,
  qualifiedExceptionName,
  isLibrarySubtype,
  isStringType,
  isBoxedInstanceOf,
  isKnownLibraryType,
} from './stdlib';

// ── Limits ──

const MAX_SNAPSHOTS = 5000;
/**
 * Work a run may do in all, counted in statements and loop iterations whether
 * or not they record a step. Code in a toString() callback records none, so
 * the step cap alone wouldn't stop an endless loop there.
 */
const MAX_WORK = 1_000_000;
/** Stop a little before the worker's 10-second kill, so the steps recorded so far survive. */
const TIME_BUDGET_MS = 8_500;
/** Stack trace lines to keep; a stack overflow would print thousands. */
const MAX_TRACE_FRAMES = 64;

/** The name of the frame that holds static fields, shown before main's. */
export const STATIC_FIELDS_FRAME = 'Static fields';

// ── Control flow signals ──

class ReturnSignal {
  value: JavaValue;
  constructor(value: JavaValue) {
    this.value = value;
  }
}

/** `break` or `break label;`. An unlabeled break ends the innermost loop or switch. */
class BreakSignal {
  label?: string;
  constructor(label?: string) {
    this.label = label;
  }
}

/** `continue` or `continue label;`. An unlabeled continue goes to the innermost loop's next iteration. */
class ContinueSignal {
  label?: string;
  constructor(label?: string) {
    this.label = label;
  }
}

/** `yield value;`, which gives the innermost switch expression its value. */
class YieldSignal {
  value: JavaValue;
  constructor(value: JavaValue) {
    this.value = value;
  }
}

/** Does a break or continue target the loop carrying these labels? */
function targets(signal: BreakSignal | ContinueSignal, labels: readonly string[]): boolean {
  return signal.label === undefined || labels.includes(signal.label);
}

/** A thrown Java exception propagating up the stack until a matching catch. */
class JavaThrow {
  value: JavaValue;
  constructor(value: JavaValue) {
    this.value = value;
  }
}

/** Signals that leave a statement early but aren't exceptions: finally blocks still run for them. */
function isControlSignal(e: unknown): boolean {
  return e instanceof ReturnSignal || e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof YieldSignal;
}

/**
 * A JavaScript stack overflow. Java calls run on the JavaScript stack (until
 * #14), so deep recursion ends in one. This runs at the stack's limit, so it
 * uses no regular expression: compiling one there can itself overflow, as
 * "Invalid regular expression: …: Stack overflow".
 */
function isStackOverflow(e: unknown): boolean {
  return e instanceof RangeError && (e.message.includes('call stack') || e.message.includes('Stack overflow'));
}

// ── Scope / Environment ──

interface Scope {
  variables: Map<string, VariableSlot>;
  parent: Scope | null;
  label?: string; // e.g. "for", "while", "if" — used for block scope display
}

function createScope(parent: Scope | null, label?: string): Scope {
  return { variables: new Map(), parent, label };
}

function lookupVariable(scope: Scope, name: string): VariableSlot | undefined {
  const entry = scope.variables.get(name);
  if (entry) return entry;
  if (scope.parent) return lookupVariable(scope.parent, name);
  return undefined;
}

/**
 * Increment / decrement (`++` / `--`) preserving the operand's numeric type, so
 * `double d = 1.5; d++;` yields 2.5 (not a truncated int). Falls back to int.
 */
function stepValue(val: JavaValue, delta: number): JavaValue {
  const n = javaValueToNumber(val) + delta;
  if (val.kind === 'primitive' && (val.javaType === 'double' || val.javaType === 'float' || val.javaType === 'long')) {
    return { kind: 'primitive', javaType: val.javaType, value: n };
  }
  return javaInt(n);
}

function setVariable(scope: Scope, name: string, value: JavaValue, type: JavaType): void {
  scope.variables.set(name, { value: assignmentConversion(value, type), type });
}

/**
 * Declare a local without an initializer, `int count;`. It has no value until
 * it is assigned, so it isn't drawn until then (see VariableSlot.unassigned).
 */
function declareUnassigned(scope: Scope, name: string, type: JavaType, line: number): void {
  if (type === 'var') throw new InterpreterError(`Can't infer the type of '${name}': 'var' needs an initializer`, line);
  scope.variables.set(name, { value: defaultValue(type), type, unassigned: true });
}

function updateVariable(scope: Scope, name: string, value: JavaValue): boolean {
  if (scope.variables.has(name)) {
    const entry = scope.variables.get(name)!;
    entry.value = assignmentConversion(value, entry.type);
    return true;
  }
  if (scope.parent) return updateVariable(scope.parent, name, value);
  return false;
}

/** Update the innermost call-stack frame's currentScope pointer. */
function setCurrentScope(callStack: { name: string; scope: Scope; currentScope: Scope; className?: string }[], scope: Scope): void {
  if (callStack.length > 0) {
    callStack[callStack.length - 1].currentScope = scope;
  }
}

// ── Method definitions ──

interface Param {
  name: string;
  type: JavaType;
}

interface MethodDef {
  name: string;
  returnType: JavaType;
  params: Param[];
  /** The last parameter is variadic (`int... nums`): the trailing arguments arrive as one array. */
  varargs: boolean;
  body: CstNode | undefined; // the block node; undefined for an abstract method
  isStatic: boolean;
  className: string; // the class that declares this method
}

interface FieldDef {
  name: string;
  type: JavaType;
}

interface ConstructorDef {
  className: string;
  params: Param[];
  varargs: boolean;
  body: CstNode;
}

type MethodTable = Map<string, MethodDef[]>;

/** A field initializer or an initializer block. Classes and objects run theirs in textual order. */
type Initializer =
  | { kind: 'field'; name: string; type: JavaType; init: CstNode }
  | { kind: 'block'; block: CstNode };

/** What the interpreter knows about a user class or interface. */
interface ClassInfo {
  name: string;
  kind: 'class' | 'interface';
  /** The class this one is declared in, if it is nested. Its static members are in scope here. */
  outer?: string;
  /** A nested class without `static`, whose instances belong to an object of the enclosing class (#16). */
  isInner: boolean;
  isAbstract: boolean;
  /** The library exception class this one extends, if any. Extending a user class is #15. */
  superclass?: string;
  /** Implemented interfaces, or an interface's superinterfaces: user or library type names. */
  interfaces: string[];
  /** Static field initializers and static blocks. */
  staticInit: Initializer[];
  /** Instance field initializers and instance initializer blocks. */
  instanceInit: Initializer[];
  /** A class is initialized once, at its first active use (JLS §12.4). */
  initState: 'pending' | 'running' | 'done' | 'failed';
}

interface StaticSlot extends VariableSlot {
  /**
   * A constant variable (JLS §4.12.4): a final primitive or String field with
   * a constant initializer. It is set before the program starts, and reading
   * it doesn't initialize its class, as javac inlines it.
   */
  constant: boolean;
}

/** One entry of the interpreter's call stack. */
interface Frame {
  name: string;
  scope: Scope;
  currentScope: Scope;
  className?: string;
  /** What the frame runs, for stack traces: a method, a constructor (`<init>`) or a static initializer (`<clinit>`). */
  kind: 'method' | 'constructor' | 'clinit';
  /** The line the frame is executing: its current statement, or the call it is waiting on. */
  line: number;
}

/**
 * Stops a run that is too long to show: past the step cap, or close to the
 * worker's time limit. It isn't a Java exception, so nothing catches it and
 * no finally block runs; the steps recorded so far are kept.
 */
class ExecutionLimit {
  message: string;
  line: number;
  constructor(message: string, line: number) {
    this.message = message;
    this.line = line;
  }
}

/** Where a failure happened, recorded the first time it passes a catch point (before frames are popped). */
interface FailureSite {
  line: number;
  /** `Main.divide(Main.java:3)`, innermost first, as a Java stack trace lists them. */
  trace: string[];
}

/** How long a run may go before it is stopped (tests lower them). */
export interface RunLimits {
  /** Steps recorded before the run is stopped. */
  maxSteps: number;
  /** Steps and loop iterations, recorded or not. */
  maxWork: number;
  /** Milliseconds, checked every 1024 units of work. */
  timeBudgetMs: number;
}

/** What `execute()` reports about a run. */
export interface ExecuteResult {
  snapshots: ExecutionSnapshot[];
  /** A one-line summary of how the run failed, e.g. `Exception in thread "main" java.lang.ArithmeticException: / by zero`. */
  error?: string;
  /** Why the run stopped early, for the UI: kind, line, and what stderr would show. */
  failure?: RunError;
}

// ── Interpreter ──

export class JavaInterpreter {
  private snapshots: ExecutionSnapshot[] = [];
  private stdoutBuffer = '';
  private heap: Map<string, JavaHeapEntry> = new Map();
  private nextHeapId = 1;
  private callStack: Frame[] = [];
  private methods: MethodTable = new Map();
  private methodsByClass: Map<string, MethodTable> = new Map();
  /** Each class's static fields, by class name. */
  private staticFields: Map<string, Map<string, StaticSlot>> = new Map();
  private instanceFields: Map<string, FieldDef[]> = new Map();
  private constructors: Map<string, ConstructorDef[]> = new Map();
  private classes: Map<string, ClassInfo> = new Map();
  /** Constant variables and their initializers, evaluated before the program starts. */
  private constantInits: { slot: StaticSlot; init: CstNode; owner: string }[] = [];
  private limits: RunLimits;
  /** Units of work done so far (see RunLimits.maxWork), and when the run started (see RunLimits.timeBudgetMs). */
  private work = 0;
  private startTime = 0;
  /** The source file's name in stack traces: the entry class's name + .java. */
  private fileName = 'Main.java';
  /** Where each failure (an exception or engine error) happened, keyed by the thrown object. */
  private failureSites = new WeakMap<object, FailureSite>();
  /** Whether a condition's CST contains an instanceof pattern, per node. */
  private patternCache = new WeakMap<CstNode, boolean>();
  private step = 0;
  private stdin: string;
  private ctx: StdlibContext;
  /** When > 0, emitSnapshot is a no-op (during atomic toString/equals/compareTo callbacks). */
  private suppressSnapshots = 0;
  /** Parsed primary-expression chains, per CST node. */
  private chainCache = new WeakMap<CstNode, PrimaryChain>();

  constructor(stdin: string = '', limits: Partial<RunLimits> = {}) {
    this.stdin = stdin;
    this.limits = { maxSteps: MAX_SNAPSHOTS, maxWork: MAX_WORK, timeBudgetMs: TIME_BUDGET_MS, ...limits };
    this.ctx = {
      heap: this.heap,
      allocArray: (elementType, elements) => this.allocArray(elementType, elements),
      // Everything the standard library allocates is a library object.
      allocObject: (className, fields) => this.allocObject(className, fields, true),
      random: () => Math.random(),
      stdin: this.stdin,
      writeStdout: (text) => this.appendStdout(text),
      invokeUserMethod: (ref, name, args) => this.invokeUser(ref, name, args),
      binaryName: (className) => this.binaryName(className),
    };
  }

  /**
   * Invoke a user-defined instance method (toString/equals/compareTo/…) and
   * return its result, or undefined if the object's class doesn't define one.
   * Snapshot emission is suppressed so the call is atomic in the visualization.
   */
  private invokeUser(ref: JavaValue, name: string, args: JavaValue[]): JavaValue | undefined {
    if (ref.kind !== 'objectRef' || !this.classes.has(ref.className) || isBuiltinObject(this.heap.get(ref.heapId))) return undefined;
    const method = this.resolveMethod(this.methodsByClass.get(ref.className), name, args.length);
    if (!method || method.isStatic || !method.body) return undefined;
    this.suppressSnapshots++;
    try {
      return this.callMethod(method, args, undefined, ref);
    } finally {
      this.suppressSnapshots--;
    }
  }

  /**
   * The name Java prints for a class: `Main$Node` for a class nested in Main,
   * `java.lang.ArithmeticException` for a library exception class.
   */
  private binaryName(className: string): string {
    const info = this.classes.get(className);
    if (!info) return qualifiedExceptionName(className);
    return info.outer ? `${this.binaryName(info.outer)}$${className}` : className;
  }

  /** Is this value an exception object (a library exception, or a user class extending one)? */
  private isThrowable(value: JavaValue): boolean {
    return value.kind === 'objectRef' && this.isSubclass(value.className, 'Throwable');
  }

  /**
   * Convert a value to its display string, honoring a user-defined `toString()`
   * and formatting built-in exceptions as `ClassName: message`. Falls back to
   * `javaValueToString` (which handles collections, StringBuilder, etc.).
   */
  private stringify(value: JavaValue): string {
    if (value.kind === 'objectRef') {
      const user = this.invokeUser(value, 'toString', []);
      if (user !== undefined && user.kind === 'string') return user.value;
      const obj = this.heap.get(value.heapId);
      if (obj && isJavaObject(obj)) {
        // Exceptions render as ClassName: message.
        if (this.isThrowable(value)) {
          const exc = formatException(value, this.heap, this.ctx.binaryName);
          if (exc !== undefined) return exc;
        }
        // A user class named HashMap or Stack prints as HashMap@id, not as a collection.
        if (!obj.builtin) return javaValueToString(value, this.heap);
        // Maps: {k=v, ...} — recurse via stringify so element toString() is honored.
        const keysRef = obj.fields.get('__keys__'), valuesRef = obj.fields.get('__values__');
        if (keysRef?.kind === 'arrayRef' && valuesRef?.kind === 'arrayRef') {
          const ks = this.heap.get(keysRef.heapId), vs = this.heap.get(valuesRef.heapId);
          if (ks && isJavaArray(ks) && vs && isJavaArray(vs)) {
            return '{' + ks.elements.map((k, i) => this.stringify(k) + '=' + this.stringify(vs.elements[i])).join(', ') + '}';
          }
        }
        // Lists / sets / queues: [a, b, c]
        const dataRef = obj.fields.get('__data__');
        if (dataRef?.kind === 'arrayRef') {
          const d = this.heap.get(dataRef.heapId);
          if (d && isJavaArray(d)) return '[' + d.elements.map(e => this.stringify(e)).join(', ') + ']';
        }
      }
    }
    return javaValueToString(value, this.heap);
  }

  /** Append raw text to the stdout buffer (used by print / printf). */
  private appendStdout(text: string): void {
    this.stdoutBuffer += text;
  }

  /**
   * Split the accumulated stdout buffer into display lines. One trailing
   * newline is dropped (matching the established convention where a final
   * println doesn't render an extra blank line).
   */
  private snapshotStdout(): string[] {
    if (this.stdoutBuffer === '') return [];
    const s = this.stdoutBuffer.endsWith('\n') ? this.stdoutBuffer.slice(0, -1) : this.stdoutBuffer;
    return s.split('\n');
  }

  /**
   * Run a program. A run that ends early (an uncaught exception, the step
   * limit, a construct JavaTutor can't run) still returns every step up to
   * that point, plus `failure` saying why it stopped and where.
   */
  execute(cst: CstNode): ExecuteResult {
    this.startTime = Date.now();
    try {
      const compUnit = child(cst, 'ordinaryCompilationUnit');
      if (!compUnit) throw new InterpreterError('No compilation unit found', 0);

      // A source file may declare more than one top-level class (e.g. a tester
      // class alongside the logic class it exercises). Register every one; each
      // class's methods live in `methodsByClass`, and `ClassName.method()` calls
      // dispatch against that table. `javac` forbids two *public* top-level
      // classes per file, but this educational engine is lenient about it.
      const topLevel: string[] = [];
      for (const typeDecl of children(compUnit, 'typeDeclaration')) {
        const decl = child(typeDecl, 'classDeclaration') ?? child(typeDecl, 'interfaceDeclaration');
        if (decl) {
          topLevel.push(this.registerTypeDeclaration(decl, undefined));
        } else if (has(typeDecl, 'fieldDeclaration') || has(typeDecl, 'methodDeclaration')) {
          throw new InterpreterError('Methods and fields must be declared inside a class', getLine(typeDecl));
        }
      }
      if (topLevel.length === 0) throw new InterpreterError('No class declaration found', 0);
      this.initConstants();

      // The entry class is the first top-level class that declares a static
      // `main`. Its methods become callable unqualified (so single-class
      // programs behave exactly as before).
      const entryClass = topLevel.find(name => this.findMain(name));
      const mainMethod = entryClass ? this.findMain(entryClass) : undefined;
      if (!entryClass || !mainMethod?.body) throw new InterpreterError('No main method found', 0);
      this.methods = this.methodsByClass.get(entryClass) ?? new Map();
      this.fileName = `${entryClass}.java`;

      // Java initializes the entry class (its static fields and static blocks) before main runs.
      this.initClass(entryClass);

      const mainScope = createScope(null);
      // args is an empty String[]. It is bound only when main mentions it, so
      // programs that ignore it don't show an extra variable at every step.
      const argsParam = mainMethod.params[0];
      if (argsParam && mentionsName(mainMethod.body, argsParam.name)) {
        setVariable(mainScope, argsParam.name, { kind: 'arrayRef', heapId: this.allocArray('String', []) }, 'String[]');
      }
      this.callStack.push({ name: 'main', scope: mainScope, currentScope: mainScope, className: entryClass, kind: 'method', line: 0 });
      this.executeBlock(mainMethod.body, mainScope);
      this.callStack.pop();

      return { snapshots: this.snapshots };
    } catch (e) {
      return this.endedBy(e);
    }
  }

  /**
   * The result of a run that ended by throwing `e`: its steps, a summary line,
   * and the failure the UI shows. An uncaught Java exception is reported the
   * way `java` reports it, with a stack trace for the console. A JavaScript
   * failure inside the engine is reported without its JavaScript text.
   */
  private endedBy(thrown: unknown): ExecuteResult {
    const snapshots = this.snapshots;
    if (thrown instanceof ReturnSignal || thrown instanceof HaltSignal) return { snapshots }; // main returned, or System.exit
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
      // An engine bug. Tests see the JavaScript text; students don't.
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
        return this.stringify(e.value); // honors a user exception's own toString()
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
   * while the frames that threw it are still on the stack: its line and stack
   * trace, and a step at that line (a `throw` statement has already recorded
   * one). A JavaScript stack overflow becomes a StackOverflowError first, so
   * the program can catch it. Returns the (possibly converted) failure.
   */
  private atFailureSite(thrown: unknown): unknown {
    if (typeof thrown !== 'object' || thrown === null) return thrown;
    if (isControlSignal(thrown) || thrown instanceof HaltSignal || thrown instanceof ExecutionLimit) return thrown;
    if (this.failureSites.has(thrown)) return thrown;
    const top = this.callStack[this.callStack.length - 1];
    const overflow = isStackOverflow(thrown);
    const e = overflow ? new JavaRuntimeError('StackOverflowError', '', top?.line ?? 0) : thrown;
    const line = e instanceof InterpreterError && e.line > 0 ? e.line : top?.line ?? 0;
    this.failureSites.set(e, { line, trace: this.stackTrace(line) });
    // A step where a runtime exception (/ by zero, a null field) started, so the
    // throwing frame shows before it unwinds. An engine error gets no step: the
    // program never really got there. Nor does a stack overflow: thousands of
    // frames deep, there is no room to build one.
    const runtimeException = !(e instanceof JavaThrow) && this.exceptionClassOf(e) !== undefined;
    if (runtimeException && !overflow && top && this.suppressSnapshots === 0 && this.snapshots.length < this.limits.maxSteps) {
      top.line = line;
      this.recordStep(line);
    }
    return e;
  }

  /** The frames of a Java stack trace, innermost first: `Main.divide(Main.java:3)`. */
  private stackTrace(line: number): string[] {
    const trace: string[] = [];
    const innermost = this.callStack.length - 1;
    for (let i = innermost; i >= 0 && trace.length < MAX_TRACE_FRAMES; i--) {
      const frame = this.callStack[i];
      const method = frame.kind === 'constructor' ? '<init>' : frame.kind === 'clinit' ? '<clinit>' : frame.name;
      trace.push(`${this.binaryName(frame.className ?? 'Main')}.${method}(${this.fileName}:${i === innermost ? line : frame.line})`);
    }
    if (innermost + 1 > MAX_TRACE_FRAMES) trace.push(`... ${innermost + 1 - MAX_TRACE_FRAMES} more`);
    return trace;
  }

  /** `static void main(String[] args)` (or a static `main()`) of a class. */
  private findMain(className: string): MethodDef | undefined {
    const overloads = this.methodsByClass.get(className)?.get('main') ?? [];
    return overloads.find(m => m.isStatic && m.params.length === 1)
      ?? overloads.find(m => m.isStatic && m.params.length === 0);
  }

  // ── Class registration ──

  /** Register a class or interface declaration, top-level or nested, and return its name. */
  private registerTypeDeclaration(decl: CstNode, outer: string | undefined): string {
    const line = getLine(decl);
    if (decl.name === 'interfaceDeclaration') {
      const normal = child(decl, 'normalInterfaceDeclaration');
      if (!normal) throw new UnsupportedFeatureError('Annotation types (@interface)', line);
      return this.registerInterface(normal, outer);
    }
    const normal = child(decl, 'normalClassDeclaration');
    if (normal) return this.registerClass(normal, children(decl, 'classModifier'), outer);
    if (has(decl, 'enumDeclaration')) throw new UnsupportedFeatureError('Enums', line);
    if (has(decl, 'recordDeclaration')) throw new UnsupportedFeatureError('Records', line);
    throw new InterpreterError('Unrecognized class declaration', line);
  }

  private newClassInfo(name: string, kind: ClassInfo['kind'], outer: string | undefined, line: number): ClassInfo {
    // Classes are known by their simple names, so two nested classes can't share one.
    if (this.classes.has(name)) throw new UnsupportedFeatureError(`Two classes named ${name}`, line);
    const info: ClassInfo = {
      name, kind, outer, isInner: false, isAbstract: kind === 'interface',
      interfaces: [], staticInit: [], instanceInit: [], initState: 'pending',
    };
    this.classes.set(name, info);
    return info;
  }

  private registerClass(normalClass: CstNode, modifiers: CstNode[], outer: string | undefined): string {
    const className = this.extractClassName(normalClass);
    const info = this.newClassInfo(className, 'class', outer, getLine(normalClass));
    info.isAbstract = modifiers.some(m => has(m, 'Abstract'));
    // Members of an interface are implicitly static.
    info.isInner = outer !== undefined && !modifiers.some(m => has(m, 'Static')) && this.classes.get(outer)?.kind === 'class';

    // A class may extend a library exception class. Extending anything else
    // needs inheritance, which is #15: stop rather than run it wrongly.
    const ext = child(normalClass, 'classExtends');
    if (ext) {
      const superName = lastIdentifier(child(ext, 'classType'));
      if (isExceptionClass(superName)) info.superclass = superName;
      else if (superName !== 'Object') {
        throw new UnsupportedFeatureError(`Inheritance (class ${className} extends ${superName})`, getLine(ext), true);
      }
    }
    info.interfaces = interfaceNames(child(normalClass, 'classImplements'));

    const classBody = child(normalClass, 'classBody');
    for (const bodyDecl of classBody ? children(classBody, 'classBodyDeclaration') : []) {
      const ctor = child(bodyDecl, 'constructorDeclaration');
      if (ctor) {
        this.registerConstructor(className, ctor);
        continue;
      }
      const staticInit = child(bodyDecl, 'staticInitializer');
      if (staticInit) {
        info.staticInit.push({ kind: 'block', block: child(staticInit, 'block')! });
        continue;
      }
      const instanceInit = child(bodyDecl, 'instanceInitializer');
      if (instanceInit) {
        info.instanceInit.push({ kind: 'block', block: child(instanceInit, 'block')! });
        continue;
      }
      const member = child(bodyDecl, 'classMemberDeclaration');
      if (!member) continue;
      const field = child(member, 'fieldDeclaration');
      if (field) {
        const fieldModifiers = children(field, 'fieldModifier');
        this.registerFields(info, field, fieldModifiers.some(m => has(m, 'Static')), fieldModifiers.some(m => has(m, 'Final')));
        continue;
      }
      const method = child(member, 'methodDeclaration');
      if (method) {
        this.registerMethod(className, method, children(method, 'methodModifier').some(m => has(m, 'Static')));
        continue;
      }
      const nested = child(member, 'classDeclaration') ?? child(member, 'interfaceDeclaration');
      if (nested) this.registerTypeDeclaration(nested, className);
    }
    return className;
  }

  /**
   * An interface: its constants (implicitly static and final) and static
   * methods, and its superinterfaces for `instanceof`. Abstract methods need
   * nothing, since the implementing class supplies them.
   */
  private registerInterface(normal: CstNode, outer: string | undefined): string {
    const name = this.extractClassName(normal);
    const info = this.newClassInfo(name, 'interface', outer, getLine(normal));
    info.interfaces = interfaceNames(child(normal, 'interfaceExtends'));
    const body = child(normal, 'interfaceBody');
    for (const member of body ? children(body, 'interfaceMemberDeclaration') : []) {
      const constant = child(member, 'constantDeclaration');
      if (constant) {
        this.registerFields(info, constant, true, true);
        continue;
      }
      const method = child(member, 'interfaceMethodDeclaration');
      if (method) {
        const modifiers = children(method, 'interfaceMethodModifier');
        if (modifiers.some(m => has(m, 'Default'))) {
          throw new UnsupportedFeatureError('Default methods in interfaces', getLine(method));
        }
        const isStatic = modifiers.some(m => has(m, 'Static'));
        if (isStatic || modifiers.some(m => has(m, 'Private'))) this.registerMethod(name, method, isStatic);
        continue;
      }
      const nested = child(member, 'classDeclaration') ?? child(member, 'interfaceDeclaration');
      if (nested) this.registerTypeDeclaration(nested, name);
    }
    return name;
  }

  private registerMethod(className: string, methodDecl: CstNode, isStatic: boolean): void {
    const header = child(methodDecl, 'methodHeader')!;
    const declarator = child(header, 'methodDeclarator')!;
    const methodName = token(declarator, 'Identifier')!.image;

    const result = child(header, 'result');
    const returnType = result ? this.extractResultType(result) : 'void';
    // java-parser reads a record declared inside a class, `record P(int x) {}`,
    // as a method named P whose return type is `record`.
    if (returnType === 'record') throw new UnsupportedFeatureError('Records', getLine(methodDecl));

    const { params, varargs } = this.extractFormalParameters(child(declarator, 'formalParameterList'));
    const methodBody = child(methodDecl, 'methodBody');
    const body = methodBody ? child(methodBody, 'block') : undefined; // none for an abstract method

    const method: MethodDef = { name: methodName, returnType, params, varargs, body, isStatic, className };
    const classMethods = this.methodsByClass.get(className) || new Map<string, MethodDef[]>();
    const overloads = classMethods.get(methodName) || [];
    overloads.push(method);
    classMethods.set(methodName, overloads);
    this.methodsByClass.set(className, classMethods);
  }

  /**
   * The overload of `methodName` for `argCount` arguments: one with exactly
   * that many parameters, else a varargs method that can take them. Overloads
   * are told apart by argument count only (choosing by type is #13).
   */
  private resolveMethod(table: MethodTable | undefined, methodName: string, argCount: number): MethodDef | undefined {
    const overloads = table?.get(methodName);
    if (!overloads) return undefined;
    return overloads.find(m => !m.varargs && m.params.length === argCount)
      ?? overloads.find(m => m.varargs && argCount >= m.params.length - 1);
  }

  private extractClassName(normalClass: CstNode): string {
    const typeIdentifier = child(normalClass, 'typeIdentifier');
    return token(typeIdentifier || normalClass, 'Identifier')?.image || 'Main';
  }

  private registerConstructor(className: string, ctorDecl: CstNode): void {
    const declarator = child(ctorDecl, 'constructorDeclarator')!;
    const { params, varargs } = this.extractFormalParameters(child(declarator, 'formalParameterList'));
    const constructors = this.constructors.get(className) || [];
    constructors.push({ className, params, varargs, body: child(ctorDecl, 'constructorBody')! });
    this.constructors.set(className, constructors);
  }

  private extractFormalParameters(paramList: CstNode | undefined): { params: Param[]; varargs: boolean } {
    const params: Param[] = [];
    let varargs = false;
    for (const fp of paramList ? children(paramList, 'formalParameter') : []) {
      const regular = child(fp, 'variableParaRegularParameter');
      if (regular) {
        const idNode = child(regular, 'variableDeclaratorId')!;
        const type = this.extractUnannType(child(regular, 'unannType')) + dimsSuffix(child(idNode, 'dims'));
        params.push({ name: token(idNode, 'Identifier')!.image, type });
        continue;
      }
      // `int... nums`: the parameter is an int[] holding the trailing arguments.
      const variadic = child(fp, 'variableArityParameter');
      if (variadic) {
        params.push({ name: token(variadic, 'Identifier')!.image, type: this.extractUnannType(child(variadic, 'unannType')) + '[]' });
        varargs = true;
      }
    }
    return { params, varargs };
  }

  /**
   * The fields of one declaration, `int x, y = 2;`. A static field gets a slot
   * in its class; an instance field is created with each object. Initializers
   * join the class's static or instance initializer list in textual order,
   * except a constant's, which is evaluated before the program starts.
   */
  private registerFields(info: ClassInfo, decl: CstNode, isStatic: boolean, isFinal: boolean): void {
    const baseType = this.extractUnannType(child(decl, 'unannType'));
    const declList = child(decl, 'variableDeclaratorList');
    for (const declarator of declList ? children(declList, 'variableDeclarator') : []) {
      const idNode = child(declarator, 'variableDeclaratorId')!;
      const name = token(idNode, 'Identifier')!.image;
      const type = baseType + dimsSuffix(child(idNode, 'dims'));
      const init = child(declarator, 'variableInitializer');
      if (isStatic) {
        const slots = this.staticFields.get(info.name) ?? new Map<string, StaticSlot>();
        this.staticFields.set(info.name, slots);
        const constant = isFinal && init !== undefined && (PRIMITIVE_TYPES.has(type) || type === 'String') && isLiteralConstant(init);
        const slot: StaticSlot = { value: defaultValue(type), type, constant };
        slots.set(name, slot);
        if (init && constant) this.constantInits.push({ slot, init, owner: info.name });
        else if (init) info.staticInit.push({ kind: 'field', name, type, init });
      } else {
        const fields = this.instanceFields.get(info.name) ?? [];
        fields.push({ name, type });
        this.instanceFields.set(info.name, fields);
        if (init) info.instanceInit.push({ kind: 'field', name, type, init });
      }
    }
  }

  /**
   * Give every constant variable its value (javac folds them into the code
   * that uses them). One whose initializer throws, like `1 / 0`, isn't a
   * constant after all: it runs with its class's static initializers instead,
   * so the exception surfaces when the class is initialized, as in Java.
   */
  private initConstants(): void {
    for (const { slot, init, owner } of this.constantInits) {
      try {
        slot.value = assignmentConversion(this.evalVariableInitializer(init, slot.type, createScope(null)), slot.type);
      } catch {
        slot.constant = false;
        const name = [...this.staticFields.get(owner)!].find(([, s]) => s === slot)![0];
        this.classes.get(owner)!.staticInit.unshift({ kind: 'field', name, type: slot.type, init });
      }
    }
  }

  /**
   * Initialize a class at its first active use (JLS §12.4.1): creating an
   * instance, calling a static method, or using a static field that isn't a
   * constant. Its static field initializers and static blocks run once, in
   * textual order, in a `<clinit>` frame. A class that is already being
   * initialized isn't initialized again, so an initializer can use its own class.
   */
  private initClass(className: string): void {
    const info = this.classes.get(className);
    if (!info) return;
    if (info.initState === 'failed') {
      throw new JavaThrow(this.newThrowable('NoClassDefFoundError', `Could not initialize class ${this.binaryName(className)}`));
    }
    if (info.initState !== 'pending') return;
    info.initState = 'running';
    if (info.staticInit.length === 0) {
      info.initState = 'done';
      return;
    }
    const scope = createScope(null);
    this.callStack.push({ name: '<clinit>', scope, currentScope: scope, className, kind: 'clinit', line: 0 });
    try {
      for (const item of info.staticInit) {
        if (item.kind === 'field') {
          const slot = this.staticFields.get(className)!.get(item.name)!;
          this.atLine(getLine(item.init));
          slot.value = assignmentConversion(this.evalVariableInitializer(item.init, item.type, scope), item.type);
        } else {
          this.runBlockIn(item.block, scope, 'static');
        }
      }
      info.initState = 'done';
    } catch (thrown) {
      const e = this.atFailureSite(thrown);
      const exc = this.toExceptionValue(e);
      if (!exc) throw e; // an engine error or System.exit: not a Java exception
      info.initState = 'failed';
      // JLS §12.4.2: an exception other than an Error becomes an ExceptionInInitializerError.
      const isError = exc.kind === 'objectRef' && this.isSubclass(exc.className, 'Error');
      throw new JavaThrow(isError ? exc : this.newThrowable('ExceptionInInitializerError', null, exc));
    } finally {
      this.callStack.pop();
    }
  }

  /** A new library exception object, with an optional message and cause. */
  private newThrowable(className: string, message: string | null, cause?: JavaValue): JavaValue {
    const ref = newException(className, message === null ? [] : [javaString(message)], this.ctx);
    if (cause && ref.kind === 'objectRef') {
      const obj = this.heap.get(ref.heapId);
      if (obj && isJavaObject(obj)) obj.fields.set('cause', cause);
    }
    return ref;
  }

  /** A new object's instance fields, at their default values. Initializers run in the constructor. */
  private defaultInstanceFields(className: string): Map<string, JavaValue> {
    return new Map((this.instanceFields.get(className) ?? []).map(f => [f.name, defaultValue(f.type)]));
  }

  // ── Type extraction ──

  private extractResultType(result: CstNode): JavaType {
    if (has(result, 'Void')) return 'void';
    const unannType = child(result, 'unannType');
    return unannType ? this.extractUnannType(unannType) : 'void';
  }

  /**
   * A declared type as a string: `int`, `int[][]`, `String`, `Point[]`. Type
   * arguments are erased (`List<String>` is `List`) and package and outer class
   * names dropped (`java.util.Scanner` is `Scanner`, `Map.Entry` is `Entry`).
   */
  private extractUnannType(unannType: CstNode | undefined): JavaType {
    if (!unannType) return 'int';

    // Primitive types
    const primWithDims = child(unannType, 'unannPrimitiveTypeWithOptionalDimsSuffix');
    if (primWithDims) {
      return this.extractPrimitiveType(child(primWithDims, 'unannPrimitiveType')) + dimsSuffix(child(primWithDims, 'dims'));
    }

    // Reference types (String, class names, arrays of references)
    const refType = child(unannType, 'unannReferenceType');
    const classType = refType ? child(refType, 'unannClassOrInterfaceType') : undefined;
    const unannClass = classType ? child(classType, 'unannClassType') : undefined;
    if (refType && unannClass) return lastIdentifier(unannClass) + dimsSuffix(child(refType, 'dims'));

    return 'Object';
  }

  /** The type a `referenceType` node names (after `instanceof`, or in a cast): `String`, `int[]`, `List`. */
  private referenceTypeName(refType: CstNode): JavaType {
    const primitive = child(refType, 'primitiveType');
    const classType = child(child(refType, 'classOrInterfaceType') ?? refType, 'classType');
    const base = primitive ? this.extractPrimitiveType(primitive) : classType ? lastIdentifier(classType) : 'Object';
    return base + dimsSuffix(child(refType, 'dims'));
  }

  private extractPrimitiveType(primitiveType: CstNode | undefined): JavaType {
    if (!primitiveType) return 'int';
    if (has(primitiveType, 'Boolean')) return 'boolean';
    const numeric = child(primitiveType, 'numericType');
    if (numeric) {
      const integral = child(numeric, 'integralType');
      if (integral) {
        if (has(integral, 'Int')) return 'int';
        if (has(integral, 'Long')) return 'long';
        if (has(integral, 'Byte')) return 'byte';
        if (has(integral, 'Short')) return 'short';
        if (has(integral, 'Char')) return 'char';
      }
      const fp = child(numeric, 'floatingPointType');
      if (fp) {
        if (has(fp, 'Float')) return 'float';
        if (has(fp, 'Double')) return 'double';
      }
    }
    return 'int';
  }

  private extractLocalVarType(localVarType: CstNode): JavaType {
    const unannType = child(localVarType, 'unannType');
    if (unannType) return this.extractUnannType(unannType);
    if (has(localVarType, 'Var')) return 'var';
    return 'Object';
  }

  // ── Snapshot emission ──

  /** Record a step at `line`, after a statement runs. Stops the run at the step cap or the work and time budgets. */
  private emitSnapshot(line: number): void {
    this.tick(line);
    // Suppressed during atomic user-method callbacks (toString/equals/compareTo).
    if (this.suppressSnapshots > 0) return;
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

  /** Set the line the innermost frame is executing (for errors and stack traces). */
  private atLine(line: number): void {
    const frame = this.callStack[this.callStack.length - 1];
    if (frame) frame.line = line;
  }

  /** Build a snapshot of the current state and add it to the steps. */
  private recordStep(line: number): void {
    const callStack: StackFrame[] = [];
    if (this.staticFields.size > 0) callStack.push(this.staticFieldsFrame());
    for (const frame of this.callStack) {
      // The frame's root scope: its parameters and method-level locals, and `this`.
      const root: StackFrame = { name: frame.name, variables: this.visibleVariables(frame.scope) };
      const self = frame.scope.variables.get('this');
      if (self) root.thisArg = this.javaToRuntime(self.value);
      callStack.push(root);

      // Walk from currentScope up to (but not including) frame.scope,
      // emitting each intermediate scope as a block-scope frame.
      const blockScopes: Scope[] = [];
      let s: Scope | null = frame.currentScope;
      while (s && s !== frame.scope) {
        blockScopes.push(s);
        s = s.parent;
      }
      // Emit in outer-to-inner order (reverse of how we collected them).
      // Merge a child scope into its parent's block frame when both share
      // the same label (e.g. for-init scope + for-body block scope both
      // labeled "for"), so `i` and `abc` appear together in one "for block".
      let lastEmittedScope: Scope | null = null;
      for (let i = blockScopes.length - 1; i >= 0; i--) {
        const scopeLabel = blockScopes[i].label || frame.name;
        const blockVars = this.visibleVariables(blockScopes[i]);
        // Merge into previous block frame if same label AND direct child
        const prev = callStack.length > 0 ? callStack[callStack.length - 1] : null;
        const isDirectChild = lastEmittedScope && blockScopes[i].parent === lastEmittedScope;
        if (prev && prev.isBlockScope && prev.name === scopeLabel && isDirectChild) {
          prev.variables.push(...blockVars);
        } else if (blockVars.length > 0) {
          callStack.push({ name: scopeLabel, variables: blockVars, isBlockScope: true });
          lastEmittedScope = blockScopes[i];
        } else {
          lastEmittedScope = blockScopes[i];
        }
      }
    }

    this.snapshots.push({
      step: this.step++,
      line,
      callStack,
      heap: this.reachableHeap(callStack),
      stdout: this.snapshotStdout(),
    });
  }

  /** A scope's variables as a step shows them: without `this` (a frame shows it apart) and locals that have no value yet. */
  private visibleVariables(scope: Scope): Variable[] {
    const variables: Variable[] = [];
    for (const [name, slot] of scope.variables) {
      if (slot.unassigned || name === 'this') continue;
      variables.push({ name, value: this.javaToRuntime(slot.value) });
    }
    return variables;
  }

  /**
   * The "Static fields" frame, shown first, like the global frame of the JS
   * and Python engines: every static field of each class that has been
   * initialized, as `Main.moves`. A class is initialized at its first use
   * (JLS §12.4.1), so its fields appear then, with the values its
   * initializers gave them. A program with no static fields has no such frame.
   */
  private staticFieldsFrame(): StackFrame {
    const variables: Variable[] = [];
    for (const [className, slots] of this.staticFields) {
      if (this.classes.get(className)?.initState === 'pending') continue;
      for (const [name, slot] of slots) variables.push({ name: `${className}.${name}`, value: this.javaToRuntime(slot.value) });
    }
    return { name: STATIC_FIELDS_FRAME, variables };
  }

  /**
   * The heap objects a step shows: those reachable from its frames' variables,
   * `this` and static fields, in the order they were created. An object nothing
   * refers to any more is left out, as it is garbage in Java. The walk follows
   * the references the drawing shows, so a collection's backing array (drawn as
   * the collection's contents) is left out too.
   */
  private reachableHeap(callStack: StackFrame[]): HeapObject[] {
    const objects: HeapObject[] = [];
    const reached = new Set<string>();
    const pending: string[] = [];
    const reach = (value: RuntimeValue | undefined) => {
      if (value?.type === 'ref' && !reached.has(value.heapId)) {
        reached.add(value.heapId);
        pending.push(value.heapId);
      }
    };
    for (const frame of callStack) {
      for (const v of frame.variables) reach(v.value);
      reach(frame.thisArg);
    }
    while (pending.length > 0) {
      const id = pending.pop()!;
      const entry = this.heap.get(id);
      if (!entry) continue;
      const obj = isJavaArray(entry) ? this.serializeArray(id, entry) : this.serializeObject(id, entry);
      objects.push(obj);
      for (const p of obj.properties) reach(p?.value); // a hole in a sparse list is reported by the refs invariant
    }
    return objects.sort((a, b) => Number(a.id) - Number(b.id));
  }

  private serializeArray(id: string, entry: JavaArray): HeapObject {
    return {
      id,
      objectType: 'array',
      label: entry.elementType + '[]',
      properties: entry.elements.map((el, i) => ({ key: String(i), value: this.javaToRuntime(el) })),
    };
  }

  private javaToRuntime(val: JavaValue): RuntimeValue {
    switch (val.kind) {
      case 'primitive':
        if (val.javaType === 'boolean')
          return { type: 'boolean', value: val.value as boolean };
        if (val.javaType === 'char')
          return { type: 'string', value: String.fromCharCode(val.value as number) };
        return { type: 'number', value: val.value as number };
      case 'string':
        return { type: 'string', value: val.value };
      case 'null':
        return { type: 'null', value: null };
      case 'arrayRef':
        return { type: 'ref', heapId: val.heapId };
      case 'objectRef':
        return { type: 'ref', heapId: val.heapId };
    }
  }

  /**
   * Render a heap object for a snapshot. Library collections show their
   * contents inline (with list/set/map objectTypes); StringBuilder shows its
   * text; a Scanner shows the input it has left; other library objects hide
   * their internal `__`-prefixed fields.
   * An instance of a user class shows its fields as declared, even when the
   * class is called LinkedList or Stack.
   */
  private serializeObject(id: string, entry: JavaObject): HeapObject {
    const cls = entry.className;
    if (!entry.builtin) {
      return {
        id, objectType: 'object', label: cls,
        properties: Array.from(entry.fields.entries()).map(([k, v]) => ({ key: k, value: this.javaToRuntime(v) })),
      };
    }
    if (MAP_LIKE.has(cls)) {
      const keys = this.getBackingElements(entry, '__keys__');
      const values = this.getBackingElements(entry, '__values__');
      return {
        id, objectType: 'map', label: cls,
        properties: keys.map((k, i) => ({
          key: javaValueToString(k, this.heap),
          value: this.javaToRuntime(values[i] ?? javaNull()),
        })),
      };
    }
    if (LIST_LIKE.has(cls) || SET_LIKE.has(cls)) {
      const elems = this.getBackingElements(entry, '__data__');
      return {
        id, objectType: SET_LIKE.has(cls) ? 'set' : 'list', label: cls,
        properties: elems.map((e, i) => ({ key: String(i), value: this.javaToRuntime(e) })),
      };
    }
    if (cls === 'StringBuilder' || cls === 'StringBuffer') {
      return {
        id, objectType: 'object', label: cls,
        properties: [{ key: 'value', value: this.javaToRuntime(entry.fields.get('value') ?? javaNull()) }],
      };
    }
    if (cls === 'Scanner') {
      // The input still to be read, with line breaks written as \n, so a
      // student can see that nextInt() leaves the rest of the line behind.
      return {
        id, objectType: 'object', label: cls,
        properties: [{ key: 'remaining', value: { type: 'string', value: escapeJava(scannerRemaining(entry)) } }],
      };
    }
    return {
      id, objectType: 'object', label: cls,
      properties: Array.from(entry.fields.entries())
        .filter(([k]) => !k.startsWith('__'))
        .map(([k, v]) => ({ key: k, value: this.javaToRuntime(v) })),
    };
  }

  private getBackingElements(entry: JavaObject, field: string): JavaValue[] {
    const ref = entry.fields.get(field);
    if (ref && ref.kind === 'arrayRef') {
      const arr = this.heap.get(ref.heapId);
      if (arr && isJavaArray(arr)) return arr.elements;
    }
    return [];
  }

  // ── Heap management ──

  private allocArray(elementType: JavaType, elements: JavaValue[]): string {
    const id = String(this.nextHeapId++);
    this.heap.set(id, { elementType, elements });
    return id;
  }

  /** Allocate an object. `builtin` marks a library object (see JavaObject.builtin); a user class's instance isn't one. */
  private allocObject(className: string, fields: Map<string, JavaValue>, builtin = false): string {
    const id = String(this.nextHeapId++);
    this.heap.set(id, builtin ? { className, fields, builtin } : { className, fields });
    return id;
  }

  // ── Block execution ──

  private executeBlock(block: CstNode, scope: Scope): void {
    const stmts = child(block, 'blockStatements');
    if (!stmts) return;
    const blockStmts = children(stmts, 'blockStatement');
    for (const stmt of blockStmts) {
      this.executeBlockStatement(stmt, scope);
    }
  }

  private executeBlockStatement(blockStmt: CstNode, scope: Scope): void {
    // Local variable declaration
    const localVarDeclStmt = child(blockStmt, 'localVariableDeclarationStatement');
    if (localVarDeclStmt) {
      this.executeLocalVarDecl(localVarDeclStmt, scope);
      return;
    }

    // Statement
    const stmt = child(blockStmt, 'statement');
    if (stmt) {
      this.executeStatement(stmt, scope);
      return;
    }
    throw localDeclarationError(blockStmt);
  }

  // ── Local variable declarations ──

  private executeLocalVarDecl(declStmt: CstNode, scope: Scope): void {
    const decl = child(declStmt, 'localVariableDeclaration')!;
    const typeNode = child(decl, 'localVariableType')!;
    const baseType = this.extractLocalVarType(typeNode);

    const declList = child(decl, 'variableDeclaratorList')!;
    for (const declarator of children(declList, 'variableDeclarator')) {
      const idNode = child(declarator, 'variableDeclaratorId')!;
      const name = token(idNode, 'Identifier')!.image;
      const line = token(idNode, 'Identifier')!.startLine;
      this.atLine(line);

      // Array dims may follow the name instead of the type: int nums[]
      let type = baseType + dimsSuffix(child(idNode, 'dims'));

      const init = child(declarator, 'variableInitializer');
      if (!init) {
        declareUnassigned(scope, name, type, line);
        this.emitSnapshot(line);
        continue;
      }
      const value = this.evalVariableInitializer(init, type, scope);

      // Infer type for 'var'
      if (type === 'var') {
        type = this.inferType(value);
      }

      setVariable(scope, name, value, type);
      this.emitSnapshot(line);
    }
  }

  private evalVariableInitializer(init: CstNode, type: JavaType, scope: Scope): JavaValue {
    // Array initializer: {1, 2, 3}
    const arrayInit = child(init, 'arrayInitializer');
    if (arrayInit) {
      return this.evalArrayInitializer(arrayInit, type, scope);
    }

    // Expression
    return this.evalExpression(child(init, 'expression')!, scope);
  }

  private evalArrayInitializer(arrayInit: CstNode, type: JavaType, scope: Scope): JavaValue {
    const elementType = type.endsWith('[]') ? type.slice(0, -2) : type;
    const initList = child(arrayInit, 'variableInitializerList');
    const elements: JavaValue[] = [];

    if (initList) {
      for (const vi of children(initList, 'variableInitializer')) {
        // Could be nested array initializer for 2D arrays
        const nestedArrayInit = child(vi, 'arrayInitializer');
        if (nestedArrayInit) {
          elements.push(this.evalArrayInitializer(nestedArrayInit, elementType, scope));
        } else {
          // Each element is converted like any store: {1, 2} in a double[] holds 1.0 and 2.0.
          elements.push(assignmentConversion(this.evalExpression(child(vi, 'expression')!, scope), elementType));
        }
      }
    }

    const heapId = this.allocArray(elementType, elements);
    return { kind: 'arrayRef', heapId };
  }

  private inferType(val: JavaValue): JavaType {
    switch (val.kind) {
      case 'primitive': return val.javaType;
      case 'string': return 'String';
      case 'null': return 'Object';
      case 'arrayRef': {
        const arr = this.heap.get(val.heapId);
        return arr && isJavaArray(arr) ? arr.elementType + '[]' : 'Object[]';
      }
      case 'objectRef': return val.className;
    }
  }

  // ── Statement execution ──

  /**
   * Run one statement. `labels` are the labels written directly on it
   * (`outer: for (…)`); a loop uses them to match `break outer` and
   * `continue outer`.
   */
  private executeStatement(stmt: CstNode, scope: Scope, labels: readonly string[] = []): void {
    // Java calls run on the JavaScript stack (#14), and this frame is on the
    // path of every recursive call, so it holds no locals.
    this.atLine(stmt.location?.startLine ?? getLine(stmt));
    if (has(stmt, 'statementWithoutTrailingSubstatement')) {
      return this.executeStatementWithoutTrailing(child(stmt, 'statementWithoutTrailingSubstatement')!, scope, labels);
    }
    if (has(stmt, 'ifStatement')) return this.executeIf(child(stmt, 'ifStatement')!, scope);
    if (has(stmt, 'forStatement')) return this.executeFor(child(stmt, 'forStatement')!, scope, labels);
    if (has(stmt, 'whileStatement')) return this.executeWhile(child(stmt, 'whileStatement')!, scope, labels);
    if (has(stmt, 'labeledStatement')) return this.executeLabeled(child(stmt, 'labeledStatement')!, scope, labels);
    throw new InterpreterError('Unrecognized statement', getLine(stmt));
  }

  /** `label: statement`. A `break label` inside ends the labeled statement. */
  private executeLabeled(labeled: CstNode, scope: Scope, outerLabels: readonly string[]): void {
    const label = token(labeled, 'Identifier')!.image;
    try {
      this.executeStatement(child(labeled, 'statement')!, scope, [...outerLabels, label]);
    } catch (e) {
      if (e instanceof BreakSignal && e.label === label) {
        setCurrentScope(this.callStack, scope);
        return;
      }
      throw e;
    }
  }

  private executeStatementWithoutTrailing(swts: CstNode, scope: Scope, labels: readonly string[]): void {
    // block
    const block = child(swts, 'block');
    if (block) {
      // Inherit the parent scope's label so variables declared inside
      // a for/while/if body block show the correct scope name. (This is
      // runBlockIn, written out: blocks sit on the path of every recursive
      // call, and Java calls still run on the JavaScript stack, #14.)
      const inner = createScope(scope, scope.label);
      setCurrentScope(this.callStack, inner);
      this.executeBlock(block, inner);
      setCurrentScope(this.callStack, scope);
      return;
    }

    // expression statement
    const exprStmt = child(swts, 'expressionStatement');
    if (exprStmt) {
      const stmtExpr = child(exprStmt, 'statementExpression')!;
      const expr = child(stmtExpr, 'expression')!;
      const line = getLine(expr);
      this.evalExpression(expr, scope);
      this.emitSnapshot(line);
      return;
    }

    // return statement
    const returnStmt = child(swts, 'returnStatement');
    if (returnStmt) {
      const line = token(returnStmt, 'Return')?.startLine || getLine(returnStmt);
      const expr = child(returnStmt, 'expression');
      const value = expr ? this.evalExpression(expr, scope) : javaNull();
      this.emitSnapshot(line);
      throw new ReturnSignal(value);
    }

    this.executeOtherStatement(swts, scope, labels);
  }

  /** The statements less common than blocks, expressions and returns (kept apart so the frame above stays small). */
  private executeOtherStatement(swts: CstNode, scope: Scope, labels: readonly string[]): void {
    // break / continue, optionally with a label
    const breakStmt = child(swts, 'breakStatement');
    if (breakStmt) {
      const line = token(breakStmt, 'Break')?.startLine || getLine(breakStmt);
      this.emitSnapshot(line);
      throw new BreakSignal(token(breakStmt, 'Identifier')?.image);
    }
    const continueStmt = child(swts, 'continueStatement');
    if (continueStmt) {
      const line = token(continueStmt, 'Continue')?.startLine || getLine(continueStmt);
      this.emitSnapshot(line);
      throw new ContinueSignal(token(continueStmt, 'Identifier')?.image);
    }

    // yield: the value of the enclosing switch expression
    const yieldStmt = child(swts, 'yieldStatement');
    if (yieldStmt) {
      const line = token(yieldStmt, 'Yield')?.startLine || getLine(yieldStmt);
      const value = this.evalExpression(child(yieldStmt, 'expression')!, scope);
      this.emitSnapshot(line);
      throw new YieldSignal(value);
    }

    // switch statement
    const switchStmt = child(swts, 'switchStatement');
    if (switchStmt) {
      this.evalSwitch(switchStmt, scope, false);
      return;
    }

    // do-while statement (called 'doStatement' in the CST)
    const doStmt = child(swts, 'doStatement');
    if (doStmt) {
      this.executeDoWhile(doStmt, scope, labels);
      return;
    }

    // throw statement
    const throwStmt = child(swts, 'throwStatement');
    if (throwStmt) this.executeThrow(throwStmt, scope);

    // try / catch / finally, and try-with-resources
    const tryStmt = child(swts, 'tryStatement');
    if (tryStmt) {
      this.executeTry(tryStmt, scope);
      return;
    }

    // synchronized (lock) { … }: one thread, so it just runs the block once the lock is known not to be null.
    const syncStmt = child(swts, 'synchronizedStatement');
    if (syncStmt) {
      const line = token(syncStmt, 'Synchronized')?.startLine || getLine(syncStmt);
      const lockExpr = child(syncStmt, 'expression')!;
      if (this.evalExpression(lockExpr, scope).kind === 'null') {
        throw nullPointer(`Cannot enter synchronized block because "${sourceText(lockExpr)}" is null`, line);
      }
      this.emitSnapshot(line);
      this.runBlockIn(child(syncStmt, 'block')!, scope, 'synchronized');
      return;
    }

    // assert: `java` runs with assertions disabled unless given -ea, so the
    // condition isn't evaluated. The step still shows the statement was reached.
    const assertStmt = child(swts, 'assertStatement');
    if (assertStmt) {
      this.emitSnapshot(token(assertStmt, 'Assert')?.startLine || getLine(assertStmt));
      return;
    }

    // An empty statement (a lone `;`) does nothing.
    if (has(swts, 'emptyStatement')) return;
    throw new InterpreterError('Unrecognized statement', getLine(swts));
  }

  private executeThrow(throwStmt: CstNode, scope: Scope): never {
    const line = token(throwStmt, 'Throw')?.startLine || getLine(throwStmt);
    const expr = child(throwStmt, 'expression')!;
    const value = this.evalExpression(expr, scope);
    this.emitSnapshot(line);
    if (value.kind === 'null') throw nullPointer(`Cannot throw exception because "${sourceText(expr)}" is null`, line);
    throw new JavaThrow(value);
  }

  /** Run a block in a new scope nested in `scope`, so its locals end with the block. */
  private runBlockIn(block: CstNode, scope: Scope, label: string | undefined = scope.label): void {
    const inner = createScope(scope, label);
    setCurrentScope(this.callStack, inner);
    try {
      this.executeBlock(block, inner);
    } catch (e) {
      throw this.atFailureSite(e); // while the block's locals are still shown
    } finally {
      setCurrentScope(this.callStack, scope);
    }
  }

  // ── Exceptions ──

  private executeTry(tryStmt: CstNode, scope: Scope): void {
    const withResources = child(tryStmt, 'tryWithResourcesStatement');
    if (withResources) {
      this.executeTryWithResources(withResources, scope);
      return;
    }
    const tryBlock = child(tryStmt, 'block')!;
    this.runTryCatchFinally(() => this.runBlockIn(tryBlock, scope, 'try'), child(tryStmt, 'catches'), child(tryStmt, 'finally'), scope);
  }

  /**
   * The try/catch/finally protocol around `body`. A Java exception is matched
   * against the catch clauses; finally runs after the try or catch part however
   * it ends, and if finally itself ends abruptly, that replaces the pending
   * outcome. System.exit ends the program at once, running no catch or finally,
   * and so does an engine error (an unsupported feature, the step limit).
   */
  private runTryCatchFinally(body: () => void, catches: CstNode | undefined, finallyNode: CstNode | undefined, scope: Scope): void {
    let pending: { error: unknown } | undefined;
    try {
      body();
    } catch (thrown) {
      if (thrown instanceof HaltSignal) throw thrown;
      const e = this.atFailureSite(thrown);
      const excClass = this.exceptionClassOf(e);
      if (excClass === undefined && !isControlSignal(e)) throw e; // an engine error, not a Java exception
      const clause = excClass !== undefined && catches ? this.matchCatch(catches, excClass) : undefined;
      if (!clause) {
        pending = { error: e };
      } else {
        const exc = this.toExceptionValue(e)!;
        try {
          const catchScope = createScope(scope, 'catch');
          setVariable(catchScope, clause.name, exc, excClass!);
          setCurrentScope(this.callStack, catchScope);
          this.executeBlock(clause.block, catchScope);
        } catch (thrownInCatch) {
          const inCatch = this.atFailureSite(thrownInCatch);
          if (inCatch instanceof HaltSignal || !(isControlSignal(inCatch) || this.exceptionClassOf(inCatch) !== undefined)) throw inCatch;
          pending = { error: inCatch };
        } finally {
          setCurrentScope(this.callStack, scope);
        }
      }
    }
    const finallyBlock = finallyNode ? child(finallyNode, 'block') : undefined;
    if (finallyBlock) this.runBlockIn(finallyBlock, scope, 'finally');
    if (pending) throw pending.error;
  }

  /**
   * try-with-resources (JLS §14.20.3): the resources are initialized in order
   * and are in scope only in the try block. When the block ends, however it
   * ends, the resources that were opened are closed in reverse order. An
   * exception from a close is suppressed if another is already propagating.
   * Catch and finally clauses then apply to all of it.
   */
  private executeTryWithResources(twr: CstNode, scope: Scope): void {
    const line = token(twr, 'Try')?.startLine || getLine(twr);
    const spec = child(twr, 'resourceSpecification')!;
    const resources = children(child(spec, 'resourceList')!, 'resource');
    const block = child(twr, 'block')!;
    const body = () => {
      const resourceScope = createScope(scope, 'try');
      setCurrentScope(this.callStack, resourceScope);
      const opened: { value: JavaValue; name: string }[] = [];
      let pending: { error: unknown } | undefined;
      try {
        for (const resource of resources) opened.push(this.openResource(resource, resourceScope));
        this.runBlockIn(block, resourceScope);
      } catch (thrown) {
        const e = this.atFailureSite(thrown);
        if (e instanceof HaltSignal || !(isControlSignal(e) || this.exceptionClassOf(e) !== undefined)) throw e;
        pending = { error: e };
      }
      for (let i = opened.length - 1; i >= 0; i--) {
        const { value, name } = opened[i];
        if (value.kind === 'null') continue;
        try {
          this.invokeMethod(value, 'close', [], name, line, line);
        } catch (thrown) {
          const e = this.atFailureSite(thrown);
          if (e instanceof HaltSignal || this.exceptionClassOf(e) === undefined) throw e;
          pending ??= { error: e };
        }
      }
      setCurrentScope(this.callStack, scope);
      if (pending) throw pending.error;
    };
    this.runTryCatchFinally(body, child(twr, 'catches'), child(twr, 'finally'), scope);
  }

  /** Declare (or, for `try (existing)`, evaluate) one resource, returning it and the name to report it by. */
  private openResource(resource: CstNode, scope: Scope): { value: JavaValue; name: string } {
    const decl = child(resource, 'localVariableDeclaration');
    if (!decl) {
      const access = child(child(resource, 'variableAccess')!, 'primary')!;
      return { value: this.evalPrimary(access, scope), name: sourceText(access) };
    }
    const declaredType = this.extractLocalVarType(child(decl, 'localVariableType')!);
    const declarator = children(child(decl, 'variableDeclaratorList')!, 'variableDeclarator')[0];
    const id = token(child(declarator, 'variableDeclaratorId')!, 'Identifier')!;
    const value = this.evalVariableInitializer(child(declarator, 'variableInitializer')!, declaredType, scope);
    setVariable(scope, id.image, value, declaredType === 'var' ? this.inferType(value) : declaredType);
    this.emitSnapshot(id.startLine);
    return { value, name: id.image };
  }

  /**
   * The class of the Java exception a thrown JS value stands for: an explicit
   * `throw`, or a runtime error such as `ArithmeticException: / by zero`.
   * Undefined for control-flow signals and for engine errors (an unsupported
   * feature, the step limit), which aren't Java exceptions and can't be caught.
   */
  private exceptionClassOf(e: unknown): string | undefined {
    if (e instanceof JavaThrow) return e.value.kind === 'objectRef' ? e.value.className : undefined;
    if (e instanceof JavaRuntimeError) return e.className; // no parsing, so it works at the stack's limit too
    if (e instanceof InterpreterError || e instanceof StdlibError) return parseRuntimeException(e.message)?.className;
    return undefined;
  }

  /**
   * The Java exception object a catch clause binds: the value a `throw` threw,
   * or a new object for a runtime error (ArithmeticException, …). Null for
   * anything that isn't a Java exception.
   */
  private toExceptionValue(e: unknown): JavaValue | null {
    if (e instanceof JavaThrow) return e.value;
    if (e instanceof InterpreterError || e instanceof StdlibError) {
      const parsed = parseRuntimeException(e.message);
      if (parsed) return newException(parsed.className, parsed.detail ? [javaString(parsed.detail)] : [], this.ctx);
    }
    return null;
  }

  /** The first catch clause with a type (for `A | B e`, either type) that the exception class is an instance of. */
  private matchCatch(catches: CstNode, excClass: string): { name: string; block: CstNode } | undefined {
    for (const clause of children(catches, 'catchClause')) {
      const param = child(clause, 'catchFormalParameter');
      if (!param) continue;
      const catchType = child(param, 'catchType');
      const types = catchType ? this.extractCatchTypes(catchType) : [];
      const name = token(child(param, 'variableDeclaratorId')!, 'Identifier')?.image || 'e';
      const block = child(clause, 'block');
      if (block && types.some(t => this.isSubclass(excClass, t))) {
        return { name, block };
      }
    }
    return undefined;
  }

  /** The types a catch clause names; `catch (A | B e)` names two. */
  private extractCatchTypes(catchType: CstNode): string[] {
    const types: string[] = [];
    const unann = child(catchType, 'unannClassType');
    if (unann) types.push(lastIdentifier(unann));
    for (const ct of children(catchType, 'classType')) types.push(lastIdentifier(ct));
    return types;
  }

  // ── Control flow ──

  private executeIf(ifStmt: CstNode, scope: Scope): void {
    const condition = child(ifStmt, 'expression')!;
    // A condition with an instanceof pattern binds its variable in a scope of
    // its own, which the branches nest in: `if (o instanceof String s) { … s … }`.
    const condScope = this.containsPattern(condition) ? createScope(scope, 'if') : scope;
    if (condScope !== scope) setCurrentScope(this.callStack, condScope);
    const condBool = javaValueToBoolean(this.evalExpression(condition, condScope));

    this.emitSnapshot(token(ifStmt, 'If')?.startLine || getLine(ifStmt));

    const stmts = children(ifStmt, 'statement');
    const branch = condBool ? stmts[0] : stmts[1];
    if (branch) {
      const branchScope = createScope(condScope, condBool ? 'if' : 'else');
      setCurrentScope(this.callStack, branchScope);
      this.executeStatement(branch, branchScope);
    }
    setCurrentScope(this.callStack, scope);
    // `if (!(o instanceof String s)) return;` leaves s in scope after the if
    // (JLS §6.3.2.2): the condition was false and the then-branch can't finish.
    if (condScope !== scope && !condBool && stmts.length === 1 && !canCompleteNormally(stmts[0])) {
      for (const [name, slot] of condScope.variables) scope.variables.set(name, slot);
    }
  }

  /** Does an expression contain an instanceof pattern (`o instanceof String s`)? */
  private containsPattern(expr: CstNode): boolean {
    let found = this.patternCache.get(expr);
    if (found === undefined) {
      found = findNode(expr, 'pattern') !== undefined;
      this.patternCache.set(expr, found);
    }
    return found;
  }

  private executeFor(forStmt: CstNode, scope: Scope, labels: readonly string[]): void {
    const enhanced = child(forStmt, 'enhancedForStatement');
    if (enhanced) {
      this.executeEnhancedFor(enhanced, scope, labels);
      return;
    }
    this.executeBasicFor(child(forStmt, 'basicForStatement')!, scope, labels);
  }

  private executeBasicFor(basic: CstNode, scope: Scope, labels: readonly string[]): void {
    const forScope = createScope(scope, 'for');
    setCurrentScope(this.callStack, forScope);
    const line = token(basic, 'For')?.startLine || getLine(basic);

    // Init
    const forInit = child(basic, 'forInit');
    if (forInit) {
      const localVarDecl = child(forInit, 'localVariableDeclaration');
      if (localVarDecl) {
        this.executeForLocalVarDecl(localVarDecl, forScope, line);
      } else {
        // Expression statement list
        const exprList = child(forInit, 'statementExpressionList');
        if (exprList) {
          for (const stmtExpr of children(exprList, 'statementExpression')) {
            const expr = child(stmtExpr, 'expression');
            if (expr) this.evalExpression(expr, forScope);
          }
          this.emitSnapshot(line);
        }
      }
    }

    while (true) {
      this.tick(line); // a loop can run without recording steps (in a toString() call, or `for (;;);`)
      this.atLine(line);

      // Condition
      setCurrentScope(this.callStack, forScope);
      const condExpr = child(basic, 'expression');
      if (condExpr) {
        const condValue = this.evalExpression(condExpr, forScope);
        this.emitSnapshot(line);
        if (!javaValueToBoolean(condValue)) break;
      }

      // Body — execute directly in forScope; the block's { } will create
      // its own child scope via executeStatementWithoutTrailing, so there's
      // no need for an extra wrapper scope here.
      const bodyStmt = child(basic, 'statement');
      if (bodyStmt) {
        try {
          this.executeStatement(bodyStmt, forScope);
        } catch (e) {
          if (e instanceof BreakSignal && targets(e, labels)) break;
          if (!(e instanceof ContinueSignal && targets(e, labels))) throw e;
          // continue: fall through to the update
        }
      }

      // Update
      setCurrentScope(this.callStack, forScope);
      const forUpdate = child(basic, 'forUpdate');
      if (forUpdate) {
        const exprList = child(forUpdate, 'statementExpressionList');
        if (exprList) {
          for (const stmtExpr of children(exprList, 'statementExpression')) {
            const expr = child(stmtExpr, 'expression');
            if (expr) this.evalExpression(expr, forScope);
          }
        }
      }
    }
    setCurrentScope(this.callStack, scope);
  }

  private executeForLocalVarDecl(decl: CstNode, scope: Scope, line: number): void {
    const typeNode = child(decl, 'localVariableType')!;
    const baseType = this.extractLocalVarType(typeNode);
    const declList = child(decl, 'variableDeclaratorList')!;

    for (const declarator of children(declList, 'variableDeclarator')) {
      const idNode = child(declarator, 'variableDeclaratorId')!;
      const name = token(idNode, 'Identifier')!.image;
      let type = baseType + dimsSuffix(child(idNode, 'dims'));
      const init = child(declarator, 'variableInitializer');
      if (!init) {
        declareUnassigned(scope, name, type, line);
        continue;
      }
      const value = this.evalVariableInitializer(init, type, scope);
      if (type === 'var') type = this.inferType(value);
      setVariable(scope, name, value, type);
    }
    this.emitSnapshot(line);
  }

  private executeEnhancedFor(enhanced: CstNode, scope: Scope, labels: readonly string[]): void {
    const forScope = createScope(scope, 'for');
    setCurrentScope(this.callStack, forScope);
    const line = token(enhanced, 'For')?.startLine || getLine(enhanced);

    // Get the loop variable
    const localVarDecl = child(enhanced, 'localVariableDeclaration')!;
    const typeNode = child(localVarDecl, 'localVariableType')!;
    let type = this.extractLocalVarType(typeNode);
    const declList = child(localVarDecl, 'variableDeclaratorList')!;
    const declarator = children(declList, 'variableDeclarator')[0];
    const idNode = child(declarator, 'variableDeclaratorId')!;
    const varName = token(idNode, 'Identifier')!.image;

    // Get the iterable expression
    const iterExpr = child(enhanced, 'expression')!;
    const iterValue = this.evalExpression(iterExpr, scope);

    let iterElements: JavaValue[];
    if (iterValue.kind === 'arrayRef') {
      const arr = this.heap.get(iterValue.heapId);
      if (!arr || !isJavaArray(arr)) {
        throw new InterpreterError('Enhanced for loop target is not an array', line);
      }
      iterElements = arr.elements;
      if (type === 'var') type = arr.elementType;
    } else if (iterValue.kind === 'null') {
      throw nullPointer(`Cannot iterate over "${sourceText(iterExpr)}" because it is null`, line);
    } else {
      // Collections (ArrayList, HashSet, keySet()/values()/entrySet() results, …)
      const collected = iterValue.kind === 'objectRef' && isBuiltinObject(this.heap.get(iterValue.heapId))
        ? this.stdlib(line, () => getIterableElements(iterValue, this.ctx))
        : undefined;
      if (!collected) {
        if (iterValue.kind === 'objectRef' && this.classes.has(iterValue.className)) {
          throw new UnsupportedFeatureError('For-each loops over your own Iterable classes', line);
        }
        throw new InterpreterError('Enhanced for loop requires an array or collection', line);
      }
      iterElements = collected;
      if (type === 'var') type = 'Object';
    }

    setVariable(forScope, varName, defaultValue(type), type);

    for (const element of iterElements) {
      this.tick(line); // a loop can run without recording steps (in a toString() call, or `for (;;);`)
      this.atLine(line);

      setCurrentScope(this.callStack, forScope);
      updateVariable(forScope, varName, element);
      this.emitSnapshot(line);

      const bodyStmt = child(enhanced, 'statement');
      if (bodyStmt) {
        try {
          this.executeStatement(bodyStmt, forScope);
        } catch (e) {
          if (e instanceof BreakSignal && targets(e, labels)) break;
          if (e instanceof ContinueSignal && targets(e, labels)) continue;
          throw e;
        }
      }
    }
    setCurrentScope(this.callStack, scope);
  }

  private executeWhile(whileStmt: CstNode, scope: Scope, labels: readonly string[]): void {
    const line = token(whileStmt, 'While')?.startLine || getLine(whileStmt);
    // Labeled scope so body variables show as "while block"
    const whileScope = createScope(scope, 'while');

    while (true) {
      this.tick(line); // a loop can run without recording steps (in a toString() call, or `for (;;);`)
      this.atLine(line);

      setCurrentScope(this.callStack, scope);
      const condExpr = child(whileStmt, 'expression')!;
      const condValue = this.evalExpression(condExpr, scope);
      this.emitSnapshot(line);
      if (!javaValueToBoolean(condValue)) break;

      const bodyStmt = child(whileStmt, 'statement');
      if (bodyStmt) {
        try {
          this.executeStatement(bodyStmt, whileScope);
        } catch (e) {
          if (e instanceof BreakSignal && targets(e, labels)) break;
          if (e instanceof ContinueSignal && targets(e, labels)) continue;
          throw e;
        }
      }
    }
    setCurrentScope(this.callStack, scope);
  }

  private executeDoWhile(doWhileStmt: CstNode, scope: Scope, labels: readonly string[]): void {
    const line = token(doWhileStmt, 'Do')?.startLine || getLine(doWhileStmt);
    const doScope = createScope(scope, 'do-while');
    let shouldContinue = true;

    do {
      this.tick(line); // a loop can run without recording steps (in a toString() call, or `for (;;);`)
      this.atLine(line);

      const bodyStmt = child(doWhileStmt, 'statement');
      if (bodyStmt) {
        try {
          this.executeStatement(bodyStmt, doScope);
        } catch (e) {
          if (e instanceof BreakSignal && targets(e, labels)) break;
          if (!(e instanceof ContinueSignal && targets(e, labels))) throw e;
        }
      }

      setCurrentScope(this.callStack, scope);
      const condExpr = child(doWhileStmt, 'expression')!;
      const condValue = this.evalExpression(condExpr, scope);
      this.emitSnapshot(line);
      shouldContinue = javaValueToBoolean(condValue);
    } while (shouldContinue);
    setCurrentScope(this.callStack, scope);
  }

  /**
   * A switch statement, or with `asExpression` a switch expression, which
   * returns its value. The block is either `case … ->` rules, which never fall
   * through, or `case …:` groups, which fall through until a break (or, in a
   * switch expression, a yield). The first matching label wins; `default`
   * applies only when no label matches, wherever it is written. The block is
   * one scope, and a pattern label binds its variable in it.
   */
  private evalSwitch(switchNode: CstNode, scope: Scope, asExpression: boolean): JavaValue {
    const line = token(switchNode, 'Switch')?.startLine || getLine(switchNode);
    const selectorExpr = child(switchNode, 'expression')!;
    const selector = this.evalExpression(selectorExpr, scope);
    this.emitSnapshot(line);

    const block = child(switchNode, 'switchBlock')!;
    const rules = children(block, 'switchRule');
    const groups = children(block, 'switchBlockStatementGroup');
    const switchScope = createScope(scope, 'switch');
    setCurrentScope(this.callStack, switchScope);
    try {
      const labelSets = rules.length > 0
        ? rules.map(r => children(r, 'switchLabel'))
        : groups.map(g => children(g, 'switchLabel'));
      const match = this.findSwitchMatch(labelSets, selector, sourceText(selectorExpr), switchScope, line);
      if (match < 0) {
        // javac requires a switch expression to cover every value, so this is unreachable there.
        if (asExpression) throw new InterpreterError('No case of the switch expression matched', line);
        return javaNull();
      }
      if (rules.length > 0) return this.runSwitchRule(rules[match], switchScope, asExpression, line);
      for (let i = match; i < groups.length; i++) {
        const stmts = child(groups[i], 'blockStatements');
        for (const blockStmt of stmts ? children(stmts, 'blockStatement') : []) {
          this.executeBlockStatement(blockStmt, switchScope);
        }
      }
      if (asExpression) throw new InterpreterError('The switch expression ended without yielding a value', line);
      return javaNull();
    } catch (e) {
      if (asExpression && e instanceof YieldSignal) return e.value;
      if (!asExpression && e instanceof BreakSignal && e.label === undefined) return javaNull();
      throw this.atFailureSite(e); // while the switch block's locals are still shown
    } finally {
      setCurrentScope(this.callStack, scope);
    }
  }

  /** The index of the label set holding the first matching label, else of the one with `default`, else -1. */
  private findSwitchMatch(labelSets: CstNode[][], selector: JavaValue, selectorText: string, scope: Scope, line: number): number {
    if (selector.kind === 'null' && !labelSets.some(set => set.some(l => has(l, 'Null')))) {
      throw nullPointer(`Cannot switch on "${selectorText}" because it is null`, line);
    }
    let defaultIndex = -1;
    for (let i = 0; i < labelSets.length; i++) {
      for (const label of labelSets[i]) {
        if (this.switchLabelMatches(label, selector, scope)) return i;
        if (has(label, 'Default')) defaultIndex = i;
      }
    }
    return defaultIndex;
  }

  /** Does `case …` match the selector? A pattern label binds its variable in `scope` when it does. */
  private switchLabelMatches(label: CstNode, selector: JavaValue, scope: Scope): boolean {
    if (has(label, 'Null')) return selector.kind === 'null'; // `case null` or `case null, default`
    for (const constant of children(label, 'caseConstant')) {
      const value = this.evalConditionalExpression(child(constant, 'conditionalExpression')!, scope);
      if (javaValuesEqual(selector, value)) return true;
    }
    for (const casePattern of children(label, 'casePattern')) {
      if (!this.matchPattern(child(casePattern, 'pattern')!, selector, scope)) continue;
      const guard = child(label, 'guard');
      if (!guard || javaValueToBoolean(this.evalExpression(child(guard, 'expression')!, scope))) return true;
    }
    return false;
  }

  /** Run the body of a `case … ->` rule: an expression, a block or a throw. */
  private runSwitchRule(rule: CstNode, scope: Scope, asExpression: boolean, line: number): JavaValue {
    const expr = child(rule, 'expression');
    if (expr) {
      const value = this.evalExpression(expr, scope);
      if (!asExpression) this.emitSnapshot(getLine(expr));
      return value;
    }
    const throwStmt = child(rule, 'throwStatement');
    if (throwStmt) this.executeThrow(throwStmt, scope);
    this.runBlockIn(child(rule, 'block')!, scope);
    if (asExpression) throw new InterpreterError('The switch expression ended without yielding a value', line);
    return javaNull();
  }

  // ── Expression evaluation ──

  evalExpression(expr: CstNode, scope: Scope): JavaValue {
    // expression > conditionalExpression > ... (assignments are binary expressions)
    const condExpr = child(expr, 'conditionalExpression');
    if (condExpr) return this.evalConditionalExpression(condExpr, scope);
    if (has(expr, 'lambdaExpression')) throw new UnsupportedFeatureError('Lambda expressions', getLine(expr));
    throw new InterpreterError('Unrecognized expression', getLine(expr));
  }

  private evalConditionalExpression(condExpr: CstNode, scope: Scope): JavaValue {
    const result = this.evalBinaryExpression(child(condExpr, 'binaryExpression')!, scope);

    // Ternary operator: condition ? trueExpr : falseExpr
    if (has(condExpr, 'QuestionMark')) {
      const exprs = children(condExpr, 'expression');
      if (exprs.length >= 2) {
        return javaValueToBoolean(result)
          ? this.evalExpression(exprs[0], scope)
          : this.evalExpression(exprs[1], scope);
      }
    }

    return result;
  }

  private evalBinaryExpression(binExpr: CstNode, scope: Scope): JavaValue {
    // binaryExpression contains interleaved unaryExpression and operator tokens
    const allChildren: (CstNode | CstToken)[] = [];
    for (const items of Object.values(binExpr.children)) {
      for (const item of items) allChildren.push(item);
    }

    // Sort by position to get the correct order
    allChildren.sort((a, b) => {
      const aLine = isCstToken(a) ? a.startLine : getLine(a);
      const aCol = isCstToken(a) ? a.startColumn : (getFirstToken(a)?.startColumn || 0);
      const bLine = isCstToken(b) ? b.startLine : getLine(b);
      const bCol = isCstToken(b) ? b.startColumn : (getFirstToken(b)?.startColumn || 0);
      return aLine !== bLine ? aLine - bLine : aCol - bCol;
    });

    const operators: string[] = [];

    for (const item of allChildren) {
      if (isCstToken(item)) {
        const op = item.image;
        // Skip parentheses and other non-operator tokens
        if (['(', ')', '{', '}', '[', ']', ';', ','].includes(op)) continue;
        operators.push(op);
      }
    }

    // Handle assignment operators
    if (operators.length === 1 && isAssignmentOp(operators[0])) {
      return this.evalAssignment(binExpr, operators[0], scope);
    }

    // Build operand THUNKS rather than evaluating eagerly — the operator
    // chain needs to short-circuit && / || without forcing the RHS.
    // Without thunks, `false && side()` would still call side(), violating
    // Java semantics and producing observable side effects.
    //
    // `x instanceof Type` is folded here: the trailing `referenceType` operand
    // is combined with the preceding value into a single boolean operand, and
    // the `instanceof` token is dropped from the operator chain. A pattern,
    // `x instanceof String s`, also binds s in `scope` when it matches.
    const operandThunks: Array<() => JavaValue> = [];
    const chainOps: string[] = [];
    for (const item of allChildren) {
      if (isCstNode(item) && item.name === 'unaryExpression') {
        const node = item;
        operandThunks.push(() => this.evalUnaryExpression(node, scope));
      } else if (isCstNode(item) && item.name === 'expression') {
        const node = item;
        operandThunks.push(() => this.evalExpression(node, scope));
      } else if (isCstNode(item) && item.name === 'referenceType') {
        const typeName = this.referenceTypeName(item);
        const operand = operandThunks.pop()!;
        operandThunks.push(() => javaBool(this.isInstanceOf(operand(), typeName)));
      } else if (isCstNode(item) && item.name === 'pattern') {
        const pattern = item;
        const operand = operandThunks.pop()!;
        operandThunks.push(() => javaBool(this.matchPattern(pattern, operand(), scope)));
      } else if (isCstToken(item)) {
        const op = item.image;
        if (['(', ')', '{', '}', '[', ']', ';', ','].includes(op)) continue;
        if (op === 'instanceof') continue; // folded into the referenceType operand
        chainOps.push(op);
      }
    }

    if (operandThunks.length === 0) throw new InterpreterError('Unrecognized expression', getLine(binExpr));
    if (chainOps.length === 0) return operandThunks[0]();

    // Evaluate left to right with precedence (short-circuits && / ||)
    return this.evalOperatorChain(operandThunks, chainOps);
  }

  private evalAssignment(binExpr: CstNode, op: string, scope: Scope): JavaValue {
    const unaryExprs = children(binExpr, 'unaryExpression');
    const target = unaryExprs.length > 0 ? bareOperand(unaryExprs[0]) : undefined;
    if (!target) throw new InterpreterError('Invalid assignment target', getLine(binExpr));
    const ref = this.resolveReference(target, scope);

    const evalRhs = (): JavaValue => {
      const rhsExprs = children(binExpr, 'expression');
      if (rhsExprs.length > 0) return this.evalExpression(rhsExprs[0], scope);
      if (unaryExprs.length > 1) return this.evalUnaryExpression(unaryExprs[1], scope);
      throw new InterpreterError('Assignment has no right-hand side', getLine(binExpr));
    };

    if (op === '=') return ref.set(evalRhs());

    // Compound assignment `v op= e` means `v = (T) (v op e)`, where T is v's type.
    // The variable is read before the right-hand side runs (JLS §15.26.2), so
    // `x += (x = 5)` adds the old x.
    const current = ref.get();
    const combined = applyBinaryOp(op.slice(0, -1), current, evalRhs(), this.heap, (v) => this.stringify(v));
    return ref.set(this.narrowToDeclaredType(combined, ref.declaredType));
  }

  /**
   * The variable a primary expression names, for `=`, compound assignment and
   * `++`/`--`. Everything up to the last selector is evaluated with the normal
   * read path; the last selector (or a bare name) becomes the Reference. So
   * `a.b.c = v`, `this.x.y = v`, `arr[i].f = v` and `Main.X = v` all write to
   * exactly the variable written in the source.
   */
  private resolveReference(primary: CstNode, scope: Scope): Reference {
    const chain = this.primaryChain(primary);
    const count = chain.selectors.length;
    if (count === 0) {
      const base = chain.base.step;
      if (base.kind === 'name') return this.nameReference(base.name, scope, chain.base.line);
      const inner = base.kind === 'expression' ? parenthesizedOperand(base.prefix) : undefined;
      if (inner) return this.resolveReference(inner, scope); // (x) = 5
      throw new InterpreterError(`'${chain.base.text}' is not a variable, so it can't be assigned to`, chain.base.line);
    }

    const last = chain.selectors[count - 1];
    const targetText = count === 1 ? chain.base.text : chain.selectors[count - 2].text;
    const target = this.evalChain(chain, count - 1, scope, primary);
    switch (last.step.kind) {
      case 'field':
        return this.memberReference(target, last.step.name, targetText, last.line);
      case 'index': {
        const array = this.chainValue(target, last.line);
        const index = javaValueToNumber(this.evalExpression(last.step.index, scope));
        return arrayElementReference(this.heap, array, index, targetText, last.line);
      }
      case 'unsupported':
        throw new UnsupportedFeatureError(last.step.construct, last.line, last.step.singular);
      case 'call':
        throw new InterpreterError(`'${last.text}' is not a variable, so it can't be assigned to`, last.line);
    }
  }

  /** A simple name as a variable: a local or parameter, a field of `this`, or a static field in scope. */
  private nameReference(name: string, scope: Scope, line: number): Reference {
    const local = this.lookupLocal(scope, name);
    if (local) return slotReference(local, name, line);
    const self = this.getCurrentThis(scope);
    if (self && this.objectHasField(self, name)) {
      return fieldReference(this.heap, self, name, this.fieldDeclaredType(self, name), 'this', line);
    }
    const found = this.findStatic(name);
    if (found) return this.staticReference(found.owner, found.slot);
    throw this.undefinedName(name, line);
  }

  /** `target.name` as a variable: an instance field, or a static field reached through its class. */
  private memberReference(target: ChainValue, name: string, targetText: string, line: number): Reference {
    if (target.kind === 'value') {
      if (target.value.kind === 'arrayRef' && name === 'length') {
        throw new InterpreterError("The length of an array can't be assigned to", line);
      }
      return fieldReference(this.heap, target.value, name, this.fieldDeclaredType(target.value, name), targetText, line);
    }
    if (target.kind === 'type') {
      if (this.classes.has(target.name)) {
        const found = this.staticSlotIn(target.name, name);
        if (found) return this.staticReference(found.owner, found.slot);
        throw new InterpreterError(`Field '${name}' does not exist on ${target.name}`, line);
      }
      throw new InterpreterError(`${target.name}.${name} can't be assigned to`, line);
    }
    throw this.undefinedName(target.path[0], line);
  }

  /**
   * A static field as a variable. Reading or writing it first initializes its
   * class (JLS §12.4.1), unless it is a constant. The initialization happens
   * at the access, so `C.x = f()` calls f() before initializing C, as Java does.
   */
  private staticReference(owner: string, slot: StaticSlot): Reference {
    const init = () => {
      if (!slot.constant) this.initClass(owner);
    };
    return {
      get: () => {
        init();
        return slot.value;
      },
      set: (value) => {
        init();
        slot.value = assignmentConversion(value, slot.type);
        return slot.value;
      },
      declaredType: slot.type,
    };
  }

  /**
   * The static field a simple name refers to: one of the current class's (or
   * of an interface it implements), else one of a class it is nested in.
   */
  private findStatic(name: string): { owner: string; slot: StaticSlot } | undefined {
    for (let cls = this.currentClassName(); cls; cls = this.classes.get(cls)?.outer) {
      const found = this.staticSlotIn(cls, name);
      if (found) return found;
    }
    return undefined;
  }

  /** A static field of a class, or a constant of an interface it implements. */
  private staticSlotIn(className: string, name: string, seen = new Set<string>()): { owner: string; slot: StaticSlot } | undefined {
    const slot = this.staticFields.get(className)?.get(name);
    if (slot) return { owner: className, slot };
    seen.add(className);
    for (const iface of this.classes.get(className)?.interfaces ?? []) {
      const found = seen.has(iface) ? undefined : this.staticSlotIn(iface, name, seen);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * The error for a name that resolves to nothing. In an inner (non-static
   * nested) class, a field of the enclosing object is reachable in Java, but
   * that needs the outer instance, which is #16.
   */
  private undefinedName(name: string, line: number): InterpreterError {
    if (this.enclosingInstanceMember(name, 'field')) {
      return new UnsupportedFeatureError(`Inner classes using a field of the enclosing object ('${name}')`, line);
    }
    return new InterpreterError(`Variable '${name}' is not defined`, line);
  }

  /** Whether the current class is an inner class and an enclosing class has an instance field or method with this name. */
  private enclosingInstanceMember(name: string, kind: 'field' | 'method'): boolean {
    for (let cls = this.classes.get(this.currentClassName() ?? ''); cls?.isInner; cls = this.classes.get(cls.outer ?? '')) {
      const outer = cls.outer;
      if (!outer) break;
      const found = kind === 'field'
        ? this.instanceFields.get(outer)?.some(f => f.name === name)
        : this.methodsByClass.get(outer)?.get(name)?.some(m => !m.isStatic);
      if (found) return true;
    }
    return false;
  }

  /** A local variable or parameter, searching block scopes out to the method's scope. */
  private lookupLocal(scope: Scope, name: string): VariableSlot | undefined {
    for (let s: Scope | null = scope; s; s = s.parent) {
      const entry = s.variables.get(name);
      if (entry) return entry;
    }
    return undefined;
  }

  private getCurrentThis(scope: Scope): JavaValue | undefined {
    return lookupVariable(scope, 'this')?.value;
  }

  /**
   * The class whose method is currently executing (innermost call-stack frame).
   * Used to resolve unqualified static calls against the enclosing class — e.g.
   * a helper method called from a sibling static method in a non-entry class.
   */
  private currentClassName(): string | undefined {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      if (this.callStack[i].className) return this.callStack[i].className;
    }
    return undefined;
  }

  private resolveThis(scope: Scope, line: number): JavaValue {
    const thisValue = this.getCurrentThis(scope);
    if (!thisValue) {
      throw new InterpreterError("'this' cannot be used in a static context", line);
    }
    return thisValue;
  }

  private objectHasField(obj: JavaValue, fieldName: string): boolean {
    if (obj.kind !== 'objectRef') return false;
    const objData = this.heap.get(obj.heapId);
    return Boolean(objData && isJavaObject(objData) && objData.fields.has(fieldName));
  }

  /** A user class's declared type for a field ('Object' when unknown, which skips conversion). */
  private fieldDeclaredType(obj: JavaValue, fieldName: string): JavaType {
    if (obj.kind !== 'objectRef') return 'Object';
    return this.instanceFields.get(obj.className)?.find(f => f.name === fieldName)?.type ?? 'Object';
  }

  /**
   * The implicit cast in compound assignment (`v op= e` is `v = (T) (v op e)`,
   * JLS §15.26.2) and in `++`/`--` (JLS §15.14.2): the result goes back to the
   * variable's own type, so `salary *= 1.5` stays an int and `c += 2` stays a char.
   */
  private narrowToDeclaredType(value: JavaValue, type: JavaType): JavaValue {
    if (value.kind !== 'primitive') return value;
    switch (type) {
      case 'int': case 'short': case 'byte': case 'char': case 'boolean': case 'float': case 'double':
        return this.castPrimitiveValue(value, type);
      case 'long':
        // castPrimitiveValue cuts long to 32 bits (#10); keep the magnitude instead.
        return { kind: 'primitive', javaType: 'long', value: Math.trunc(javaValueToNumber(value)) || 0 };
    }
    return value; // String (+=), boxed and reference types
  }

  private evalOperatorChain(operandThunks: Array<() => JavaValue>, operators: string[]): JavaValue {
    // Handle operator precedence by grouping
    // Order: * / % -> + - -> << >> >>> -> < > <= >= -> == != -> & -> ^ -> | -> && -> ||
    const precGroups = [
      ['*', '/', '%'],
      ['+', '-'],
      ['<<', '>>', '>>>'],
      ['<', '>', '<=', '>=', 'instanceof'],
      ['==', '!='],
      ['&'],
      ['^'],
      ['|'],
      ['&&'],
      ['||'],
    ];

    let vals: Array<() => JavaValue> = [...operandThunks];
    let ops = [...operators];
    const heap = this.heap;
    const stringify = (v: JavaValue) => this.stringify(v);

    for (const group of precGroups) {
      const newVals: Array<() => JavaValue> = [vals[0]];
      const newOps: string[] = [];
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        if (group.includes(op)) {
          const left = newVals.pop()!;
          const right = vals[i + 1];
          if (op === '&&') {
            newVals.push(() => {
              const l = left();
              return javaValueToBoolean(l) ? right() : javaBool(false);
            });
          } else if (op === '||') {
            newVals.push(() => {
              const l = left();
              return javaValueToBoolean(l) ? javaBool(true) : right();
            });
          } else {
            newVals.push(() => applyBinaryOp(op, left(), right(), heap, stringify));
          }
        } else {
          newVals.push(vals[i + 1]);
          newOps.push(op);
        }
      }
      vals = newVals;
      ops = newOps;
    }

    return vals[0]();
  }

  private evalUnaryExpression(unary: CstNode, scope: Scope): JavaValue {
    const primary = child(unary, 'primary')!;
    // Most operands have no operators. Evaluating them directly keeps recursion
    // shallow on the JavaScript stack, where Java calls still run (#14).
    if (!unary.children.UnaryPrefixOperator && !unary.children.UnarySuffixOperator) return this.evalPrimary(primary, scope);
    // Prefix operators are listed in source order: `- ++x` is ['-', '++'].
    const prefixOps = tokens(unary, 'UnaryPrefixOperator').map(t => t.image);
    const postfixOp = token(unary, 'UnarySuffixOperator')?.image;
    return this.evalOperand(primary, prefixOps, postfixOp, scope, getLine(unary));
  }

  /** A primary with its prefix operators (in source order) and postfix operator. */
  private evalOperand(primary: CstNode, prefixOps: string[], postfixOp: string | undefined, scope: Scope, line: number): JavaValue {
    let value: JavaValue;
    if (postfixOp === '++' || postfixOp === '--') {
      // Postfix binds tighter than any prefix operator, and yields the old value.
      value = this.incrementVariable(primary, scope, postfixOp === '++' ? 1 : -1, false);
    } else if (prefixOps.length > 0 && (prefixOps[prefixOps.length - 1] === '++' || prefixOps[prefixOps.length - 1] === '--')) {
      value = this.incrementVariable(primary, scope, prefixOps.pop() === '++' ? 1 : -1, true);
    } else {
      value = this.evalPrimary(primary, scope);
    }
    for (let i = prefixOps.length - 1; i >= 0; i--) {
      value = this.applyPrefixOperator(prefixOps[i], value, line);
    }
    return value;
  }

  private applyPrefixOperator(op: string, val: JavaValue, line: number): JavaValue {
    switch (op) {
      case '!': return javaBool(!javaValueToBoolean(val));
      case '-': {
        const n = javaValueToNumber(val);
        if (val.kind === 'primitive' && (val.javaType === 'double' || val.javaType === 'float')) {
          return javaDouble(-n);
        }
        return javaInt(-n);
      }
      case '+': return val;
      case '~': return javaInt(~(javaValueToNumber(val) | 0));
      case '++': case '--':
        throw new InterpreterError(`${op} needs a variable to change`, line);
    }
    throw new InterpreterError(`Unrecognized operator ${op}`, line);
  }

  /**
   * `++`/`--` on the variable a primary names (a local, field, static or array
   * element). The result is narrowed back to the variable's type, so `c++` on a
   * char stays a char. Prefix returns the new value, postfix the old one.
   */
  private incrementVariable(primary: CstNode, scope: Scope, delta: number, returnNew: boolean): JavaValue {
    const ref = this.resolveReference(primary, scope);
    const old = ref.get();
    const stored = ref.set(this.narrowToDeclaredType(stepValue(old, delta), ref.declaredType));
    return returnNew ? stored : old;
  }

  // ── Primary expression evaluation ──

  private evalPrimary(primary: CstNode, scope: Scope): JavaValue {
    const chain = this.primaryChain(primary);
    return this.chainValue(this.evalChain(chain, chain.selectors.length, scope, primary), getLine(primary));
  }

  /** A primary that starts with a literal, a parenthesized expression, a cast, `new` or a switch expression. */
  private evalPrimaryPrefix(prefix: CstNode, scope: Scope): JavaValue {
    const literal = child(prefix, 'literal');
    if (literal) return this.evalLiteral(literal);

    const parenExpr = child(prefix, 'parenthesisExpression');
    if (parenExpr) return this.evalExpression(child(parenExpr, 'expression')!, scope);

    // Cast expression, e.g. (int) values[0]
    const castExpr = child(prefix, 'castExpression');
    if (castExpr) return this.evalCastExpression(castExpr, scope);

    const newExpr = child(prefix, 'newExpression');
    if (newExpr) return this.evalNewExpression(newExpr, scope);

    const switchExpr = child(prefix, 'switchStatement');
    if (switchExpr) return this.evalSwitch(switchExpr, scope, true);

    throw new InterpreterError('Unrecognized expression', getLine(prefix));
  }

  private evalCastExpression(castExpr: CstNode, scope: Scope): JavaValue {
    const line = getLine(castExpr);
    const primitiveCast = child(castExpr, 'primitiveCastExpression');
    if (primitiveCast) {
      const primitiveType = this.extractPrimitiveType(child(primitiveCast, 'primitiveType'));
      return this.castPrimitiveValue(this.evalUnaryExpression(child(primitiveCast, 'unaryExpression')!, scope), primitiveType);
    }

    // Reference cast, e.g. (Point) o. It is checked when JavaTutor knows the
    // type; a cast to a type variable (T) is unchecked in Java too.
    const refCast = child(castExpr, 'referenceTypeCastExpression')!;
    if (has(refCast, 'lambdaExpression')) throw new UnsupportedFeatureError('Lambda expressions', line);
    const type = this.referenceTypeName(child(refCast, 'referenceType')!);
    const operand = child(refCast, 'unaryExpressionNotPlusMinus')!;
    const prefixOps = tokens(operand, 'UnaryPrefixOperatorNotPlusMinus').map(t => t.image);
    const value = this.evalOperand(child(operand, 'primary')!, prefixOps, token(operand, 'UnarySuffixOperator')?.image, scope, line);
    if (value.kind !== 'null' && this.isCheckableType(type) && !this.isInstanceOf(value, type)) {
      throw new JavaRuntimeError('ClassCastException', `class ${this.runtimeClassName(value)} cannot be cast to class ${type}`, line);
    }
    return value;
  }

  /** Can a cast to this type be checked? Not for a type variable (T) or a library type JavaTutor doesn't model. */
  private isCheckableType(type: string): boolean {
    const base = type.replace(/(\[\])+$/, '');
    return PRIMITIVE_TYPES.has(base) || this.classes.has(base) || isKnownLibraryType(base);
  }

  /** The class of a value, as a ClassCastException names it. */
  private runtimeClassName(value: JavaValue): string {
    switch (value.kind) {
      case 'string': return 'String';
      case 'primitive': return BOXES[value.javaType];
      case 'arrayRef': return this.inferType(value);
      case 'objectRef': return this.binaryName(value.className);
      case 'null': return 'null';
    }
  }

  /** `value instanceof type`: user classes and interfaces, library types, boxed primitives, arrays. */
  private isInstanceOf(value: JavaValue, type: string): boolean {
    switch (value.kind) {
      case 'null': return false;
      case 'string': return isStringType(type);
      case 'primitive': return isBoxedInstanceOf(value.javaType, type);
      case 'arrayRef': {
        if (!type.endsWith('[]')) return ARRAY_SUPERTYPES.has(type);
        const arr = this.heap.get(value.heapId);
        return !!arr && isJavaArray(arr) && this.isArrayElementAssignable(arr.elementType, type.slice(0, -2));
      }
      case 'objectRef':
        // A library object follows the library's hierarchy, even if a user class shares its name.
        return isBuiltinObject(this.heap.get(value.heapId)) ? isLibrarySubtype(value.className, type) : this.isSubclass(value.className, type);
    }
  }

  /** Is an array of `elementType` an array of `target`? Arrays of references are covariant: a String[] is an Object[]. */
  private isArrayElementAssignable(elementType: string, target: string): boolean {
    if (PRIMITIVE_TYPES.has(elementType) || PRIMITIVE_TYPES.has(target)) return elementType === target;
    const elementIsArray = elementType.endsWith('[]');
    const targetIsArray = target.endsWith('[]');
    if (elementIsArray && targetIsArray) return this.isArrayElementAssignable(elementType.slice(0, -2), target.slice(0, -2));
    if (elementIsArray) return ARRAY_SUPERTYPES.has(target);
    return !targetIsArray && this.isSubclass(elementType, target);
  }

  /**
   * Is class `cls` the type `type` or a subtype of it? For a user class: itself,
   * its interfaces and their superinterfaces, and the library exception class
   * it extends. For a library class, the library's hierarchy.
   */
  private isSubclass(cls: string, type: string, seen = new Set<string>()): boolean {
    if (cls === type || type === 'Object') return true;
    const info = this.classes.get(cls);
    if (!info) {
      if (cls === 'String') return isStringType(type);
      const unboxed = UNBOXED[cls];
      return unboxed ? isBoxedInstanceOf(unboxed, type) : isLibrarySubtype(cls, type);
    }
    seen.add(cls);
    if (info.interfaces.some(i => !seen.has(i) && this.isSubclass(i, type, seen))) return true;
    return info.superclass !== undefined && this.isSubclass(info.superclass, type, seen);
  }

  /** Match a type pattern (`String s`) against a value, binding the variable in `scope` on a match. */
  private matchPattern(pattern: CstNode, value: JavaValue, scope: Scope): boolean {
    const typePattern = child(pattern, 'typePattern');
    if (!typePattern) throw new UnsupportedFeatureError('Record patterns', getLine(pattern));
    const decl = child(typePattern, 'localVariableDeclaration')!;
    const type = this.extractLocalVarType(child(decl, 'localVariableType')!);
    if (!this.isInstanceOf(value, type)) return false;
    const declarator = children(child(decl, 'variableDeclaratorList')!, 'variableDeclarator')[0];
    setVariable(scope, token(child(declarator, 'variableDeclaratorId')!, 'Identifier')!.image, value, type);
    return true;
  }

  private castPrimitiveValue(value: JavaValue, targetType: JavaType): JavaValue {
    if (targetType === 'boolean') return javaBool(javaValueToBoolean(value));
    const n = javaValueToNumber(value);
    switch (targetType) {
      case 'double':
      case 'float':
        return { kind: 'primitive', javaType: targetType, value: n };
      case 'char':
        return javaChar(n | 0);
      case 'long':
      case 'byte':
      case 'short':
        return { kind: 'primitive', javaType: targetType, value: n | 0 };
      case 'int':
      default:
        return javaInt(n);
    }
  }

  private evalLiteral(literal: CstNode): JavaValue {
    // Integer literal
    const intLit = child(literal, 'integerLiteral');
    if (intLit) {
      const tok = token(intLit, 'DecimalLiteral') || token(intLit, 'HexLiteral') || token(intLit, 'OctalLiteral') || token(intLit, 'BinaryLiteral');
      if (tok) {
        let img = tok.image.replace(/_/g, '');
        if (img.endsWith('L') || img.endsWith('l')) img = img.slice(0, -1);
        return javaInt(parseInt(img, 10));
      }
    }

    // Floating point literal
    const fpLit = child(literal, 'floatingPointLiteral');
    if (fpLit) {
      const tok = token(fpLit, 'FloatLiteral');
      if (!tok) throw new UnsupportedFeatureError('Hexadecimal floating-point literals', getLine(fpLit));
      let img = tok.image.replace(/_/g, '');
      if (img.endsWith('f') || img.endsWith('F') || img.endsWith('d') || img.endsWith('D')) {
        img = img.slice(0, -1);
      }
      return javaDouble(parseFloat(img));
    }

    // Boolean literal
    const boolLit = child(literal, 'booleanLiteral');
    if (boolLit) {
      return javaBool(has(boolLit, 'True'));
    }

    const strTok = token(literal, 'StringLiteral');
    if (strTok) return javaString(stringLiteralValue(strTok.image));
    const textBlock = token(literal, 'TextBlock');
    if (textBlock) return javaString(textBlockValue(textBlock.image));
    const charTok = token(literal, 'CharLiteral');
    if (charTok) return javaChar(charLiteralValue(charTok.image));
    if (has(literal, 'Null')) return javaNull();
    throw new InterpreterError('Unrecognized literal', getLine(literal));
  }

  // ── Names, selectors and method calls ──
  //
  // A primary expression is a base followed by selectors, evaluated left to
  // right: `people[1].age`, `head.next.getVal()`, `this.data[this.size]`,
  // `Main.total`, `java.util.Arrays.toString(a)`. Reads, method calls and
  // writes (resolveReference) all walk the same chain, so every shape resolves
  // the same way.

  /** The base and selectors of a primary, cached per CST node (the tree never changes). */
  private primaryChain(primary: CstNode): PrimaryChain {
    let chain = this.chainCache.get(primary);
    if (!chain) {
      chain = buildPrimaryChain(primary);
      this.chainCache.set(primary, chain);
    }
    return chain;
  }

  /** Evaluate a chain's base and its first `count` selectors. */
  private evalChain(chain: PrimaryChain, count: number, scope: Scope, primary: CstNode): ChainValue {
    let current = this.evalChainBase(chain.base, scope, primary);
    for (let i = 0; i < count; i++) {
      const receiverText = i === 0 ? chain.base.text : chain.selectors[i - 1].text;
      current = this.applySelector(current, chain.selectors[i], receiverText, scope, primary);
    }
    return current;
  }

  private evalChainBase(base: ChainStep<ChainBase>, scope: Scope, primary: CstNode): ChainValue {
    const step = base.step;
    switch (step.kind) {
      case 'name':
        return this.resolveSimpleName(step.name, scope, base.line);
      case 'this':
        return { kind: 'value', value: this.resolveThis(scope, base.line) };
      case 'super':
        throw new UnsupportedFeatureError("Members reached through 'super' (super.name)", base.line);
      case 'call': {
        const args = this.evalArguments(step.args, scope);
        return { kind: 'value', value: this.invokeUnqualified(step.name, args, scope, getLine(primary), base.line) };
      }
      case 'expression':
        return { kind: 'value', value: this.evalPrimaryPrefix(step.prefix, scope) };
      case 'unsupported':
        throw new UnsupportedFeatureError(step.construct, base.line, step.singular);
    }
  }

  /**
   * What a simple name refers to, in Java's order: a local variable or
   * parameter, a field of `this`, a static field in scope, then a class.
   * Anything else stays unresolved (a package prefix like `java.util`, or an
   * undefined name) and is reported only if it is used as a value.
   */
  private resolveSimpleName(name: string, scope: Scope, line: number): ChainValue {
    const local = this.lookupLocal(scope, name);
    if (local) {
      if (local.unassigned) throw notInitialized(name, line);
      return { kind: 'value', value: local.value };
    }
    const self = this.getCurrentThis(scope);
    if (self && this.objectHasField(self, name)) {
      return { kind: 'value', value: fieldReference(this.heap, self, name, 'Object', 'this', 0).get() };
    }
    const found = this.findStatic(name);
    if (found) return { kind: 'value', value: this.staticReference(found.owner, found.slot).get() };
    if (this.isKnownClass(name)) return { kind: 'type', name };
    return { kind: 'unresolved', path: [name] };
  }

  private isKnownClass(name: string): boolean {
    return this.classes.has(name) || LIBRARY_CLASSES.has(name);
  }

  private applySelector(
    current: ChainValue,
    selector: ChainStep<Selector>,
    receiverText: string,
    scope: Scope,
    primary: CstNode,
  ): ChainValue {
    const { step, line } = selector;
    switch (step.kind) {
      case 'field':
        return this.selectField(current, step.name, receiverText, line);
      case 'call': {
        // The receiver is evaluated first, then the arguments (JLS §15.12.4).
        const args = this.evalArguments(step.args, scope);
        return { kind: 'value', value: this.invokeOn(current, step.name, args, receiverText, getLine(primary), line) };
      }
      case 'index': {
        const array = this.chainValue(current, line);
        const index = javaValueToNumber(this.evalExpression(step.index, scope));
        return { kind: 'value', value: arrayElementReference(this.heap, array, index, receiverText, line).get() };
      }
      case 'unsupported':
        throw new UnsupportedFeatureError(step.construct, line, step.singular);
    }
  }

  /** `current.name`: a field, an array's length, a class's static member, or the next part of a package name. */
  private selectField(current: ChainValue, name: string, receiverText: string, line: number): ChainValue {
    if (current.kind === 'value') {
      const target = current.value;
      if (target.kind === 'arrayRef' || (target.kind === 'null' && name === 'length')) {
        if (name !== 'length') throw new InterpreterError(`Arrays have no field '${name}', only length`, line);
        return { kind: 'value', value: javaInt(arrayLength(this.heap, target, receiverText, line)) };
      }
      return { kind: 'value', value: fieldReference(this.heap, target, name, 'Object', receiverText, line).get() };
    }
    if (current.kind === 'type') return this.staticMember(current.name, name, line);
    // An unresolved name followed by a class name was a package: java.util.Arrays
    if (this.isKnownClass(name)) return { kind: 'type', name };
    return { kind: 'unresolved', path: [...current.path, name] };
  }

  /** `ClassName.name`: a static field, a nested class, or a library constant such as Math.PI or System.out. */
  private staticMember(className: string, name: string, line: number): ChainValue {
    if (this.classes.has(className)) {
      const found = this.staticSlotIn(className, name);
      if (found) return { kind: 'value', value: this.staticReference(found.owner, found.slot).get() };
      if (this.classes.has(name)) return { kind: 'type', name };
      if (this.instanceFields.get(className)?.some(f => f.name === name)) {
        throw new InterpreterError(`'${name}' is an instance field of ${className}, so it needs an object`, line);
      }
      throw new InterpreterError(`Field '${name}' does not exist on ${className}`, line);
    }
    if (className === 'System') {
      if (name === 'out') return { kind: 'value', value: SYSTEM_OUT };
      if (name === 'err') return { kind: 'value', value: SYSTEM_ERR };
      if (name === 'in') return { kind: 'value', value: SYSTEM_IN };
    }
    const constant = getStaticField(className, name, this.ctx);
    if (constant) return { kind: 'value', value: constant };
    if (this.isKnownClass(name)) return { kind: 'type', name };
    throw new InterpreterError(`Unknown field: ${className}.${name}`, line);
  }

  /** The value a chain evaluated to. A class, or a name that resolved to nothing, isn't a value. */
  private chainValue(current: ChainValue, line: number): JavaValue {
    if (current.kind === 'value') return current.value;
    throw this.undefinedName(current.kind === 'type' ? current.name : current.path[0], line);
  }

  private invokeOn(
    current: ChainValue,
    name: string,
    args: JavaValue[],
    receiverText: string,
    callSiteLine: number,
    line: number,
  ): JavaValue {
    if (current.kind === 'value') return this.invokeMethod(current.value, name, args, receiverText, callSiteLine, line);
    const className = current.kind === 'type' ? current.name : current.path[current.path.length - 1];
    return this.invokeStatic(className, name, args, receiverText, callSiteLine, line);
  }

  /** An instance method call on a value: String, StringBuilder, library objects, or a user class. */
  private invokeMethod(
    target: JavaValue,
    name: string,
    args: JavaValue[],
    receiverText: string,
    callSiteLine: number,
    line: number,
  ): JavaValue {
    if (target.kind === 'null') {
      throw nullPointer(`Cannot invoke "${name}()" because "${receiverText}" is null`, line);
    }
    if (target.kind === 'string') return this.evalStringMethod(target.value, name, args);
    if (target.kind === 'arrayRef' && name === 'toString') return javaString(javaValueToString(target, this.heap));
    if (target.kind === 'objectRef') {
      if (target.heapId === SYSTEM_OUT_ID || target.heapId === SYSTEM_ERR_ID) {
        return this.printStreamMethod(name, args, receiverText, line);
      }
      // A library object runs the library's methods; a user class's object, its own
      // (even for a user class named StringBuilder or Stack).
      if (isBuiltinObject(this.heap.get(target.heapId))) {
        if (target.className === 'StringBuilder' || target.className === 'StringBuffer') {
          return this.evalStringBuilderMethod(target, name, args);
        }
        const builtin = this.stdlib(line, () => callInstanceMethod(target, name, args, this.ctx));
        if (builtin !== undefined) return builtin;
      }
      const table = this.methodsByClass.get(target.className);
      const method = this.resolveMethod(table, name, args.length);
      if (method) return this.callMethod(method, args, callSiteLine, method.isStatic ? undefined : target);
      const excResult = this.exceptionFallback(target, name);
      if (excResult !== undefined) return excResult;
      if (table?.has(name)) throw wrongArgumentCount(`${receiverText}.${name}`, args.length, line);
    }
    throw new InterpreterError(`Unknown method: ${receiverText}.${name}()`, line);
  }

  /** `ClassName.name(args)` on a user class or a library class (Math, Arrays, Integer, …). */
  private invokeStatic(
    className: string,
    name: string,
    args: JavaValue[],
    receiverText: string,
    callSiteLine: number,
    line: number,
  ): JavaValue {
    // A user class takes precedence over a library class with the same name.
    if (this.classes.has(className)) {
      const table = this.methodsByClass.get(className);
      const method = this.resolveMethod(table, name, args.length);
      if (method?.isStatic) {
        this.initClass(className); // calling a static method initializes its class (JLS §12.4.1)
        return this.callMethod(method, args, callSiteLine);
      }
      if (method) throw new InterpreterError(`Cannot call instance method '${name}' without an object`, line);
      if (table?.has(name)) throw wrongArgumentCount(`${receiverText}.${name}`, args.length, line);
    }
    const result = this.stdlib(line, () => callStaticMethod(className, name, args, this.ctx));
    if (result !== undefined) return result;
    throw new InterpreterError(`Unknown method: ${receiverText}.${name}()`, line);
  }

  /**
   * An unqualified call `name(args)`: a method of the enclosing class, or of
   * a class it is nested in, then (leniently) of the entry class. A static
   * one is called directly; an instance one is called on `this`.
   */
  private invokeUnqualified(name: string, args: JavaValue[], scope: Scope, callSiteLine: number, line: number): JavaValue {
    const method = this.findUnqualifiedMethod(name, args.length);
    if (method?.isStatic) {
      this.initClass(method.className);
      return this.callMethod(method, args, callSiteLine);
    }

    // An instance method called unqualified from an instance context, e.g. one
    // instance method invoking a sibling. Dispatch on `this`.
    const self = this.getCurrentThis(scope);
    if (self?.kind === 'objectRef') {
      const instanceMethod = this.resolveMethod(this.methodsByClass.get(self.className), name, args.length);
      if (instanceMethod && !instanceMethod.isStatic) {
        return this.callMethod(instanceMethod, args, callSiteLine, self);
      }
    }
    throw this.unqualifiedCallError(name, args.length, method !== undefined, callSiteLine, line);
  }

  /** The method an unqualified call names: in the enclosing class or a class it is nested in, then (leniently) the entry class. */
  private findUnqualifiedMethod(name: string, argCount: number): MethodDef | undefined {
    for (let cls = this.currentClassName(); cls; cls = this.classes.get(cls)?.outer) {
      const method = this.resolveMethod(this.methodsByClass.get(cls), name, argCount);
      if (method) return method;
    }
    return this.resolveMethod(this.methods, name, argCount);
  }

  private unqualifiedCallError(name: string, argCount: number, foundInstanceMethod: boolean, callSiteLine: number, line: number): InterpreterError {
    if (this.enclosingInstanceMember(name, 'method')) {
      return new UnsupportedFeatureError(`Inner classes calling a method of the enclosing object ('${name}()')`, line);
    }
    // Found the method, but it's an instance method and there's no `this`
    // (a genuine static context): surface the classic Java error.
    if (foundInstanceMethod) return new InterpreterError(`Cannot call instance method '${name}' without an object`, callSiteLine);
    let known = this.methods.has(name);
    for (let cls = this.currentClassName(); cls && !known; cls = this.classes.get(cls)?.outer) {
      known = this.methodsByClass.get(cls)?.has(name) ?? false;
    }
    return known ? wrongArgumentCount(name, argCount, line) : new InterpreterError(`Unknown method: ${name}()`, line);
  }

  /** System.out and System.err. Both write to the one console for now (stderr is #22). */
  private printStreamMethod(name: string, args: JavaValue[], receiverText: string, line: number): JavaValue {
    switch (name) {
      case 'println':
        this.appendStdout((args.length > 0 ? this.stringify(args[0]) : '') + '\n');
        return javaNull();
      case 'print':
        this.appendStdout(args.length > 0 ? this.stringify(args[0]) : '');
        return javaNull();
      case 'printf':
      case 'format': {
        const fmt = args.length > 0 ? javaValueToString(args[0], this.heap) : '';
        this.appendStdout(this.stdlib(line, () => javaFormat(fmt, args.slice(1), this.heap)));
        return javaNull();
      }
      case 'flush':
        return javaNull();
    }
    throw new InterpreterError(`Unknown method: ${receiverText}.${name}()`, line);
  }

  /** Run a standard-library call, giving an error it raises the call's line (a StdlibError carries none). */
  private stdlib<T>(line: number, call: () => T): T {
    try {
      return call();
    } catch (e) {
      if (e instanceof StdlibError) throw new InterpreterError(e.message, line);
      throw e;
    }
  }

  private evalArguments(args: CstNode[], scope: Scope): JavaValue[] {
    return args.map(arg => this.evalExpression(arg, scope));
  }

  /**
   * Fallback for Throwable methods (getMessage/getLocalizedMessage/toString/
   * getCause/printStackTrace) on a user-defined exception object that doesn't
   * define them itself. Returns undefined for unrelated methods.
   */
  private exceptionFallback(target: JavaValue, methodName: string): JavaValue | undefined {
    if (!this.isThrowable(target)) return undefined;
    if (['getMessage', 'getLocalizedMessage', 'printStackTrace', 'toString', 'getCause'].includes(methodName)) {
      return exceptionMethod(target, methodName, this.ctx);
    }
    return undefined;
  }

  private callMethod(
    method: MethodDef,
    args: JavaValue[],
    callSiteLine?: number,
    thisValue?: JavaValue,
  ): JavaValue {
    if (!method.body) throw new InterpreterError(`${method.name}() is abstract, so it has no code to run`, callSiteLine ?? 0);
    const methodScope = createScope(null);
    if (thisValue) {
      setVariable(methodScope, 'this', thisValue, thisValue.kind === 'objectRef' ? thisValue.className : 'Object');
    }
    this.bindParameters(methodScope, method.params, method.varargs, args);

    // Pre-call snapshot: show the call site line before entering the method
    if (callSiteLine) {
      this.atLine(callSiteLine);
      this.emitSnapshot(callSiteLine);
    }

    this.callStack.push({ name: method.name, scope: methodScope, currentScope: methodScope, className: method.className, kind: 'method', line: 0 });
    try {
      this.executeBlock(method.body, methodScope);
      return javaNull();
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw this.atFailureSite(e); // record where it happened before this frame is popped
    } finally {
      this.callStack.pop();
    }
  }

  /**
   * Bind arguments to parameters. A varargs parameter receives the trailing
   * arguments as a new array, unless it was passed an array (or null) itself.
   */
  private bindParameters(scope: Scope, params: Param[], varargs: boolean, args: JavaValue[]): void {
    params.forEach((param, i) => {
      let arg = args[i] ?? defaultValue(param.type);
      if (varargs && i === params.length - 1) {
        const passedArray = args.length === params.length && (arg.kind === 'arrayRef' || arg.kind === 'null');
        if (!passedArray) {
          const elementType = param.type.slice(0, -2);
          const elements = args.slice(i).map(a => assignmentConversion(a, elementType));
          arg = { kind: 'arrayRef', heapId: this.allocArray(elementType, elements) };
        }
      }
      setVariable(scope, param.name, arg, param.type);
    });
  }

  // ── Objects and constructors ──

  /** The constructor of `className` for `argCount` arguments (chosen by count; choosing by type is #13). */
  private findConstructor(className: string, argCount: number): ConstructorDef | undefined {
    const ctors = this.constructors.get(className) ?? [];
    return ctors.find(c => !c.varargs && c.params.length === argCount)
      ?? ctors.find(c => c.varargs && argCount >= c.params.length - 1);
  }

  /**
   * Run a new object's constructor. The object already exists with its fields
   * at their default values. A class that declares no constructor has the
   * default one, which only runs the instance initializers.
   */
  private construct(className: string, self: JavaObjectRef, args: JavaValue[], callSiteLine: number): void {
    const info = this.classes.get(className)!;
    if (!this.constructors.has(className)) {
      if (args.length > 0) throw noConstructor(className, args.length, callSiteLine);
      if (info.instanceInit.length > 0) {
        const scope = createScope(null);
        setVariable(scope, 'this', self, className);
        this.atLine(callSiteLine);
        const frame: Frame = { name: className, scope, currentScope: scope, className, kind: 'constructor', line: 0 };
        this.callStack.push(frame);
        try {
          this.runInstanceInitializers(info, self, frame);
        } catch (e) {
          throw this.atFailureSite(e);
        } finally {
          this.callStack.pop();
        }
      }
      return;
    }
    const ctor = this.findConstructor(className, args.length);
    if (!ctor) throw noConstructor(className, args.length, callSiteLine);
    this.callConstructor(ctor, self, args, callSiteLine);
  }

  /**
   * One constructor call (JLS §12.5): bind the parameters; then either
   * delegate to another constructor with `this(…)`, or run the superclass
   * constructor (`super(…)`, or implicitly) followed by the instance
   * initializers; then the rest of the body.
   */
  private callConstructor(ctor: ConstructorDef, self: JavaObjectRef, args: JavaValue[], callSiteLine: number): void {
    const info = this.classes.get(ctor.className)!;
    const ctorScope = createScope(null);
    setVariable(ctorScope, 'this', self, ctor.className);
    this.bindParameters(ctorScope, ctor.params, ctor.varargs, args);

    this.atLine(callSiteLine);
    this.emitSnapshot(callSiteLine);
    const frame: Frame = { name: ctor.className, scope: ctorScope, currentScope: ctorScope, className: ctor.className, kind: 'constructor', line: 0 };
    this.callStack.push(frame);
    try {
      const eci = child(ctor.body, 'explicitConstructorInvocation');
      const invocation = eci ? child(eci, 'unqualifiedExplicitConstructorInvocation') : undefined;
      if (eci && !invocation) throw new UnsupportedFeatureError('Qualified superclass constructor calls (outer.super(…))', getLine(eci));
      const argList = invocation ? child(invocation, 'argumentList') : undefined;
      const invocationArgs = invocation ? this.evalArguments(argList ? children(argList, 'expression') : [], ctorScope) : [];
      if (invocation && has(invocation, 'This')) {
        // this(…) runs another constructor of the class on the same object; that one runs the initializers.
        const line = getLine(invocation);
        const target = this.findConstructor(ctor.className, invocationArgs.length);
        if (!target) throw noConstructor(ctor.className, invocationArgs.length, line);
        this.callConstructor(target, self, invocationArgs, line);
        this.emitSnapshot(line);
      } else {
        this.superConstructor(info, self, invocationArgs, invocation ? getLine(invocation) : callSiteLine);
        this.runInstanceInitializers(info, self, frame);
      }
      this.executeBlock(ctor.body, ctorScope);
    } catch (e) {
      if (!(e instanceof ReturnSignal)) {
        throw this.atFailureSite(e);
      }
    } finally {
      this.callStack.pop();
    }
  }

  /**
   * The superclass constructor. Object's does nothing. A library exception
   * class's records the message and cause: Throwable(String),
   * Throwable(String, Throwable) or Throwable(Throwable), which takes the
   * cause's toString() as its message.
   */
  private superConstructor(info: ClassInfo, self: JavaObjectRef, args: JavaValue[], line: number): void {
    if (!info.superclass) {
      if (args.length > 0) throw new InterpreterError(`${info.name} has no superclass constructor that takes arguments`, line);
      return;
    }
    const obj = this.heap.get(self.heapId) as JavaObject;
    const [first, second] = args;
    if (first) {
      // A user class's own `message` field keeps its value.
      if (!obj.fields.has('message')) obj.fields.set('message', first.kind === 'null' ? javaNull() : javaString(this.stringify(first)));
      if (this.isThrowable(first)) obj.fields.set('cause', first);
    }
    if (second) obj.fields.set('cause', second);
  }

  /**
   * A class's instance field initializers and initializer blocks, in textual
   * order, with `this` bound to the new object (JLS §12.5 step 4). They run in
   * the constructor's frame but can't see its parameters, so the frame shows
   * a scope of their own while they run.
   */
  private runInstanceInitializers(info: ClassInfo, self: JavaObjectRef, frame: Frame): void {
    if (info.instanceInit.length === 0) return;
    const saved = { scope: frame.scope, currentScope: frame.currentScope };
    const initScope = createScope(null);
    setVariable(initScope, 'this', self, info.name);
    frame.scope = initScope;
    frame.currentScope = initScope;
    try {
      for (const item of info.instanceInit) {
        if (item.kind === 'field') {
          this.atLine(getLine(item.init));
          const value = this.evalVariableInitializer(item.init, item.type, initScope);
          fieldReference(this.heap, self, item.name, item.type, 'this', getLine(item.init)).set(value);
        } else {
          this.runBlockIn(item.block, initScope);
        }
      }
    } catch (e) {
      throw this.atFailureSite(e); // while the initializers' scope is still shown
    } finally {
      frame.scope = saved.scope;
      frame.currentScope = saved.currentScope;
    }
  }

  private evalNewExpression(newExpr: CstNode, scope: Scope): JavaValue {
    // Array creation: new int[5], new int[]{1, 2, 3}
    const arrayCreation = child(newExpr, 'arrayCreationExpression');
    if (arrayCreation) return this.evalArrayCreation(arrayCreation, scope);
    // Object creation: new ClassName(args)
    return this.evalObjectCreation(child(newExpr, 'unqualifiedClassInstanceCreationExpression')!, scope);
  }

  private evalArrayCreation(arrayCreation: CstNode, scope: Scope): JavaValue {
    const line = getLine(arrayCreation);
    const primType = child(arrayCreation, 'primitiveType');
    const classType = child(arrayCreation, 'classOrInterfaceType');
    const baseType = primType ? this.extractPrimitiveType(primType) : lastIdentifier(child(classType!, 'classType'));

    // With an initializer: new int[]{1, 2, 3}, new int[][]{{1}, {2, 3}}
    const withInit = child(arrayCreation, 'arrayCreationWithInitializerSuffix');
    if (withInit) {
      return this.evalArrayInitializer(child(withInit, 'arrayInitializer')!, baseType + dimsSuffix(child(withInit, 'dims')), scope);
    }

    // With lengths: new int[2][3][4], or new int[3][] for rows made later.
    // Each length is evaluated once, left to right, before anything is allocated.
    const suffix = child(arrayCreation, 'arrayCreationExpressionWithoutInitializerSuffix')!;
    const lengths = children(child(suffix, 'dimExprs')!, 'dimExpr')
      .map(dim => Math.trunc(javaValueToNumber(this.evalExpression(child(dim, 'expression')!, scope))));
    const negative = lengths.find(n => n < 0);
    if (negative !== undefined) throw new JavaRuntimeError('NegativeArraySizeException', String(negative), line);
    return this.allocArrayOfLengths(baseType, lengths, dimsSuffix(child(suffix, 'dims')));
  }

  /**
   * An array with one length per dimension. The innermost elements get the
   * default value of their type, which is null when unsized dimensions
   * (`extraDims`) remain, as for `new int[3][]`.
   */
  private allocArrayOfLengths(baseType: string, lengths: number[], extraDims: string): JavaValue {
    const [length, ...inner] = lengths;
    const elementType = baseType + '[]'.repeat(inner.length) + extraDims;
    const elements: JavaValue[] = [];
    for (let i = 0; i < length; i++) {
      elements.push(inner.length > 0 ? this.allocArrayOfLengths(baseType, inner, extraDims) : defaultValue(elementType));
    }
    return { kind: 'arrayRef', heapId: this.allocArray(elementType, elements) };
  }

  private evalObjectCreation(creation: CstNode, scope: Scope): JavaValue {
    const line = getLine(creation);
    // new java.util.Scanner(…) and new Outer.Inner(…) name the class by the last part.
    const className = lastIdentifier(child(creation, 'classOrInterfaceTypeToInstantiate')!);
    if (has(creation, 'classBody')) throw new UnsupportedFeatureError('Anonymous classes', line);
    const info = this.classes.get(className);
    // `new` initializes the class before evaluating the arguments (JLS §12.4.1).
    if (info) this.initClass(className);
    const argList = child(creation, 'argumentList');
    const args = this.evalArguments(argList ? children(argList, 'expression') : [], scope);

    if (!info) {
      // A plain Object, e.g. one used only as a lock.
      if (className === 'Object') return { kind: 'objectRef', heapId: this.allocObject('Object', new Map(), true), className };
      if (className === 'StringBuilder' || className === 'StringBuffer') {
        const initial = args.length > 0 && args[0].kind !== 'primitive' ? javaValueToString(args[0], this.heap) : '';
        const heapId = this.allocObject(className, new Map([
          ['value', javaString(initial)],
        ]), true);
        return { kind: 'objectRef', heapId, className };
      }
      // Collections, Scanner, Random and exceptions come from the stdlib.
      const builtin = this.stdlib(line, () => newBuiltin(className, args, this.ctx));
      if (builtin) return builtin;
      throw new UnsupportedFeatureError(`The ${className} class`, line, true);
    }
    if (info.kind === 'interface' || info.isAbstract) {
      throw new InterpreterError(`${className} is ${info.kind === 'interface' ? 'an interface' : 'abstract'}, so it can't be instantiated`, line);
    }

    const heapId = this.allocObject(className, this.defaultInstanceFields(className));
    const self: JavaObjectRef = { kind: 'objectRef', heapId, className };
    this.construct(className, self, args, line);
    return self;
  }

  // ── Built-in methods ──

  private evalStringMethod(str: string, method: string, args: JavaValue[]): JavaValue {
    switch (method) {
      case 'length': return javaInt(str.length);
      case 'charAt': return javaChar(str.charCodeAt(javaValueToNumber(args[0]) | 0));
      case 'substring': {
        const start = javaValueToNumber(args[0]) | 0;
        const end = args.length > 1 ? javaValueToNumber(args[1]) | 0 : str.length;
        return javaString(str.substring(start, end));
      }
      case 'indexOf': {
        const search = javaValueToString(args[0], this.heap);
        const from = args.length > 1 ? javaValueToNumber(args[1]) | 0 : 0;
        return javaInt(str.indexOf(search, from));
      }
      case 'lastIndexOf': {
        const search = javaValueToString(args[0], this.heap);
        return javaInt(str.lastIndexOf(search));
      }
      case 'toUpperCase': return javaString(str.toUpperCase());
      case 'toLowerCase': return javaString(str.toLowerCase());
      case 'trim': return javaString(str.trim());
      case 'contains': return javaBool(str.includes(javaValueToString(args[0], this.heap)));
      case 'startsWith': return javaBool(str.startsWith(javaValueToString(args[0], this.heap)));
      case 'endsWith': return javaBool(str.endsWith(javaValueToString(args[0], this.heap)));
      case 'equals': return javaBool(str === javaValueToString(args[0], this.heap));
      case 'equalsIgnoreCase': return javaBool(str.toLowerCase() === javaValueToString(args[0], this.heap).toLowerCase());
      case 'isEmpty': return javaBool(str.length === 0);
      case 'replace': {
        const target = javaValueToString(args[0], this.heap);
        const replacement = javaValueToString(args[1], this.heap);
        return javaString(str.split(target).join(replacement));
      }
      case 'split': {
        const delimiter = javaValueToString(args[0], this.heap);
        const parts = str.split(delimiter);
        const elements = parts.map(p => javaString(p));
        const heapId = this.allocArray('String', elements);
        return { kind: 'arrayRef', heapId };
      }
      case 'toCharArray': {
        const chars = Array.from(str).map(c => javaChar(c.charCodeAt(0)));
        const heapId = this.allocArray('char', chars);
        return { kind: 'arrayRef', heapId };
      }
      case 'compareTo': return javaInt(str < javaValueToString(args[0], this.heap) ? -1 : str > javaValueToString(args[0], this.heap) ? 1 : 0);
      case 'compareToIgnoreCase': {
        const o = javaValueToString(args[0], this.heap).toLowerCase();
        const s = str.toLowerCase();
        return javaInt(s < o ? -1 : s > o ? 1 : 0);
      }
      case 'concat': return javaString(str + javaValueToString(args[0], this.heap));
      case 'repeat': return javaString(str.repeat(Math.max(0, javaValueToNumber(args[0]) | 0)));
      case 'isBlank': return javaBool(str.trim().length === 0);
      case 'strip': return javaString(str.replace(/^\s+|\s+$/g, ''));
      case 'stripLeading': return javaString(str.replace(/^\s+/, ''));
      case 'stripTrailing': return javaString(str.replace(/\s+$/, ''));
      case 'matches': return javaBool(new RegExp('^(?:' + javaValueToString(args[0], this.heap) + ')$').test(str));
      case 'replaceAll':
        return javaString(str.replace(new RegExp(javaValueToString(args[0], this.heap), 'g'), javaValueToString(args[1], this.heap)));
      case 'replaceFirst':
        return javaString(str.replace(new RegExp(javaValueToString(args[0], this.heap)), javaValueToString(args[1], this.heap)));
      default:
        throw new InterpreterError(`Unknown String method: ${method}()`, 0);
    }
  }

  private evalStringBuilderMethod(ref: JavaValue, method: string, args: JavaValue[]): JavaValue {
    if (ref.kind !== 'objectRef') return javaNull();
    const obj = this.heap.get(ref.heapId);
    if (!obj || !isJavaObject(obj)) return javaNull();
    const cur = obj.fields.get('value');
    const curStr = cur && cur.kind === 'string' ? cur.value : '';
    switch (method) {
      case 'append': {
        // String.valueOf(arg): an object's own toString() is used.
        const next = curStr + (args.length > 0 ? this.stringify(args[0]) : '');
        obj.fields.set('value', javaString(next));
        return ref; // append returns the builder for chaining
      }
      case 'toString': return javaString(curStr);
      case 'length': return javaInt(curStr.length);
      case 'charAt': return javaChar(curStr.charCodeAt(javaValueToNumber(args[0]) | 0));
      case 'reverse': {
        obj.fields.set('value', javaString([...curStr].reverse().join('')));
        return ref;
      }
      case 'setLength': {
        const n = javaValueToNumber(args[0]) | 0;
        const next = n <= curStr.length ? curStr.slice(0, n) : curStr + '\0'.repeat(n - curStr.length);
        obj.fields.set('value', javaString(next));
        return javaNull();
      }
      case 'deleteCharAt': {
        const idx = javaValueToNumber(args[0]) | 0;
        obj.fields.set('value', javaString(curStr.slice(0, idx) + curStr.slice(idx + 1)));
        return ref;
      }
      case 'insert': {
        const idx = javaValueToNumber(args[0]) | 0;
        const ins = this.stringify(args[1]);
        obj.fields.set('value', javaString(curStr.slice(0, idx) + ins + curStr.slice(idx)));
        return ref;
      }
    }
    throw new InterpreterError(`Unknown StringBuilder method: ${method}()`, 0);
  }
}

// ── Helpers ──

function isAssignmentOp(op: string): boolean {
  return ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>='].includes(op);
}

const PRIMITIVE_TYPES = new Set<string>(['int', 'long', 'short', 'byte', 'char', 'float', 'double', 'boolean']);

/** Each primitive type's box class, and the reverse. */
const BOXES: Record<JavaPrimitiveType, string> = {
  int: 'Integer', long: 'Long', short: 'Short', byte: 'Byte', char: 'Character', float: 'Float', double: 'Double', boolean: 'Boolean',
};
const UNBOXED: Record<string, JavaPrimitiveType> = Object.fromEntries(
  Object.entries(BOXES).map(([primitive, box]) => [box, primitive as JavaPrimitiveType]),
);

/** What every array is, besides an array of its element type. */
const ARRAY_SUPERTYPES = new Set(['Object', 'Cloneable', 'Serializable']);

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A call to a method that exists, but not with this many arguments. */
function wrongArgumentCount(text: string, argCount: number, line: number): InterpreterError {
  return new InterpreterError(`${text}() can't be called with ${plural(argCount, 'argument')}`, line);
}

function noConstructor(className: string, argCount: number, line: number): InterpreterError {
  return new InterpreterError(`${className} has no constructor that takes ${plural(argCount, 'argument')}`, line);
}

/** `ClassName: detail` at the start of an error message, when ClassName is a known exception class. */
function parseRuntimeException(message: string): { className: string; detail: string } | undefined {
  // InterpreterError prefixes "Line N: "; strip it before matching the type.
  const m = message.replace(/^Line \d+:\s*/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)(?::\s*(.*))?$/s);
  return m && isExceptionClass(m[1]) ? { className: m[1], detail: m[2] ?? '' } : undefined;
}

/** The last name of a possibly qualified type: `java.util.Scanner` is `Scanner`, `Map.Entry` is `Entry`. */
function lastIdentifier(node: CstNode | undefined): string {
  const ids = node ? tokens(node, 'Identifier') : [];
  return ids.length > 0 ? ids[ids.length - 1].image : 'Object';
}

/** `[]` for each pair of brackets in a `dims` node. */
function dimsSuffix(dims: CstNode | undefined): string {
  return dims ? '[]'.repeat(tokens(dims, 'LSquare').length) : '';
}

/** The type names in an `implements` clause or an interface's `extends` clause. */
function interfaceNames(clause: CstNode | undefined): string[] {
  const list = clause ? child(clause, 'interfaceTypeList') : undefined;
  return (list ? children(list, 'interfaceType') : []).map(type => lastIdentifier(child(type, 'classType')));
}

/** The error for a block statement that isn't a statement or a local variable: a class, interface, enum or record declared in a method. */
function localDeclarationError(blockStmt: CstNode): InterpreterError {
  const decl = child(blockStmt, 'classDeclaration') ?? child(blockStmt, 'interfaceDeclaration');
  if (!decl) return new InterpreterError('Unrecognized statement', getLine(blockStmt));
  const kind = decl.name === 'interfaceDeclaration' ? 'Interfaces'
    : has(decl, 'enumDeclaration') ? 'Enums'
    : has(decl, 'recordDeclaration') ? 'Records'
    : 'Classes';
  return new UnsupportedFeatureError(`${kind} declared inside a method`, getLine(decl));
}

/** Does a subtree contain a token with this text (e.g. a use of a variable)? */
function mentionsName(node: CstNode, name: string): boolean {
  return Object.values(node.children).some(items =>
    items.some(item => (isCstNode(item) ? mentionsName(item, name) : item.image === name)));
}

/** The first node of this kind in a subtree. */
function findNode(node: CstNode, name: string): CstNode | undefined {
  if (node.name === name) return node;
  for (const items of Object.values(node.children)) {
    for (const item of items) {
      const found = isCstNode(item) ? findNode(item, name) : undefined;
      if (found) return found;
    }
  }
  return undefined;
}

/** The nodes a constant expression built from literals and operators alone contains (JLS §15.29 without names). */
const LITERAL_CONSTANT_NODES = new Set([
  'variableInitializer', 'expression', 'conditionalExpression', 'binaryExpression', 'unaryExpression', 'primary',
  'primaryPrefix', 'literal', 'integerLiteral', 'floatingPointLiteral', 'booleanLiteral', 'parenthesisExpression',
  'castExpression', 'primitiveCastExpression', 'primitiveType', 'numericType', 'integralType', 'floatingPointType',
]);

/** Is a field initializer a constant made of literals and operators, like `10`, `-1`, `"a" + "b"` or `(int) 2.5`? */
function isLiteralConstant(node: CstNode): boolean {
  if (!LITERAL_CONSTANT_NODES.has(node.name) || has(node, 'Null')) return false;
  return Object.values(node.children).every(items => items.every(item => !isCstNode(item) || isLiteralConstant(item)));
}

/**
 * Can a statement finish without jumping away? Not return, throw, break,
 * continue or yield, nor a block that ends with one (JLS §14.22, simplified).
 */
function canCompleteNormally(stmt: CstNode): boolean {
  const swts = child(stmt, 'statementWithoutTrailingSubstatement');
  if (!swts) return true;
  const jumps = ['returnStatement', 'throwStatement', 'breakStatement', 'continueStatement', 'yieldStatement'];
  if (jumps.some(kind => has(swts, kind))) return false;
  const block = child(swts, 'block');
  const stmts = block ? children(child(block, 'blockStatements') ?? block, 'blockStatement') : [];
  const last = stmts.length > 0 ? child(stmts[stmts.length - 1], 'statement') : undefined;
  return last ? canCompleteNormally(last) : true;
}

// ── Primary chains ──
//
// A primary expression such as `people[1].age`, `head.next.getVal()` or
// `Main.total` is a base followed by selectors. buildPrimaryChain derives that
// structure from the parser's tree once per node, and the interpreter walks it
// for reads, method calls and writes alike.

/** A construct JavaTutor can't run yet, as UnsupportedFeatureError names it. */
interface UnsupportedConstruct {
  construct: string;
  singular?: boolean;
}

/** The start of a primary expression. */
type ChainBase =
  | { kind: 'name'; name: string }                  // a simple name: variable, field, class or package
  | { kind: 'this' }
  | { kind: 'super' }
  | { kind: 'call'; name: string; args: CstNode[] }  // an unqualified method call: foo(1)
  | { kind: 'expression'; prefix: CstNode }          // a literal, (parenthesized), cast, new or switch
  | ({ kind: 'unsupported' } & UnsupportedConstruct); // int.class, void.class, int[]::new

/** One step after the base. */
type Selector =
  | { kind: 'field'; name: string }                  // .name
  | { kind: 'call'; name: string; args: CstNode[] }  // .name(args)
  | { kind: 'index'; index: CstNode }                // [index]
  | ({ kind: 'unsupported' } & UnsupportedConstruct); // .this, .class, ::, outer.new Inner()

interface ChainStep<T> {
  step: T;
  /** Source text of the chain through this step: names the null value in NullPointerExceptions. */
  text: string;
  line: number;
}

interface PrimaryChain {
  base: ChainStep<ChainBase>;
  selectors: ChainStep<Selector>[];
}

/** Where a chain stands while it is evaluated. */
type ChainValue =
  | { kind: 'value'; value: JavaValue }
  | { kind: 'type'; name: string }          // a user or library class: Main, Math, System
  | { kind: 'unresolved'; path: string[] }; // no variable, field or class: a package prefix, or undefined

/** Library classes that can start a qualified name (for their static members), besides user classes. */
const LIBRARY_CLASSES = new Set([
  'Math', 'System', 'String', 'Objects', 'Arrays', 'Collections', 'Comparator', 'List', 'Set', 'Map',
  'Integer', 'Long', 'Short', 'Byte', 'Double', 'Float', 'Boolean', 'Character',
]);

/** System.out, System.err and System.in, which aren't heap objects. */
const SYSTEM_OUT_ID = '__system_out__';
const SYSTEM_ERR_ID = '__system_err__';
const SYSTEM_IN_ID = '__system_in__';
const SYSTEM_OUT: JavaValue = { kind: 'objectRef', heapId: SYSTEM_OUT_ID, className: 'PrintStream' };
const SYSTEM_ERR: JavaValue = { kind: 'objectRef', heapId: SYSTEM_ERR_ID, className: 'PrintStream' };
const SYSTEM_IN: JavaValue = { kind: 'objectRef', heapId: SYSTEM_IN_ID, className: 'InputStream' };

function buildPrimaryChain(primary: CstNode): PrimaryChain {
  const prefix = child(primary, 'primaryPrefix')!;
  const suffixes = children(primary, 'primarySuffix');
  const selectors: ChainStep<Selector>[] = [];
  let base: ChainStep<ChainBase>;
  let nextSuffix = 0;

  const fqn = child(prefix, 'fqnOrRefType');
  if (fqn) {
    // `a.b.c(x)` arrives as the dotted name a.b.c followed by a call suffix, so
    // the name's last part is the method name.
    const parts = fqnParts(fqn);
    const callArgs = suffixes.length > 0 ? callArguments(suffixes[0]) : undefined;
    const methodPart = callArgs ? parts.length - 1 : -1;
    if (callArgs) nextSuffix = 1;
    const first = parts[0];
    base = methodPart === 0
      ? { step: { kind: 'call', name: first.name, args: callArgs! }, text: `${first.name}(${argumentsText(callArgs!)})`, line: first.line }
      : { step: first.isSuper ? { kind: 'super' } : { kind: 'name', name: first.name }, text: first.name, line: first.line };
    let text = base.text;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (i === methodPart) {
        text = `${text}.${part.name}(${argumentsText(callArgs!)})`;
        selectors.push({ step: { kind: 'call', name: part.name, args: callArgs! }, text, line: part.line });
      } else {
        text = `${text}.${part.name}`;
        selectors.push({ step: { kind: 'field', name: part.name }, text, line: part.line });
      }
    }
  } else if (has(prefix, 'This')) {
    base = { step: { kind: 'this' }, text: 'this', line: getLine(prefix) };
  } else if (has(prefix, 'Super')) {
    base = { step: { kind: 'super' }, text: 'super', line: getLine(prefix) };
  } else if (has(prefix, 'Void') || has(prefix, 'unannPrimitiveTypeWithOptionalDimsSuffix')) {
    // A type as an expression: `int.class`, `void.class` or `int[]::new`.
    const construct = suffixes.length > 0 ? describeSuffix(suffixes[0]) : { construct: 'Class literals (.class)' };
    base = { step: { kind: 'unsupported', ...construct }, text: sourceText(prefix), line: getLine(prefix) };
    nextSuffix = suffixes.length;
  } else {
    base = { step: { kind: 'expression', prefix }, text: sourceText(prefix), line: getLine(prefix) };
  }

  let text = selectors.length > 0 ? selectors[selectors.length - 1].text : base.text;
  for (let i = nextSuffix; i < suffixes.length; i++) {
    const suffix = suffixes[i];
    const line = getLine(suffix);
    const arrayAccess = child(suffix, 'arrayAccessSuffix');
    if (arrayAccess) {
      const index = child(arrayAccess, 'expression')!;
      text = `${text}[${sourceText(index)}]`;
      selectors.push({ step: { kind: 'index', index }, text, line });
      continue;
    }
    const name = memberName(suffix);
    if (name) {
      const callArgs = i + 1 < suffixes.length ? callArguments(suffixes[i + 1]) : undefined;
      if (callArgs) {
        text = `${text}.${name}(${argumentsText(callArgs)})`;
        selectors.push({ step: { kind: 'call', name, args: callArgs }, text, line });
        i++;
      } else {
        text = `${text}.${name}`;
        selectors.push({ step: { kind: 'field', name }, text, line });
      }
      continue;
    }
    selectors.push({ step: { kind: 'unsupported', ...describeSuffix(suffix) }, text, line });
  }
  return { base, selectors };
}

/** The parts of a dotted name. Type arguments (`Collections.<T>emptyList`) are erased. */
function fqnParts(fqn: CstNode): { name: string; isSuper: boolean; line: number }[] {
  const nodes = [child(fqn, 'fqnOrRefTypePartFirst'), ...children(fqn, 'fqnOrRefTypePartRest')];
  const parts: { name: string; isSuper: boolean; line: number }[] = [];
  for (const node of nodes) {
    if (!node) continue;
    const common = child(node, 'fqnOrRefTypePartCommon');
    const id = common ? token(common, 'Identifier') : undefined;
    const sup = common ? token(common, 'Super') : undefined;
    const tok = id ?? sup;
    parts.push({ name: tok?.image ?? '', isSuper: !id && !!sup, line: tok?.startLine ?? getLine(node) });
  }
  return parts;
}

/** The argument expressions of a call suffix, or undefined if the suffix isn't a call. */
function callArguments(suffix: CstNode): CstNode[] | undefined {
  const call = child(suffix, 'methodInvocationSuffix');
  if (!call) return undefined;
  const list = child(call, 'argumentList');
  return list ? children(list, 'expression') : [];
}

/** The member name of a `.name` (or `.<T>name`) suffix. */
function memberName(suffix: CstNode): string | undefined {
  const id = token(suffix, 'Identifier');
  if (!id) return undefined;
  const plain = Object.keys(suffix.children).every(k => k === 'Dot' || k === 'Identifier' || k === 'typeArguments');
  return plain ? id.image : undefined;
}

/** The construct a selector the chain can't evaluate stands for. */
function describeSuffix(suffix: CstNode): UnsupportedConstruct {
  if (has(suffix, 'This')) return { construct: 'Qualified this (Outer.this)', singular: true };
  if (child(suffix, 'classLiteralSuffix')) return { construct: 'Class literals (.class)' };
  if (child(suffix, 'methodReferenceSuffix')) return { construct: 'Method references (::)' };
  if (child(suffix, 'unqualifiedClassInstanceCreationExpression')) {
    return { construct: 'Creating an inner class through an object (outer.new Inner())', singular: true };
  }
  if (child(suffix, 'templateArgument')) return { construct: 'String templates' };
  return { construct: 'This kind of expression', singular: true };
}

function argumentsText(args: CstNode[]): string {
  return args.map(sourceText).join(', ');
}

/** The source text of a node, rebuilt from its tokens (spacing approximated from columns). */
function sourceText(node: CstNode): string {
  const toks: CstToken[] = [];
  const collect = (n: CstNode) => {
    for (const items of Object.values(n.children)) {
      for (const item of items) {
        if (isCstToken(item)) toks.push(item);
        else collect(item);
      }
    }
  };
  collect(node);
  toks.sort((a, b) => a.startLine - b.startLine || a.startColumn - b.startColumn);
  let text = '';
  toks.forEach((t, i) => {
    const prev = toks[i - 1];
    if (prev && (t.startLine !== prev.endLine || t.startColumn > prev.endColumn + 1)) text += ' ';
    text += t.image;
  });
  return text;
}

/** The primary of a unary expression with no operators, e.g. the left side of an assignment. */
function bareOperand(unary: CstNode): CstNode | undefined {
  if (has(unary, 'UnaryPrefixOperator') || has(unary, 'UnarySuffixOperator')) return undefined;
  return child(unary, 'primary');
}

/** For a parenthesized variable like `(x)`, the primary inside it; undefined for anything else. */
function parenthesizedOperand(prefix: CstNode): CstNode | undefined {
  const paren = child(prefix, 'parenthesisExpression');
  const expr = paren ? child(paren, 'expression') : undefined;
  const cond = expr ? child(expr, 'conditionalExpression') : undefined;
  if (!cond || has(cond, 'QuestionMark')) return undefined;
  const bin = child(cond, 'binaryExpression');
  const operands = bin ? children(bin, 'unaryExpression') : [];
  if (!bin || operands.length !== 1 || Object.keys(bin.children).length !== 1) return undefined;
  return bareOperand(operands[0]);
}

function applyBinaryOp(
  op: string,
  left: JavaValue,
  right: JavaValue,
  heap: Map<string, JavaHeapEntry>,
  stringify?: (v: JavaValue) => string,
): JavaValue {
  // String concatenation: if either side is a string, Java converts the other
  // to its string form (honoring a user toString() via the stringify callback).
  if (op === '+' && (left.kind === 'string' || right.kind === 'string')) {
    const str = stringify ?? ((v: JavaValue) => javaValueToString(v, heap));
    return javaString(str(left) + str(right));
  }

  const l = javaValueToNumber(left);
  const r = javaValueToNumber(right);

  // Determine if result should be double
  const isDouble = (left.kind === 'primitive' && (left.javaType === 'double' || left.javaType === 'float'))
    || (right.kind === 'primitive' && (right.javaType === 'double' || right.javaType === 'float'));

  switch (op) {
    case '+': return isDouble ? javaDouble(l + r) : javaInt((l + r) | 0);
    case '-': return isDouble ? javaDouble(l - r) : javaInt((l - r) | 0);
    case '*': return isDouble ? javaDouble(l * r) : javaInt(Math.imul(l | 0, r | 0));
    case '/':
      if (r === 0) throw new InterpreterError('ArithmeticException: / by zero', 0);
      return isDouble ? javaDouble(l / r) : javaInt((l / r) | 0);
    case '%':
      if (r === 0) throw new InterpreterError('ArithmeticException: / by zero', 0);
      return isDouble ? javaDouble(l % r) : javaInt((l % r) | 0);
    case '<': return javaBool(l < r);
    case '>': return javaBool(l > r);
    case '<=': return javaBool(l <= r);
    case '>=': return javaBool(l >= r);
    case '==': return javaBool(javaValuesEqual(left, right));
    case '!=': return javaBool(!javaValuesEqual(left, right));
    case '&': return javaInt((l | 0) & (r | 0));
    case '|': return javaInt((l | 0) | (r | 0));
    case '^': return javaInt((l | 0) ^ (r | 0));
    case '<<': return javaInt((l | 0) << (r | 0));
    case '>>': return javaInt((l | 0) >> (r | 0));
    case '>>>': return javaInt((l | 0) >>> (r | 0));
    case '&&': return javaBool(javaValueToBoolean(left) && javaValueToBoolean(right));
    case '||': return javaBool(javaValueToBoolean(left) || javaValueToBoolean(right));
    default: return javaNull();
  }
}

function getFirstToken(node: CstNode | CstToken): CstToken | null {
  if (isCstToken(node)) return node;
  for (const items of Object.values(node.children)) {
    for (const item of items) {
      const t = getFirstToken(item);
      if (t) return t;
    }
  }
  return null;
}
