/**
 * JDK differential harness: runs a corpus case through JavaInterpreter, compares
 * the result with the case's golden (what real `java` did), and checks
 * snapshot invariants. Shared by jdk-differential.test.ts and scripts/java-diff.ts.
 */
import { readFileSync } from 'node:fs';
import { parseJava, child, children, token, isCstNode, type CstNode, type CstToken } from '../../parser';
import { JavaInterpreter, STATIC_FIELDS_FRAME } from '../../interpreter';
import type { ExecutionSnapshot, RuntimeValue } from '../../../../types/snapshot';
import { KNOWN_FAILURES_PATH, type JdkCase, type JdkGolden } from './corpus';

// ── Running the interpreter ──

export interface InterpreterRun {
  snapshots: ExecutionSnapshot[];
  /** The error the worker would report, or null for a clean run. */
  error: string | null;
  /** 'parse' when java-parser rejected the source, so nothing ran. */
  phase: 'parse' | 'run';
}

/** Run a program the way the Java worker does (src/engines/java/worker.ts). */
export function runInterpreter(source: string, stdin: string): InterpreterRun {
  let cst: CstNode;
  try {
    cst = parseJava(source);
  } catch (e) {
    return { snapshots: [], error: `Parse error: ${errorText(e)}`, phase: 'parse' };
  }
  try {
    const result = new JavaInterpreter(stdin).execute(cst);
    return { snapshots: result.snapshots, error: result.error ?? null, phase: 'run' };
  } catch (e) {
    // execute() catches its own errors; this guards the harness against a crash escaping it.
    return { snapshots: [], error: errorText(e), phase: 'run' };
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── Comparing with real Java ──

/**
 * The stdout a student would see: the last snapshot's console. The interpreter
 * drops one trailing newline from its buffer (see snapshotStdout), so the
 * golden side is normalized the same way in goldenStdout.
 */
export function interpreterStdout(run: InterpreterRun): string {
  return run.snapshots[run.snapshots.length - 1]?.stdout.join('\n') ?? '';
}

export function goldenStdout(golden: JdkGolden): string {
  return golden.stdout.endsWith('\n') ? golden.stdout.slice(0, -1) : golden.stdout;
}

/** `java.lang.ArithmeticException` → `ArithmeticException`; `Main$MyError` → `MyError`. */
export function simpleClassName(name: string): string {
  const last = name.slice(name.lastIndexOf('.') + 1);
  return last.slice(last.lastIndexOf('$') + 1);
}

/**
 * The Java exception class named by an interpreter error, or null when the
 * error is an engine failure (unsupported feature, step limit, crash). Forms:
 *   Exception in thread "main" IllegalStateException: Stack full   (a `throw`)
 *   Line 5: ArrayIndexOutOfBoundsException: Index 3 out of bounds   (built-in)
 *   ArithmeticException: / by zero
 */
export function interpreterExceptionClass(error: string): string | null {
  const thrown = /^Exception in thread "main" ([\w$.]+)/.exec(error);
  if (thrown) return simpleClassName(thrown[1]);
  const builtin = /^(?:Line \d+: )?([\w$.]+)(?::|$)/.exec(error);
  if (builtin && /(?:Exception|Error)$/.test(builtin[1])) return simpleClassName(builtin[1]);
  return null;
}

/**
 * pass:  stdout matches, and the run ended the same way (normally, with the
 *        same uncaught exception class, or rejected before running).
 * wrong: the interpreter finished without error, but behaved differently.
 *        These are the harmful cases: a wrong answer with no hint the tool is at fault.
 * error: the interpreter reported an error, and the run doesn't match.
 */
export type OutcomeKind = 'pass' | 'wrong' | 'error';

export interface OutputVerdict {
  kind: OutcomeKind;
  /** Human-readable differences; empty when kind is 'pass'. */
  problems: string[];
}

export function compareOutput(golden: JdkGolden, run: InterpreterRun): OutputVerdict {
  const problems: string[] = [];

  if (golden.compileError !== null) {
    // javac rejects the program, so the interpreter must refuse to run any of it.
    if (!run.error) problems.push('javac rejects this program, but the interpreter ran it without error');
    else if (run.snapshots.length > 0) problems.push(`javac rejects this program, but the interpreter ran ${run.snapshots.length} step(s) before failing: ${run.error}`);
    if (problems.length) problems.push(`javac: ${golden.compileError.split('\n')[0]}`);
    return verdict(problems, run);
  }

  const want = goldenStdout(golden);
  const got = interpreterStdout(run);
  if (got !== want) problems.push(...describeStdoutDiff(want, got));

  const wantExc = golden.exception;
  if (wantExc === null && run.error) {
    problems.push(`java finished normally; the interpreter failed: ${run.error}`);
  } else if (wantExc !== null) {
    const expected = simpleClassName(wantExc.class);
    if (!run.error) problems.push(`java threw ${wantExc.class}; the interpreter finished normally`);
    else if (interpreterExceptionClass(run.error) !== expected) problems.push(`java threw ${wantExc.class}; the interpreter failed with: ${run.error}`);
  }
  return verdict(problems, run);
}

function verdict(problems: string[], run: InterpreterRun): OutputVerdict {
  if (problems.length === 0) return { kind: 'pass', problems };
  return { kind: run.error ? 'error' : 'wrong', problems };
}

function describeStdoutDiff(want: string, got: string, maxLines = 8): string[] {
  const w = want.split('\n');
  const g = got.split('\n');
  const out: string[] = [];
  let differing = 0;
  for (let i = 0; i < Math.max(w.length, g.length); i++) {
    if (w[i] === g[i]) continue;
    if (++differing <= maxLines) {
      out.push(`stdout line ${i + 1}: java=${JSON.stringify(w[i] ?? '<none>')} interpreter=${JSON.stringify(g[i] ?? '<none>')}`);
    }
  }
  if (differing > maxLines) out.push(`... ${differing - maxLines} more differing stdout line(s)`);
  return out;
}

// ── Snapshot invariants ──

/**
 * Checked on every case, because stdout alone misses visualization bugs:
 *   refs       every value is well formed, and every ref points to a heap object in the same snapshot
 *   lines      every step's line is within the source
 *   js-errors  no raw JavaScript error text reaches the user
 *   scopes     block-scope frames only show variables that are in scope at the step's line
 *              (catches stale variables left behind by break/continue/return/exceptions, #9)
 *   reachable  every heap object is reachable from a frame (its variables, `this` or the static fields):
 *              garbage isn't drawn (#9)
 *   statics    every step shows the entry class's static fields in a first "Static fields" frame, and a
 *              program without static fields has no such frame (#9)
 */
export const INVARIANTS = ['refs', 'lines', 'js-errors', 'scopes', 'reachable', 'statics'] as const;
export type InvariantName = typeof INVARIANTS[number];

/** Invariants the suite asserts: all of them. */
export const ENFORCED_INVARIANTS: readonly InvariantName[] = INVARIANTS;

/** At most this many violations are reported per invariant per case. */
const MAX_VIOLATIONS = 5;

export function checkInvariant(name: InvariantName, c: JdkCase, run: InterpreterRun): string[] {
  try {
    switch (name) {
      case 'refs': return checkRefs(run.snapshots);
      case 'lines': return checkLines(run.snapshots, lineCount(c.source));
      case 'js-errors': return checkJsErrors(run.error);
      case 'scopes': return checkScopes(run.snapshots, c.source);
      case 'reachable': return checkReachable(run.snapshots);
      case 'statics': return checkStatics(run.snapshots, c.source);
    }
  } catch (e) {
    // Snapshots malformed in a way the checker didn't anticipate: report, don't crash the run.
    return [`could not check ${name}; snapshots are malformed: ${errorText(e)}`];
  }
}

function lineCount(source: string): number {
  return source.replace(/\n$/, '').split('\n').length;
}

/** Value types a Java program can show. `undefined` or `symbol` would be JavaScript leaking through. */
const JAVA_VALUE_TYPES: Record<string, (v: RuntimeValue) => boolean> = {
  number: v => typeof (v as { value: unknown }).value === 'number',
  string: v => typeof (v as { value: unknown }).value === 'string',
  boolean: v => typeof (v as { value: unknown }).value === 'boolean',
  null: v => (v as { value: unknown }).value === null,
  bigint: () => true,
  ref: v => typeof (v as { heapId: unknown }).heapId === 'string',
};

/**
 * Every value in a snapshot, labeled with where it appears. Indexed loops, so
 * holes in a sparse array (which map/forEach skip) surface as undefined entries.
 */
function* valuesOf(s: ExecutionSnapshot): Generator<[string, RuntimeValue | undefined]> {
  for (const f of s.callStack) {
    const vars = [...(f.variables ?? []), ...(f.closureVars ?? [])];
    for (let i = 0; i < vars.length; i++) {
      const v = vars[i];
      yield v ? [`variable '${v.name}' in frame ${f.name}`, v.value] : [`variable #${i} of frame ${f.name}`, undefined];
    }
    if (f.thisArg) yield [`this of frame ${f.name}`, f.thisArg];
  }
  for (const h of s.heap) {
    const props = h.properties ?? [];
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      yield p ? [`property '${p.key}' of heap #${h.id}`, p.value] : [`property #${i} of heap #${h.id}`, undefined];
    }
    if (h.proto) yield [`prototype of heap #${h.id}`, h.proto];
  }
}

function checkRefs(snapshots: ExecutionSnapshot[]): string[] {
  const out: string[] = [];
  for (const s of snapshots) {
    const ids = new Set<string>();
    for (const h of s.heap) {
      if (ids.has(h.id)) out.push(`step ${s.step}: heap id #${h.id} appears twice`);
      ids.add(h.id);
    }
    for (const [where, v] of valuesOf(s)) {
      if (!v || typeof v !== 'object' || !(JAVA_VALUE_TYPES[v.type]?.(v) ?? false)) {
        out.push(`step ${s.step}: ${where} is not a valid value: ${JSON.stringify(v)}`);
      } else if (v.type === 'ref' && !ids.has(v.heapId)) {
        out.push(`step ${s.step}: ${where} points to heap #${v.heapId}, which isn't in the snapshot`);
      }
    }
    if (out.length >= MAX_VIOLATIONS) break;
  }
  return out.slice(0, MAX_VIOLATIONS);
}

function checkLines(snapshots: ExecutionSnapshot[], lines: number): string[] {
  const out: string[] = [];
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= lines;
  for (const s of snapshots) {
    if (!ok(s.line)) out.push(`step ${s.step}: line ${s.line} is outside the source (1-${lines})`);
    if (s.condition && !ok(s.condition.line)) out.push(`step ${s.step}: condition line ${s.condition.line} is outside the source (1-${lines})`);
    if (out.length >= MAX_VIOLATIONS) break;
  }
  return out;
}

/** Messages the JavaScript engine produces; the user should see Java-level errors instead (#7). */
export const JS_ERROR_PATTERNS: readonly RegExp[] = [
  /Cannot read propert(?:y|ies) of/,
  /Cannot set propert(?:y|ies) of/,
  /Maximum call stack size exceeded/,
  /is not a function/,
  /is not iterable/,
  /is not a constructor/,
  /Invalid array length/,
  /\b(?:TypeError|RangeError|ReferenceError|SyntaxError)\b/,
  /\[object Object\]/,
  /\bundefined\b/,
];

function checkJsErrors(error: string | null): string[] {
  if (!error) return [];
  const hit = JS_ERROR_PATTERNS.find(p => p.test(error));
  return hit ? [`error message leaks JavaScript text (${hit.source}): ${error}`] : [];
}

/** A block-scoped local: in scope from its declaration line through the end of its scope. */
interface ScopedDeclaration { name: string; from: number; to: number }

/** Nodes whose extent bounds the scope of the locals declared directly inside them. */
const SCOPE_NODES = new Set([
  'block', 'constructorBody', 'switchBlock', 'basicForStatement', 'enhancedForStatement', 'catchClause', 'tryWithResourcesStatement',
]);

function identifierOf(node: CstNode | undefined): CstToken | undefined {
  return node ? token(node, 'Identifier') : undefined;
}

/**
 * The frame name the interpreter would use for code in `node`, if it starts a
 * frame: a method's name, a constructor's class name, the class name for an
 * instance initializer block (it runs in a constructor's frame) and
 * `<clinit>` for a static initializer block.
 */
function frameNameOf(node: CstNode, className: string | null): string | null | undefined {
  switch (node.name) {
    case 'methodDeclaration':
    case 'interfaceMethodDeclaration': {
      const header = child(node, 'methodHeader');
      return identifierOf(header && child(header, 'methodDeclarator'))?.image ?? null;
    }
    case 'constructorDeclaration':
    case 'compactConstructorDeclaration': {
      const declarator = node.name === 'constructorDeclaration' ? child(node, 'constructorDeclarator') : node;
      const simple = declarator && child(declarator, 'simpleTypeName');
      return identifierOf(simple && child(simple, 'typeIdentifier'))?.image ?? null;
    }
    case 'instanceInitializer':
      return className;
    case 'staticInitializer':
      return '<clinit>';
  }
  return undefined; // not a method: keep the enclosing one
}

/**
 * Block-scoped locals of every method, constructor and initializer block,
 * keyed the way the interpreter names frames (method name; class name for
 * constructors and instance initializer blocks; `<clinit>` for static blocks):
 * locals in blocks and switch blocks, for-init and for-each variables, catch
 * parameters, try-with-resources resources and instanceof pattern variables.
 * A pattern variable is given its whole enclosing block, a superset of its real
 * scope, so the check can miss a stale one but never flags a correct one.
 */
export function blockScopedDeclarations(source: string): Map<string, ScopedDeclaration[]> {
  const table = new Map<string, ScopedDeclaration[]>();
  const record = (method: string, tok: CstToken | undefined, to: number) => {
    if (!tok) return;
    const list = table.get(method) ?? [];
    list.push({ name: tok.image, from: tok.startLine, to });
    table.set(method, list);
  };

  const walk = (node: CstNode, method: string | null, scopeEnd: number, className: string | null) => {
    if (node.name === 'normalClassDeclaration') className = identifierOf(child(node, 'typeIdentifier'))?.image ?? className;
    const frameName = frameNameOf(node, className);
    if (frameName !== undefined) method = frameName;
    if (SCOPE_NODES.has(node.name) && node.location) scopeEnd = node.location.endLine;

    if (method !== null && node.name === 'localVariableDeclaration') {
      const list = child(node, 'variableDeclaratorList');
      for (const d of list ? children(list, 'variableDeclarator') : []) {
        record(method, identifierOf(child(d, 'variableDeclaratorId')), scopeEnd);
      }
    } else if (method !== null && node.name === 'catchFormalParameter') {
      record(method, identifierOf(child(node, 'variableDeclaratorId')), scopeEnd);
    }

    for (const items of Object.values(node.children)) {
      for (const item of items) {
        if (isCstNode(item)) walk(item, method, scopeEnd, className);
      }
    }
  };

  let root: CstNode;
  try {
    root = parseJava(source);
  } catch {
    return table; // unparseable: the interpreter produced no snapshots either
  }
  walk(root, null, Number.MAX_SAFE_INTEGER, null);
  return table;
}

function checkScopes(snapshots: ExecutionSnapshot[], source: string): string[] {
  if (snapshots.length === 0) return [];
  const table = blockScopedDeclarations(source);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of snapshots) {
    // Block frames after the innermost method frame belong to it, and the step's line is in it.
    let m = s.callStack.length - 1;
    while (m >= 0 && s.callStack[m].isBlockScope) m--;
    if (m < 0 || m === s.callStack.length - 1) continue;
    const method = s.callStack[m].name;
    const decls = table.get(method);
    if (!decls) continue; // not a method in the source (e.g. a library callback)
    for (const frame of s.callStack.slice(m + 1)) {
      for (const v of frame.variables) {
        if (!v) continue; // malformed entries are reported by the refs invariant
        if (decls.some(d => d.name === v.name && d.from <= s.line && s.line <= d.to)) continue;
        const key = `${method}:${v.name}:${s.line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(`step ${s.step}, line ${s.line}: block frame "${frame.name}" of ${method}() shows '${v.name}', which isn't in scope on this line`);
        if (out.length >= MAX_VIOLATIONS) return out;
      }
    }
  }
  return out;
}

