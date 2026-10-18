/**
 * Node differential harness (#42): runs a case through JSTutor exactly as the
 * app does, and compares the run with what Node did (the golden).
 *
 * The run: `prepareProgram` and `executeInWorker` from the executor, with a
 * Node thread as the worker (nodeWorker.ts), so the reply is the one the
 * browser's worker posts, structured-cloned, at the moment it posts it.
 *
 * The checks, each its own test in node-differential.test.ts:
 *   output       the console at the last step (stdout and stderr lines, in
 *                order) is what Node's console printed. JSTutor prints in
 *                Node's format (#43's decision), so the text must match
 *                exactly; a run JSTutor stopped at the step cap shows a prefix,
 *                and one that died of an uncaught exception what came before.
 *   ending       the run ends as Node's did: normally, with the same uncaught
 *                exception, at the step cap for an endless loop, or, for a
 *                program that doesn't parse, with V8's SyntaxError and line.
 *   coverage     every line whose statements ran in Node got a step.
 *   final-state  the last step's Global frame shows each top-level name's
 *                final value (as an exported file has it: after JSON).
 *   refs, lines, names, reachable, frames   snapshot invariants (INVARIANTS).
 */
import { readFileSync } from 'node:fs';
import { WORKER_TIMEOUT, executeInWorker, prepareProgram } from '../../executor';
import type { ExecutionSnapshot, RuntimeValue, WorkerMessage } from '../../../../types/snapshot';
import { diffCanon, shownCanon } from './canon';
import { KNOWN_FAILURES_PATH, SYNTAX_ERRORS_CATEGORY, type GoldenLine, type NodeCase, type NodeGolden } from './corpus';
import { nodeWorker } from './nodeWorker';

/** The step cap every engine stops at. */
export const MAX_STEPS = 5000;

/** Run a program through JSTutor as the app does: instrument, then the worker's reply (or the kill after `timeoutMs`). */
export async function runJsTutor(source: string, timeoutMs = WORKER_TIMEOUT): Promise<WorkerMessage> {
  const program = prepareProgram(source);
  if ('reply' in program) return program.reply;
  return executeInWorker(program.code, nodeWorker, timeoutMs);
}

/**
 * How long a case may run before the worker is killed: the app's 10 seconds
 * for a program Node shows is endless, and a minute for the rest. A program
 * that posts hundreds of megabytes can take about 10 seconds, and which of
 * its reply and the kill came first would make the result depend on the
 * machine's speed. The payload test (#49) watches the size instead.
 */
export function caseTimeout(golden: NodeGolden): number {
  return golden.endless ? WORKER_TIMEOUT : 60_000;
}

/** Run a corpus case through JSTutor. */
export function runCase(c: NodeCase, golden: NodeGolden): Promise<WorkerMessage> {
  return runJsTutor(c.source, caseTimeout(golden));
}

export const OUTPUT_CHECKS = ['output', 'ending', 'coverage', 'final-state'] as const;
export const INVARIANTS = ['refs', 'lines', 'names', 'reachable', 'frames'] as const;
export const CHECKS = [...OUTPUT_CHECKS, ...INVARIANTS] as const;
export type CheckName = typeof CHECKS[number];

/** How a case compares with Node, as #41's table counts it. */
export type Verdict = 'match' | 'layout' | 'wrong-output' | 'wrong-state' | 'error' | 'compile';

export interface CaseResult {
  /** Each check's problems: empty when it passes (or doesn't apply to this run). */
  checks: Record<CheckName, string[]>;
  verdict: Verdict;
}

const MAX_PROBLEMS = 6;

// ── What the console shows ──

/** The console at the last step, line by line, without an uncaught error's text (compared by `ending`). */
export function shownConsole(reply: WorkerMessage): GoldenLine[] {
  if (reply.type !== 'result') return [];
  const last = reply.snapshots[reply.snapshots.length - 1];
  if (!last) return [];
  const lines = last.console ?? last.stdout.map(text => ({ text, stream: 'stdout' as const }));
  return lines.flatMap(l => l.text.split('\n').map(text => ({ stream: l.stream, text })));
}

