/**
 * CPython differential harness (#29): runs a case through PyTutor exactly as
 * the browser's worker does (runner.ts: runProgram in a fresh Pyodide), and
 * compares the run with what CPython did (the golden).
 *
 * The checks, each its own test in cpython-differential.test.ts:
 *   output       the console at the last step is CPython's stdout (a run
 *                stopped at the step cap shows a prefix).
 *   ending       the run ends as CPython's did: normally, with the same
 *                uncaught exception, at the step cap for an endless loop, or,
 *                for a program CPython rejects, with its SyntaxError and line.
 *   traceback    an uncaught exception's traceback is CPython's.
 *   steps        each step is a CPython event at the same line with the same
 *                stack of frames, in order, and every line CPython ran has one.
 *   variables    each step's innermost frame shows the variables CPython's has.
 *   values       and with CPython's values (and `return ↵` with the return value).
 *   final-state  the last step's module frame holds the final globals.
 *   refs, lines, names, reachable   snapshot invariants.
 *
 * PyTutor's deliberate rules are part of the comparison, not exceptions per
 * case: the lines inside a multi-line statement are one step, a comprehension
 * has a frame of its own, and a class body's bookkeeping is hidden.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TIMEOUT_REPLY, WORKER_TIMEOUT } from '../../run';
import type { ExecutionSnapshot, RuntimeValue, WorkerMessage } from '../../../../types/snapshot';
import { KNOWN_FAILURES_PATH, SYNTAX_ERRORS_CATEGORY, expandStack, type GoldenEvent, type GoldenLine, type PyCase, type PyGolden } from './corpus';
import type { RunnerMessage, RunRequest } from './runner';

/** The step cap every engine stops at. */
export const MAX_STEPS = 5000;

// ── Running cases ──

/** How a run went: the worker's reply (TIMEOUT_REPLY when the worker would have been killed), and what else was seen. */
export interface RunOutcome {
  reply: WorkerMessage;
  /** The run's CPU time (for reports only: it varies with the machine). */
  cpuMs: number;
  /** The run never finished (HARD_KILL_MS): the reply is TIMEOUT_REPLY, as the worker's kill gives. */
  killed: boolean;
  /** What reached Pyodide's own stdout and stderr: the browser's console, which students don't see. */
  lostStdout: string;
  lostStderr: string;
}

/**
 * A run still going after this long never finishes: the worker's kill. Time
 * decides nothing else: a run near the worker's 10 s would be killed on one
 * machine and not on another, and the suite must give the same result
 * everywhere. A run that draws too much stops instead at the runner's work
 * budget (SUITE_WORK_BUDGET), as the tracer's time budget would stop it; what
 * is left is a program that runs without trace events (one long C call).
 */
const HARD_KILL_MS = 60_000;

const RUNNER_PATH = fileURLToPath(new URL('./runner.ts', import.meta.url));

interface Runner {
  child: ChildProcess;
  busy: boolean;
  /** The end of what the runner wrote to stderr (Pyodide logs the browser-like stdin's error there), for a crash's message. */
  stderr: string;
}

/** Child processes running cases, each case in a fresh Pyodide (runner.ts). */
export class RunnerPool {
  private runners = new Set<Runner>();
  private waiting: Array<(r: Runner) => void> = [];
  private nextId = 0;
  private closed = false;

  readonly size: number;

  constructor(size = Math.max(2, Math.min(8, availableParallelism() - 4))) {
    this.size = size;
  }