function checkReachable(snapshots: ExecutionSnapshot[]): string[] {
  const out: string[] = [];
  for (const s of snapshots) {
    const byId = new Map(s.heap.map(h => [h.id, h]));
    const reached = new Set<string>();
    const pending: string[] = [];
    const visit = (v: RuntimeValue | undefined) => {
      if (v?.type === 'ref' && !reached.has(v.heapId)) { reached.add(v.heapId); pending.push(v.heapId); }
    };
    for (const f of s.callStack) {
      f.variables.forEach(v => visit(v?.value));
      f.closureVars?.forEach(v => visit(v?.value));
      visit(f.thisArg);
    }
    while (pending.length) {
      const h = byId.get(pending.pop()!);
      h?.properties.forEach(p => visit(p?.value));
      visit(h?.proto);
    }
    const dead = s.heap.filter(h => !reached.has(h.id)).map(h => `#${h.id} ${h.label ?? h.objectType}`);
    if (dead.length) out.push(`step ${s.step}: unreachable heap object(s) ${dead.slice(0, 5).join(', ')}${dead.length > 5 ? ` and ${dead.length - 5} more` : ''}`);
    if (out.length >= MAX_VIOLATIONS) break;
  }
  return out;
}

/**
 * The static fields of a program's entry class (the first top-level class with
 * a static main) as the "Static fields" frame names them (`Main.moves`), and
 * whether the program declares any static field at all, in any class or
 * interface (an interface's fields are static).
 */