/** A V8 stack frame line (`    at f (file:///main.js:3:9)`), or Node's note for frames shared with a cause. */
const STACK_FRAME = /^\s+at .+(?:\(.*\)|:\d+:\d+)( \{)?$|^\s+\.\.\. \d+ lines? matching cause stack trace \.\.\.$/;

/**
 * Lines without an error's stack frames, which JSTutor leaves out (the
 * browser's frames point into instrumented code, and Node's are Node's). A
 * frame line ending an error's layout with ` {` gives it to the line before.
 */
export function withoutStackFrames(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const m = STACK_FRAME.exec(line);
    if (!m) { out.push(line); continue; }
    if (m[1] && out.length) out[out.length - 1] += ' {';
  }
  return out;
}

function withoutFrames(lines: GoldenLine[]): GoldenLine[] {
  const out: GoldenLine[] = [];
  for (const l of lines) {
    const m = STACK_FRAME.exec(l.text);
    if (!m) { out.push(l); continue; }
    if (m[1] && out.length) out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + ' {' };
  }
  return out;
}

const quote = (s: string) => JSON.stringify(s.length > 90 ? s.slice(0, 90) + '…' : s);
const lineText = (l: GoldenLine | undefined) => (l ? `${quote(l.text)}${l.stream === 'stderr' ? ' (stderr)' : ''}` : '(nothing)');