  private spawn(): Runner {
    const child = fork(RUNNER_PATH, [], {
      execArgv: ['--import', 'tsx'],
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const runner: Runner = { child, busy: false, stderr: '' };
    child.stderr!.on('data', (d: Buffer) => { runner.stderr = (runner.stderr + d.toString('utf8')).slice(-4000); });
    this.runners.add(runner);
    child.on('exit', () => this.runners.delete(runner));
    return runner;
  }

  private acquire(): Promise<Runner> {
    for (const r of this.runners) {
      if (!r.busy) { r.busy = true; return Promise.resolve(r); }
    }
    if (this.runners.size < this.size) {
      const r = this.spawn();
      r.busy = true;
      return Promise.resolve(r);
    }
    return new Promise(resolve => this.waiting.push(resolve));
  }

  private release(r: Runner, alive: boolean): void {
    if (!alive) {
      this.runners.delete(r);
      r.child.kill();
    }
    const next = this.waiting.shift();
    if (!next) { if (alive) r.busy = false; return; }
    if (alive) { next(r); return; }
    const fresh = this.spawn();
    fresh.busy = true;
    next(fresh);
  }

  /** Run a program as the worker does; a run longer than the worker allows comes back as TIMEOUT_REPLY. */
  async run(source: string, stdin: string | null = null): Promise<RunOutcome> {
    if (this.closed) throw new Error('the runner pool is closed');
    const runner = await this.acquire();
    const id = this.nextId++;
    return new Promise<RunOutcome>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (alive: boolean) => {
        clearTimeout(timer);
        runner.child.off('message', onMessage);
        runner.child.off('exit', onExit);
        this.release(runner, alive);
      };
      const onMessage = (m: RunnerMessage) => {
        if (m.id !== id) return;
        if (m.type === 'started') {
          timer = setTimeout(() => {
            finish(false);
            resolve({ reply: TIMEOUT_REPLY, cpuMs: HARD_KILL_MS, killed: true, lostStdout: '', lostStderr: '' });
          }, HARD_KILL_MS);
          return;
        }
        finish(true);
        if (m.type === 'failed') { reject(new Error(`the runner failed: ${m.message}`)); return; }
        resolve({ reply: m.reply, cpuMs: m.cpuMs, killed: false, lostStdout: m.lostStdout, lostStderr: m.lostStderr });
      };
      const onExit = (code: number | null) => {
        finish(false);
        reject(new Error(`the runner exited (${code}) during a run:
${runner.stderr}`));
      };
      runner.child.on('message', onMessage);
      runner.child.on('exit', onExit);
      runner.child.send({ id, source, stdin } satisfies RunRequest);
    });
  }

  close(): void {
    this.closed = true;
    for (const r of this.runners) r.child.kill();
    this.runners.clear();
  }
}

/** Run a corpus case through PyTutor. */
export function runCase(pool: RunnerPool, c: PyCase): Promise<RunOutcome> {
  return pool.run(c.source, c.stdin);
}

// ── Checks ──

export const OUTPUT_CHECKS = ['output', 'ending', 'traceback'] as const;
export const STEP_CHECKS = ['steps', 'variables', 'values', 'final-state'] as const;
export const INVARIANTS = ['refs', 'lines', 'names', 'reachable'] as const;
export const CHECKS = [...OUTPUT_CHECKS, ...STEP_CHECKS, ...INVARIANTS] as const;
export type CheckName = typeof CHECKS[number];

/** How a case compares with CPython, as #28's table counts it. */
export type Verdict = 'match' | 'wrong-output' | 'wrong-state' | 'error' | 'compile';

export interface CaseResult {
  /** Each check's problems: empty when it passes (or doesn't apply to this run). */
  checks: Record<CheckName, string[]>;
  verdict: Verdict;
}

const MAX_PROBLEMS = 6;
const quote = (s: string) => JSON.stringify(s.length > 90 ? s.slice(0, 90) + '…' : s);

// ── Values: the reference repr of what a step shows ──

/** The value a Python repr stands for, when it is a str literal (`'a\nb'`); null otherwise. */
export function unrepr(s: string): string | null {
  const m = /^([rbu]*)(['"])([\s\S]*)\2$/.exec(s);
  if (!m || m[1]) return null;
  return m[3].replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_, c: string) => {
    if (c[0] === 'x' || c[0] === 'u' || c[0] === 'U') return c.length > 1 ? String.fromCodePoint(parseInt(c.slice(1), 16)) : c;
    const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', f: '\f', v: '\v', 0: '\0' };
    return escapes[c] ?? '\\' + c;
  });
}

type Shown = string | { str: string } | { ref: string };

/** What a step shows for a value: the text of a primitive as Python writes it, a string's characters, or a heap reference. */
export function shownValue(v: RuntimeValue): Shown {
  switch (v.type) {
    case 'null': return 'None';
    case 'boolean': return v.value ? 'True' : 'False';
    case 'number':
      if (v.value === 'Infinity') return 'inf';
      if (v.value === '-Infinity') return '-inf';
      if (v.value === 'NaN') return 'nan';
      return String(v.value);
    case 'string': return { str: String(v.value) };
    case 'ref': return { ref: v.heapId };
    default: return JSON.stringify(v);
  }
}