export function staticFieldsOf(source: string): { entry: string[]; any: boolean } {
  let root: CstNode;
  try {
    root = parseJava(source);
  } catch {
    return { entry: [], any: false };
  }
  const isStatic = (modifiers: CstNode[]) => modifiers.some(m => m.children.Static);
  const fieldNames = (field: CstNode) => {
    const list = child(field, 'variableDeclaratorList');
    return (list ? children(list, 'variableDeclarator') : []).map(d => identifierOf(child(d, 'variableDeclaratorId'))?.image ?? '?');
  };

  let any = false;
  const findAny = (node: CstNode) => {
    if (node.name === 'constantDeclaration' || (node.name === 'fieldDeclaration' && isStatic(children(node, 'fieldModifier')))) any = true;
    for (const items of Object.values(node.children)) for (const item of items) if (isCstNode(item)) findAny(item);
  };
  findAny(root);

  const unit = child(root, 'ordinaryCompilationUnit');
  for (const typeDecl of unit ? children(unit, 'typeDeclaration') : []) {
    const normal = child(child(typeDecl, 'classDeclaration') ?? typeDecl, 'normalClassDeclaration');
    const body = normal && child(normal, 'classBody');
    if (!normal || !body) continue;
    const name = identifierOf(child(normal, 'typeIdentifier'))?.image;
    const statics: string[] = [];
    let hasMain = false;
    for (const decl of children(body, 'classBodyDeclaration')) {
      const member = child(decl, 'classMemberDeclaration');
      const field = member && child(member, 'fieldDeclaration');
      if (field && isStatic(children(field, 'fieldModifier'))) statics.push(...fieldNames(field).map(f => `${name}.${f}`));
      const method = member && child(member, 'methodDeclaration');
      const header = method && child(method, 'methodHeader');
      if (method && isStatic(children(method, 'methodModifier')) && identifierOf(header && child(header, 'methodDeclarator'))?.image === 'main') hasMain = true;
    }
    if (hasMain) return { entry: statics, any };
  }
  return { entry: [], any };
}