/** The text with layout removed: whitespace, quote style, key quotes, stream labels, so `[1,2]` equals `[ 1, 2 ]`. */
function withoutLayout(lines: GoldenLine[]): string {
  return lines
    .map(l => l.text.replace(/^\[(warn|error|info|debug)\] /, ''))
    .join('')
    .replace(/\s+/g, '')
    .replace(/'/g, '"')
    .replace(/"([A-Za-z_$][\w$]*)":/g, '$1:');
}

function stoppedAtCap(reply: WorkerMessage): boolean {
  return reply.type === 'result' && reply.error?.kind === 'limit';
}

function checkOutput(golden: NodeGolden, reply: WorkerMessage): { problems: string[]; layoutOnly: boolean } {
  if (golden.compileError) return { problems: [], layoutOnly: false };
  // An error's stack frames can't match, so neither side's are compared. The
  // run ends at the first uncaught exception, as Node ends it (browsers would
  // run the remaining callbacks), so Node's console counts up to there.
  const first = golden.uncaught[0];
  const want = withoutFrames(first ? golden.console.slice(0, first.consoleLines) : golden.console);
  const got = withoutFrames(shownConsole(reply));
  // A run stopped early (JSTutor's step cap, or Node's endless loop) is compared as far as both got.
  const prefixOnly = stoppedAtCap(reply) || golden.endless;
  const n = prefixOnly ? Math.min(want.length, got.length) : Math.max(want.length, got.length);
  for (let i = 0; i < n; i++) {
    const a = want[i];
    const b = got[i];
    if (a && b && a.text === b.text && a.stream === b.stream) continue;
    const problems = [`console line ${i + 1}: Node ${lineText(a)} | JSTutor ${lineText(b)}`];
    if (want.length !== got.length) problems.push(`Node printed ${want.length} line(s), JSTutor shows ${got.length}`);
    const layoutOnly = !prefixOnly && withoutLayout(want) === withoutLayout(got);
    if (layoutOnly) problems.push('(the same values, laid out differently)');
    return { problems, layoutOnly };
  }
  return { problems: [], layoutOnly: false };
}

// ── How the run ends ──

/** The uncaught exception's text as JSTutor reports it: `TypeError: msg`, or a thrown value's String(). */
export function uncaughtText(u: { name: string | null; message: string }): string {
  return u.name !== null ? `${u.name}: ${u.message}` : u.message;
}

/** Whether a program does enough work that stopping at the step cap is expected: an endless loop, a timer never cleared, or thousands of statements. */
export function capExpected(golden: NodeGolden): boolean {
  return golden.endless || golden.pendingTimers || golden.statementRuns + golden.functionCalls >= MAX_STEPS * 0.7;
}

type EndingProblem = { problems: string[]; kind: 'none' | 'missing' | 'extra' | 'differs' | 'stopped' };

function checkEnding(golden: NodeGolden, reply: WorkerMessage): EndingProblem {
  const none: EndingProblem = { problems: [], kind: 'none' };
  if (golden.compileError) {
    const want = golden.compileError;
    // A program that doesn't parse is a `compile` error with V8's message and line, and no steps (#50).
    const text = `SyntaxError: ${want.message}`;
    const err = reply.type === 'error' ? { message: reply.message, line: reply.line, kind: undefined } : reply.error;
    const steps = reply.type === 'result' ? reply.snapshots.length : 0;
    const problems: string[] = [];
    if (steps > 0) problems.push(`the program doesn't parse, but JSTutor took ${steps} step(s)`);
    if (!err) problems.push(`V8: ${text} (line ${want.line}); JSTutor reports no error`);
    else if (err.message !== text || err.line !== want.line || err.kind !== 'compile') {
      problems.push(`V8: ${text} (line ${want.line}) | JSTutor: ${err.kind ?? 'error before running'}: ${err.message} (line ${err.line ?? '?'})`);
    }
    return problems.length ? { problems, kind: 'differs' } : none;
  }
  if (reply.type === 'error') return { problems: [`stopped before any step: ${reply.message}`], kind: 'stopped' };
  const err = reply.error;
  if (golden.endless) {
    return err?.kind === 'limit' ? none : { problems: [`Node never finishes (an endless loop); JSTutor ${err ? `ends with ${err.kind}: ${err.message}` : 'ends normally'}`], kind: 'missing' };
  }
  if (err?.kind === 'limit') {
    if (capExpected(golden)) return none;
    return { problems: [`stopped at the step cap after ${reply.snapshots.length} steps, but Node ran only ${golden.statementRuns} statements and ${golden.functionCalls} calls`], kind: 'extra' };
  }
  const first = golden.uncaught[0];
  if (first) {
    const want = uncaughtText(first);
    const where = first.where === 'script' ? '' : ` (in a ${first.where === 'promise' ? 'promise' : 'timer callback'})`;
    if (err?.kind !== 'exception') return { problems: [`Node: uncaught ${want}${where}; JSTutor: ${err ? `${err.kind}: ${err.message}` : 'no error'}`], kind: err ? 'differs' : 'missing' };
    if (err.message !== want) return { problems: [`Node: uncaught ${want}${where} | JSTutor: ${err.message}`], kind: 'differs' };
    return none;
  }
  if (err) return { problems: [`Node ends normally; JSTutor ends with ${err.kind}: ${err.message}`], kind: 'extra' };
  return none;
}

// ── Lines that ran ──

/**
 * Whether V8's block coverage tells exactly which statements ran: it counts a
 * statement after a call that threw, in the same block, as run, so it can't
 * be trusted for a program that recovers from an exception or dies of one.
 */
export function coverageIsExact(source: string, golden: NodeGolden): boolean {
  return golden.uncaught.length === 0 && !/\bcatch\b|\bfinally\b|\bthrow\b|allSettled|Promise\.any\b/.test(source);
}

function checkCoverage(c: NodeCase, golden: NodeGolden, reply: WorkerMessage): string[] {
  if (golden.compileError || reply.type !== 'result' || reply.error?.kind === 'limit' || golden.endless) return [];
  if (!coverageIsExact(c.source, golden)) return [];
  const stepLines = new Set(reply.snapshots.map(s => s.line));
  const missing = golden.executedLines.filter(l => !stepLines.has(l));
  if (!missing.length) return [];
  const src = c.source.split('\n');
  return [
    `${missing.length} line(s) ran in Node with no step: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ', …' : ''}`,
    ...missing.slice(0, 3).map(l => `  line ${l}: ${src[l - 1]?.trim().slice(0, 80)}`),
  ];
}

// ── The final state ──

function checkFinalState(golden: NodeGolden, reply: WorkerMessage): string[] {
  if (golden.compileError || reply.type !== 'result' || reply.error) return [];
  if (golden.uncaught.length || golden.endless || golden.pendingTimers) return [];
  const raw = reply.snapshots[reply.snapshots.length - 1];
  if (!raw) return ['no steps'];
  const last = JSON.parse(JSON.stringify(raw)) as ExecutionSnapshot;
  const global = last.callStack[0];
  const shown = new Map((global?.variables ?? []).map(v => [v.name, v.value]));
  const problems: string[] = [];
  for (const [name, want] of Object.entries(golden.finalGlobals)) {
    if (want === '<uninitialized>') continue;
    if (!shown.has(name)) { problems.push(`${name} isn't shown in the Global frame`); continue; }
    diffCanon(want, shownCanon(shown.get(name), last.heap), name, problems, MAX_PROBLEMS);
    if (problems.length >= MAX_PROBLEMS) break;
  }
  return problems;
}

// ── Snapshot invariants ──

/** Every value in a snapshot, with where it is. */
function* valuesOf(s: ExecutionSnapshot): Generator<[string, RuntimeValue]> {
  for (const f of s.callStack) {
    for (const v of f.variables ?? []) yield [`${f.name}.${v.name}`, v.value];
    for (const v of f.closureVars ?? []) yield [`${f.name} (closure).${v.name}`, v.value];
    if (f.thisArg) yield [`${f.name}.this`, f.thisArg];
  }
  for (const h of s.heap) {
    for (const p of h.properties ?? []) {
      yield [`heap ${h.id}.${p.key}`, p.value];
      const key = (p as { keyValue?: RuntimeValue }).keyValue;
      if (key) yield [`heap ${h.id} key ${p.key}`, key];
    }
  }
}

/** The runtime's own names, which the program must never see. */
export const INSTRUMENTATION_TEXT = /__(capture|pushFrame|popFrame|popThrowingFrame|condition|runResult|serialize\w*|collectHeap|updateFrames|logOutput|snapshots|callStack|heap\w*|STOP|e)__|__loopCount|__MAX_LOOPS|__MAX_SNAPSHOTS/;

function firstViolations(snapshots: ExecutionSnapshot[], check: (s: ExecutionSnapshot) => string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of snapshots) {
    for (const v of check(s)) {
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(`step ${s.step}: ${v}`);
      if (out.length >= MAX_PROBLEMS) return out;
    }
  }
  return out;
}