/** null when the shown value is CPython's (a reference repr), else what differs. */
export function compareValue(refRepr: string, shown: RuntimeValue): string | null {
  if (refRepr.endsWith('…')) return null;
  const s = shownValue(shown);
  const showsAs = `${refRepr} shown as ${typeof s === 'string' ? s : JSON.stringify(shown)}`;
  if (refRepr.startsWith('<') && refRepr.endsWith('>')) {
    return typeof s === 'object' && 'ref' in s ? null : showsAs;
  }
  const raw = unrepr(refRepr);
  if (raw !== null) return typeof s === 'object' && 'str' in s && s.str === raw ? null : showsAs;
  return s === refRepr ? null : showsAs;
}

// ── Output ──

/**
 * The console at the last step, line by line with its stream: the step's
 * `console` once the program used stderr, else stdout's lines (#31).
 */
export function shownConsole(reply: WorkerMessage): GoldenLine[] {
  if (reply.type !== 'result') return [];
  const last = reply.snapshots[reply.snapshots.length - 1];
  if (!last) return [];
  return last.console ?? last.stdout.map(text => ({ text, stream: 'stdout' as const }));
}

function stoppedAtCap(reply: WorkerMessage): boolean {
  return reply.type === 'result' && reply.error?.kind === 'limit';
}

const lineText = (l: GoldenLine | undefined) => (l ? `${quote(l.text)}${l.stream === 'stderr' ? ' (stderr)' : ''}` : '(nothing)');

function checkOutput(golden: PyGolden, outcome: RunOutcome): string[] {
  const { reply } = outcome;
  if (golden.compileError || reply.type !== 'result') {
    return golden.compileError || !golden.console.length ? [] : [`CPython printed ${quote(golden.stdout + golden.stderr)}; PyTutor stopped before any step`];
  }
  // stdout and stderr in program order, each line with its stream.
  const want = golden.console;
  const got = shownConsole(reply);
  const problems: string[] = [];
  const prefixOnly = stoppedAtCap(reply) || golden.endless;
  const n = prefixOnly ? Math.min(want.length, got.length) : Math.max(want.length, got.length);
  for (let i = 0; i < n; i++) {
    const a = want[i];
    const b = got[i];
    if (a && b && a.stream === b.stream) {
      // A stopped run's last line may be cut short.
      if (a.text === b.text || (prefixOnly && i === n - 1 && (a.text.startsWith(b.text) || b.text.startsWith(a.text)))) continue;
    }
    problems.push(`console line ${i + 1}: CPython ${lineText(a)} | PyTutor ${lineText(b)}`);
    break;
  }
  if (outcome.lostStdout) problems.push(`written to Pyodide's stdout, the browser's console, never shown: ${quote(outcome.lostStdout)}`);
  if (outcome.lostStderr) problems.push(`written to Pyodide's stderr, the browser's console, never shown: ${quote(outcome.lostStderr)}`);
  return problems;
}

// ── How the run ends ──

/** An uncaught exception as PyTutor reports it: `ValueError: msg`, or the class alone. */
export function exceptionText(e: { class: string; message: string }): string {
  return e.message ? `${e.class}: ${e.message}` : e.class;
}

/** Whether the step cap is expected: an endless program, or one CPython takes thousands of steps for. */
export function capExpected(golden: PyGolden): boolean {
  return golden.endless || golden.truncated || golden.stepEvents >= MAX_STEPS * 0.9;
}

/** Engine text that must never reach a student. */
export const INTERNAL_TEXT = /run_traced|<user_code>|_tutor|tracer|pyodide|JsException|File "<exec>"|Traceback \(most recent call last\):\s*$/;

type EndingKind = 'none' | 'missing' | 'extra' | 'message' | 'stopped' | 'compile';