function checkStatics(snapshots: ExecutionSnapshot[], source: string): string[] {
  if (snapshots.length === 0) return [];
  const { entry, any } = staticFieldsOf(source);
  const out: string[] = [];
  for (const s of snapshots) {
    const frame = s.callStack[0]?.name === STATIC_FIELDS_FRAME ? s.callStack[0] : undefined;
    if (!any) {
      if (frame) out.push(`step ${s.step}: shows a "${STATIC_FIELDS_FRAME}" frame, but the program has no static fields`);
    } else if (!frame) {
      out.push(`step ${s.step}: has no "${STATIC_FIELDS_FRAME}" frame first`);
    } else {
      const shown = new Set(frame.variables.map(v => v?.name));
      const missing = entry.filter(name => !shown.has(name));
      if (missing.length) out.push(`step ${s.step}: doesn't show the static field(s) ${missing.join(', ')}`);
    }
    if (out.length >= MAX_VIOLATIONS) break;
  }
  return out;
}

// ── Known failures ──

export interface KnownFailure {
  /** The roadmap issue(s) whose fix should make this check pass. */
  issues: number[];
  /** What goes wrong, in a few words. */
  reason: string;
}

export interface KnownFailures {
  /** Case id → why its output doesn't match real Java yet. */
  output: Record<string, KnownFailure>;
  /** Case id → invariant name → why that invariant fails. */
  invariants: Record<string, Partial<Record<InvariantName, KnownFailure>>>;
}