function checkRefs(snapshots: ExecutionSnapshot[]): string[] {
  return firstViolations(snapshots, s => {
    const ids = new Set(s.heap.map(h => h.id));
    const out: string[] = [];
    for (const [where, v] of valuesOf(s)) if (v.type === 'ref' && !ids.has(v.heapId)) out.push(`${where} refers to missing heap object ${v.heapId}`);
    return out;
  });
}

function checkLines(snapshots: ExecutionSnapshot[], lineCount: number): string[] {
  return firstViolations(snapshots, s => (Number.isInteger(s.line) && s.line >= 1 && s.line <= lineCount ? [] : [`line ${s.line} isn't a line of the program (1–${lineCount})`]));
}

function checkNames(c: NodeCase, reply: WorkerMessage): string[] {
  const words = new Set(c.source.match(/[A-Za-z_$][\w$]*/g) ?? []);
  const out: string[] = [];
  if (reply.type === 'result') {
    out.push(...firstViolations(reply.snapshots, s => {
      const found: string[] = [];
      for (const f of s.callStack) {
        if (INSTRUMENTATION_TEXT.test(f.name)) found.push(`frame named ${f.name}`);
        for (const v of [...(f.variables ?? []), ...(f.closureVars ?? [])]) {
          if (v.name !== 'return ↵' && v.name !== 'this' && !words.has(v.name)) found.push(`variable ${f.name}.${v.name} isn't the program's`);
        }
      }
      for (const [where, v] of valuesOf(s)) {
        if (v.type === 'string' && INSTRUMENTATION_TEXT.test(String(v.value))) found.push(`${where} shows instrumented code`);
      }
      for (const h of s.heap) {
        for (const p of h.properties ?? []) if (INSTRUMENTATION_TEXT.test(p.key)) found.push(`heap ${h.id}'s key shows instrumented code`);
      }
      for (const line of s.console?.map(l => l.text) ?? s.stdout) {
        if (INSTRUMENTATION_TEXT.test(line)) found.push(`the console shows instrumented code: ${quote(line)}`);
      }
      return found;
    }));
    const err = reply.error;
    if (err && INSTRUMENTATION_TEXT.test(`${err.message}\n${err.stderr ?? ''}`)) out.push(`the error names instrumentation: ${quote(err.message)}`);
  } else if (INSTRUMENTATION_TEXT.test(reply.message)) {
    out.push(`the error names instrumentation: ${quote(reply.message)}`);
  }
  return out.slice(0, MAX_PROBLEMS);
}