function checkEnding(golden: PyGolden, outcome: RunOutcome): { problems: string[]; kind: EndingKind } {
  const none = { problems: [], kind: 'none' as const };
  const { reply } = outcome;
  if (golden.compileError) {
    const want = golden.compileError;
    const text = `${want.class}: ${want.msg}`;
    const err = reply.type === 'error' ? reply : reply.error;
    const steps = reply.type === 'result' ? reply.snapshots.length : 0;
    const problems: string[] = [];
    if (steps > 0) problems.push(`CPython rejects the program, but PyTutor took ${steps} step(s)`);
    if (!err) problems.push(`CPython: ${text} (line ${want.line}); PyTutor reports no error`);
    else {
      if (err.message !== text) problems.push(`CPython: ${text} | PyTutor: ${err.message}`);
      if (err.line !== want.line) problems.push(`CPython: line ${want.line} | PyTutor: line ${err.line ?? '?'}`);
    }
    return problems.length ? { problems, kind: 'compile' } : none;
  }
  if (outcome.killed) {
    return { problems: [`the run never finishes (the worker is killed after ${WORKER_TIMEOUT / 1000} s): every step is lost`], kind: 'stopped' };
  }
  if (reply.type === 'error') return { problems: [`stopped before any step: ${quote(reply.message)}`], kind: 'stopped' };
  const err = reply.error;
  if (err?.kind === 'limit') {
    // An endless program may stop however it stops; any other only at the step cap, and only if CPython's trace is that long.
    if (golden.endless || (capExpected(golden) && reply.snapshots.length >= MAX_STEPS)) return none;
    return { problems: [`stopped after ${reply.snapshots.length} steps (${quote(err.message)}); CPython's trace has ${golden.stepEvents} events`], kind: 'extra' };
  }
  if (golden.endless) {
    return { problems: [`CPython never finishes (an endless loop); PyTutor ${err ? `ends with ${err.kind}: ${err.message}` : 'ends normally'}`], kind: 'missing' };
  }
  const want = golden.exception ? exceptionText(golden.exception) : null;
  if (want && err?.kind !== 'exception') return { problems: [`CPython: uncaught ${want}; PyTutor: ${err ? `${err.kind}: ${err.message}` : 'no error'}`], kind: 'missing' };
  if (!want && err) return { problems: [`CPython ends normally; PyTutor ends with ${err.kind}: ${quote(err.message)}`], kind: 'extra' };
  if (want && err && err.message !== want) return { problems: [`CPython: uncaught ${want} | PyTutor: ${err.message}`], kind: 'message' };
  return none;
}

/** A traceback without the carets under the failing expression, which PyTutor doesn't draw yet. */
export function withoutCarets(text: string): string {
  return text.replace(/\r/g, '').trim().split('\n').filter(l => !/^\s*\^+\s*$|^\s*~+\^*~*\s*$/.test(l)).join('\n');
}

function checkTraceback(golden: PyGolden, reply: WorkerMessage): string[] {
  if (!golden.exception || !golden.traceback || reply.type !== 'result' || reply.error?.kind !== 'exception' || !reply.error.stderr) return [];
  const want = withoutCarets(golden.traceback);
  const got = withoutCarets(reply.error.stderr);
  if (want === got) return [];
  const a = want.split('\n');
  const b = got.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [`traceback line ${i + 1}: CPython ${a[i] === undefined ? '(nothing)' : quote(a[i])} | PyTutor ${b[i] === undefined ? '(nothing)' : quote(b[i])}`];
}

// ── Steps against the reference trace ──

/** A class body's bookkeeping, which PyTutor hides. */
const HIDDEN_CLASS_NAMES = new Set(['__classcell__', '__class__', '__module__', '__qualname__', '__doc__', '__firstlineno__', '__static_attributes__', '__annotations__']);
/** PyTutor's own frame for a comprehension (3.12 inlines them; pythontutor.com showed `<listcomp>`). */
const PYTUTOR_COMPREHENSION = / comprehension$|^generator expression$/;
const CPYTHON_COMPREHENSION = /^<(genexpr|listcomp|dictcomp|setcomp)>$/;

interface StepComparison {
  steps: string[];
  variables: string[];
  values: string[];
}

/** The reference events steps are matched against: all but the module's `call` event at line 0, their stacks written out. */
export function referenceEvents(golden: PyGolden): GoldenEvent[] {
  return golden.events.filter(e => !(e.event === 'call' && e.line === 0)).map(e => ({ ...e, stack: expandStack(e.stack) }));
}