export function loadKnownFailures(path = KNOWN_FAILURES_PATH): KnownFailures {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<KnownFailures>;
  return { output: raw.output ?? {}, invariants: raw.invariants ?? {} };
}

/**
 * Roadmap issues for constructs JavaTutor rejects until they land: unsupported
 * syntax (#6), inheritance (#15), and enums, records, inner and anonymous
 * classes and lambdas (#16). A program waiting on one of them must stop with
 * an error; it must never print wrong output without one (#6's guard).
 */
export const LOUD_FAILURE_ISSUES: readonly number[] = [6, 15, 16];

/** Must this known failure be an error rather than wrong output? (Its main issue is a rejected construct.) */
export function mustFailLoudly(f: KnownFailure | undefined): boolean {
  return f !== undefined && LOUD_FAILURE_ISSUES.includes(f.issues[0]);
}

/** Problems with the known-failures file itself: unknown cases or invariants, missing issue numbers. */
export function validateKnownFailures(known: KnownFailures, caseIds: Set<string>): string[] {
  const out: string[] = [];
  const checkEntry = (where: string, f: KnownFailure | undefined) => {
    if (!f || !Array.isArray(f.issues) || f.issues.length === 0 || !f.issues.every(n => Number.isInteger(n) && n > 0)) {
      out.push(`${where}: needs "issues": [<issue number>, ...]`);
    }
    if (!f || typeof f.reason !== 'string' || f.reason.trim() === '') out.push(`${where}: needs a "reason"`);
  };
  for (const [id, f] of Object.entries(known.output)) {
    if (!caseIds.has(id)) out.push(`output.${id}: no such case`);
    checkEntry(`output.${id}`, f);
  }
  for (const [id, byInvariant] of Object.entries(known.invariants)) {
    if (!caseIds.has(id)) out.push(`invariants.${id}: no such case`);
    for (const [name, f] of Object.entries(byInvariant)) {
      if (!ENFORCED_INVARIANTS.includes(name as InvariantName)) out.push(`invariants.${id}.${name}: not an enforced invariant (${ENFORCED_INVARIANTS.join(', ')})`);
      checkEntry(`invariants.${id}.${name}`, f);
    }
  }
  return out;
}