function checkReachable(snapshots: ExecutionSnapshot[]): string[] {
  return firstViolations(snapshots, s => {
    const edges = new Map<string, string[]>();
    for (const h of s.heap) {
      const out: string[] = [];
      for (const p of h.properties ?? []) {
        if (p.value.type === 'ref') out.push(p.value.heapId);
        const key = (p as { keyValue?: RuntimeValue }).keyValue;
        if (key?.type === 'ref') out.push(key.heapId);
      }
      edges.set(h.id, out);
    }
    const stack: string[] = [];
    for (const f of s.callStack) {
      for (const v of [...(f.variables ?? []), ...(f.closureVars ?? [])]) if (v.value.type === 'ref') stack.push(v.value.heapId);
      if (f.thisArg?.type === 'ref') stack.push(f.thisArg.heapId);
    }
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(edges.get(id) ?? []));
    }
    return s.heap.filter(h => !seen.has(h.id)).map(h => `heap object ${h.id} (${h.objectType}${h.label ? ' ' + h.label : ''}) is drawn but unreachable`);
  });
}

function checkFrames(reply: WorkerMessage): string[] {
  if (reply.type !== 'result' || reply.error) return [];
  const last = reply.snapshots[reply.snapshots.length - 1];
  if (!last || last.callStack.length <= 1) return [];
  return [`the run ended normally with frames left: ${last.callStack.map(f => f.name + (f.isBlockScope ? ' {}' : '')).join(' > ')}`];
}

// ── All checks ──

export function checkCase(c: NodeCase, golden: NodeGolden, reply: WorkerMessage): CaseResult {
  const snapshots = reply.type === 'result' ? reply.snapshots : [];
  const output = checkOutput(golden, reply);
  const ending = checkEnding(golden, reply);
  const checks: Record<CheckName, string[]> = {
    output: output.problems,
    ending: ending.problems,
    coverage: checkCoverage(c, golden, reply),
    'final-state': checkFinalState(golden, reply),
    refs: checkRefs(snapshots),
    lines: checkLines(snapshots, c.source.split('\n').length),
    names: checkNames(c, reply),
    reachable: checkReachable(snapshots),
    frames: checkFrames(reply),
  };
  return { checks, verdict: verdictOf(c, checks, output.layoutOnly, ending.kind, reply) };
}

function verdictOf(c: NodeCase, checks: Record<CheckName, string[]>, layoutOnly: boolean, ending: EndingProblem['kind'], reply: WorkerMessage): Verdict {
  const fails = (n: CheckName) => checks[n].length > 0;
  if (c.category === SYNTAX_ERRORS_CATEGORY) return fails('ending') ? 'compile' : 'match';
  if (reply.type === 'error' || ending === 'extra' || ending === 'stopped') return 'error';
  if ((fails('output') && !layoutOnly) || ending === 'missing' || ending === 'differs') return 'wrong-output';
  if (CHECKS.some(n => n !== 'output' && fails(n))) return 'wrong-state';
  return fails('output') ? 'layout' : 'match';
}

// ── Known failures ──

export interface KnownFailure {
  /** The roadmap issues (#41) the failure waits on, main one first. */
  issues: number[];
  /** The symptom, in a few words. */
  reason: string;
}

/** case id → check → why it fails today. */
export type KnownFailures = Record<string, Partial<Record<CheckName, KnownFailure>>>;

export function loadKnownFailures(path = KNOWN_FAILURES_PATH): KnownFailures {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { failures?: KnownFailures };
  return raw.failures ?? {};
}

export function validateKnownFailures(known: KnownFailures, caseIds: Set<string>): string[] {
  const out: string[] = [];
  for (const [id, byCheck] of Object.entries(known)) {
    if (!caseIds.has(id)) out.push(`${id}: no such case`);
    for (const [name, f] of Object.entries(byCheck)) {
      const where = `${id}.${name}`;
      if (!(CHECKS as readonly string[]).includes(name)) out.push(`${where}: not a check (${CHECKS.join(', ')})`);
      if (!f || !Array.isArray(f.issues) || f.issues.length === 0 || !f.issues.every(n => Number.isInteger(n) && n > 0)) {
        out.push(`${where}: needs "issues": [<issue number>, ...]`);
      }
      if (!f || typeof f.reason !== 'string' || f.reason.trim() === '') out.push(`${where}: needs a "reason"`);
    }
  }
  return out;
}