function compareSteps(c: PyCase, golden: PyGolden, reply: WorkerMessage): StepComparison {
  const out: StepComparison = { steps: [], variables: [], values: [] };
  if (golden.compileError || reply.type !== 'result' || golden.endless) return out;
  const snaps = reply.snapshots;
  const limited = reply.error?.kind === 'limit';
  const importedNames = new Set([...c.source.matchAll(/^\s*import\s+([\w., ]+)$/gm)].flatMap(m => m[1].split(',').map(x => x.trim().split(/\s+as\s+/).pop()!.split('.')[0])));
  const events = referenceEvents(golden);
  const matched = new Array<boolean>(events.length).fill(false);
  const compLines = new Set(golden.continuation);
  let j = 0;
  let misaligned = 0;
  const firstMisaligned: string[] = [];
  const valueDiffs: string[] = [];
  const missing = new Set<string>();
  const extra = new Set<string>();
  const returnDiffs: string[] = [];
  snaps.forEach((s, i) => {
    const names = s.callStack.map(f => f.name).filter(n => !PYTUTOR_COMPREHENSION.test(n));
    if (names.length !== s.callStack.length) {
      compLines.add(s.line);
      if (PYTUTOR_COMPREHENSION.test(s.callStack[s.callStack.length - 1].name)) return;
    }
    let found = -1;
    for (let k = j; k < Math.min(events.length, j + 60); k++) {
      const e = events[k];
      if (e.event === 'exception') continue;
      const es = e.stack.filter(n => !CPYTHON_COMPREHENSION.test(n));
      if (e.line === s.line && es.length === names.length && es.every((n, q) => n === names[q])) { found = k; break; }
    }
    if (found < 0) {
      misaligned++;
      if (firstMisaligned.length < 3) firstMisaligned.push(`step ${i} line ${s.line} [${names.join(' > ')}]`);
      return;
    }
    matched[found] = true;
    j = found + 1;
    const e = events[found];
    const top = s.callStack[s.callStack.length - 1];
    const shown = new Map((top.variables ?? []).map(v => [v.name, v.value]));
    // The recorder couldn't read this frame's variables (see `!unreadable` in record.ts): nothing to compare.
    if (Object.keys(e.locals ?? {}).some(name => name.startsWith('!'))) return;
    for (const [name, rep] of Object.entries(e.locals ?? {})) {
      if (rep === '<module>' || HIDDEN_CLASS_NAMES.has(name)) continue;
      const v = shown.get(name);
      if (!v) { missing.add(`${top.name}.${name}`); continue; }
      const d = compareValue(rep, v);
      if (d) valueDiffs.push(`step ${i} ${top.name}.${name}: ${d}`);
    }
    for (const [name, v] of shown) {
      if (name === 'return ↵' || name.startsWith('→') || name in (e.locals ?? {})) continue;
      const h = v.type === 'ref' ? s.heap.find(x => x.id === v.heapId) : null;
      if (h && /module/.test(h.objectType)) continue;
      if (importedNames.has(name)) continue;
      extra.add(`${top.name}.${name}`);
    }
    if (e.event === 'return' && e.value !== undefined && top.name !== '<module>') {
      const rv = shown.get('return ↵');
      if (!rv) returnDiffs.push(`step ${i} ${top.name}: no return ↵ (returns ${e.value})`);
      else {
        const d = compareValue(e.value, rv);
        if (d) returnDiffs.push(`step ${i} ${top.name} return: ${d}`);
      }
    }
  });
  const covered = limited ? j : events.length;
  const skipped: GoldenEvent[] = [];
  for (let k = 0; k < covered; k++) {
    const e = events[k];
    if (!matched[k] && e.event === 'line' && !compLines.has(e.line) && !e.stack.includes('<genexpr>')) skipped.push(e);
  }
  if (misaligned) out.steps.push(`${misaligned} step(s) match no CPython event in order, first: ${firstMisaligned.join('; ')}`);
  if (skipped.length) {
    const lines = [...new Set(skipped.map(e => e.line))];
    out.steps.push(`${skipped.length} CPython line event(s) have no step, lines ${lines.slice(0, 12).join(', ')}${lines.length > 12 ? ', …' : ''}`);
  }
  if (missing.size) out.variables.push(`not shown: ${[...missing].slice(0, 8).join(', ')}`);
  if (extra.size) out.variables.push(`shown but not in CPython's frame: ${[...extra].slice(0, 8).join(', ')}`);
  if (valueDiffs.length) out.values.push(`${valueDiffs.length} value(s), first: ${valueDiffs.slice(0, 3).join(' ; ')}`);
  if (returnDiffs.length) out.values.push(...returnDiffs.slice(0, 3));
  return out;
}

function checkFinalState(golden: PyGolden, reply: WorkerMessage): string[] {
  if (golden.compileError || reply.type !== 'result' || reply.error) return [];
  const last = reply.snapshots[reply.snapshots.length - 1];
  if (!last) return ['no steps'];
  const shown = new Map((last.callStack[0]?.variables ?? []).map(v => [v.name, v.value]));
  const problems: string[] = [];
  for (const [name, rep] of Object.entries(golden.finalGlobals)) {
    if (rep === '<module>') continue;
    const v = shown.get(name);
    if (!v) { problems.push(`${name} isn't shown in the module frame`); continue; }
    const d = compareValue(rep, v);
    if (d) problems.push(`${name}: ${d}`);
    if (problems.length >= MAX_PROBLEMS) break;
  }
  return problems;
}

// ── Snapshot invariants ──

/** Every value in a snapshot, with where it is. */
function* valuesOf(s: ExecutionSnapshot): Generator<[string, RuntimeValue]> {
  for (const f of s.callStack) {
    for (const v of f.variables ?? []) yield [`${f.name}.${v.name}`, v.value];
    if (f.thisArg) yield [`${f.name}.this`, f.thisArg];
  }
  for (const h of s.heap) {
    for (const p of h.properties ?? []) {
      yield [`heap ${h.id}.${p.key}`, p.value];
      if (p.keyValue) yield [`heap ${h.id} key ${p.key}`, p.keyValue];
    }
  }
}

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

/** Names PyTutor shows that aren't the program's own, on purpose. */
const SHOWN_NAMES = (name: string) => name === 'return ↵' || name.startsWith('→') || name === '__comp_result__';

function checkNames(c: PyCase, reply: WorkerMessage): { problems: string[]; internal: boolean } {
  const words = new Set(c.source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  const problems: string[] = [];
  let internal = false;
  const message = reply.type === 'error' ? reply.message : reply.error?.message;
  if (message && INTERNAL_TEXT.test(message)) {
    internal = true;
    problems.push(`the error shows the engine's internals: ${quote(message)}`);
  }
  if (reply.type === 'result') {
    problems.push(...firstViolations(reply.snapshots, s => {
      const found: string[] = [];
      for (const f of s.callStack) {
        for (const v of f.variables ?? []) {
          if (!SHOWN_NAMES(v.name) && !words.has(v.name)) found.push(`variable ${f.name}.${v.name} isn't the program's`);
        }
      }
      return found;
    }));
  }
  return { problems: problems.slice(0, MAX_PROBLEMS), internal };
}

function checkReachable(snapshots: ExecutionSnapshot[]): string[] {
  return firstViolations(snapshots, s => {
    const edges = new Map<string, string[]>();
    for (const h of s.heap) {
      const out: string[] = [];
      for (const p of h.properties ?? []) {
        if (p.value.type === 'ref') out.push(p.value.heapId);
        if (p.keyValue?.type === 'ref') out.push(p.keyValue.heapId);
      }
      edges.set(h.id, out);
    }
    const stack: string[] = [];
    for (const f of s.callStack) {
      for (const v of f.variables ?? []) if (v.value.type === 'ref') stack.push(v.value.heapId);
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

// ── All checks ──

export function checkCase(c: PyCase, golden: PyGolden, outcome: RunOutcome): CaseResult {
  const { reply } = outcome;
  const snapshots = reply.type === 'result' ? reply.snapshots : [];
  const ending = checkEnding(golden, outcome);
  const steps = compareSteps(c, golden, reply);
  const names = checkNames(c, reply);
  const checks: Record<CheckName, string[]> = {
    output: checkOutput(golden, outcome),
    ending: ending.problems,
    traceback: checkTraceback(golden, reply),
    steps: steps.steps,
    variables: steps.variables,
    values: steps.values,
    'final-state': checkFinalState(golden, reply),
    refs: checkRefs(snapshots),
    lines: checkLines(snapshots, c.source.split('\n').length),
    names: names.problems,
    reachable: checkReachable(snapshots),
  };
  return { checks, verdict: verdictOf(c, checks, ending.kind, names.internal) };
}

function verdictOf(c: PyCase, checks: Record<CheckName, string[]>, ending: EndingKind, internal: boolean): Verdict {
  const fails = (n: CheckName) => checks[n].length > 0;
  if (c.category === SYNTAX_ERRORS_CATEGORY) return fails('ending') ? 'compile' : 'match';
  if (ending === 'stopped') return 'error';
  if (fails('output') || ending === 'missing') return 'wrong-output';
  if (ending === 'extra' || internal) return 'error';
  if (CHECKS.some(fails)) return 'wrong-state';
  return 'match';
}

// ── Known failures ──

export interface KnownFailure {
  /** The roadmap issues (#28) the failure waits on, main one first. */
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
