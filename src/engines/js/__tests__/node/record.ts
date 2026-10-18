/**
 * Records what Node does with a program: the golden of a corpus case (#42).
 *
 * The program runs as a classic script in a fresh `vm` context, as a browser
 * runs a worker's script, with the globals a worker has (timers, `self`,
 * `structuredClone`, …). Browsers keep running timers and promise callbacks
 * after an uncaught exception, and so does the recording: it waits until no
 * timer is pending (at most DRAIN_MS), reporting each uncaught exception and
 * unhandled rejection as it goes.
 *
 * Run it in a process of its own (scripts/js-golden.ts does): it listens to
 * the process's unhandled rejections, and V8's coverage is per process.
 */
import { Console } from 'node:console';
import inspector from 'node:inspector';
import { Writable } from 'node:stream';
import vm from 'node:vm';
import * as acorn from 'acorn';
import { canon } from './canon';
import { STRUCTURED_CLONE_SOURCE } from './realm';
import type { GoldenLine, GoldenUncaught, NodeGolden } from './corpus';

/** The synchronous code is endless if it is still running after this long. */
const ENDLESS_MS = 5000;
/** How long to wait for the program's timers. */
const DRAIN_MS = 3000;
const SCRIPT_URL = 'file:///main.js';
/** Work counts are kept up to this: they only tell whether the step cap is expected, and past it they vary between runs (stack depth). */
export const MAX_COUNTED = 10_000;

const CONSOLE_METHODS = [
  'log', 'info', 'debug', 'warn', 'error', 'trace', 'dir', 'dirxml', 'table',
  'group', 'groupCollapsed', 'groupEnd', 'count', 'countReset', 'assert', 'time', 'timeEnd', 'timeLog',
] as const;

type AnyNode = acorn.Node & Record<string, unknown>;

/** The thrown value as the golden records it: an Error by its name and message, anything else by String(). */
function describeThrown(e: unknown): { name: string | null; message: string } {
  if (Object.prototype.toString.call(e) === '[object Error]') {
    const err = e as Error;
    return { name: String(err.name), message: String(err.message) };
  }
  try {
    return { name: null, message: typeof e === 'symbol' ? e.toString() : String(e) };
  } catch {
    return { name: null, message: Object.prototype.toString.call(e) };
  }
}

/** A SyntaxError's line and column, from the stack V8 gives it (`file:///main.js:7`, then the line and a caret). */
function syntaxErrorPosition(e: Error): { line: number | null; column: number | null } {
  const stack = String(e.stack ?? '');
  const m = /main\.js:(\d+)\n([^\n]*)\n( *)\^/.exec(stack);
  if (m) return { line: Number(m[1]), column: m[3].length };
  const l = /main\.js:(\d+)/.exec(stack);
  return { line: l ? Number(l[1]) : null, column: null };
}

/** The names a program declares at its top level (var, let, const, function, class), in order. */
export function topLevelNames(source: string): string[] {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' }) as unknown as { body: AnyNode[] };
  const names: string[] = [];
  const collect = (p: AnyNode | null): void => {
    if (!p) return;
    if (p.type === 'Identifier') names.push(p.name as string);
    else if (p.type === 'ObjectPattern') (p.properties as AnyNode[]).forEach(q => collect((q.value ?? q.argument) as AnyNode));
    else if (p.type === 'ArrayPattern') (p.elements as (AnyNode | null)[]).forEach(collect);
    else if (p.type === 'RestElement') collect(p.argument as AnyNode);
    else if (p.type === 'AssignmentPattern') collect(p.left as AnyNode);
  };
  for (const s of ast.body) {
    if (s.type === 'VariableDeclaration') for (const d of s.declarations as AnyNode[]) collect(d.id as AnyNode);
    if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) names.push((s.id as AnyNode).name as string);
  }
  return [...new Set(names)];
}

/**
 * The statements a step is expected before, as JSTutor takes steps (#24): every
 * statement but blocks, function and class declarations, labels and `try`
 * (which only lead to the statements in them), and a for loop's declaration.
 * A do-while is at its `while` line.
 */
export function stepStatements(source: string): { start: number; line: number }[] {
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  const out: { start: number; line: number }[] = [];
  const skip = new Set(['BlockStatement', 'EmptyStatement', 'FunctionDeclaration', 'ClassDeclaration', 'LabeledStatement', 'TryStatement', 'StaticBlock']);
  const visit = (n: AnyNode | null | undefined, parent: AnyNode | null): void => {
    if (!n || typeof n.type !== 'string') return;
    const leaf = /Statement$|Declaration$/.test(n.type) && !skip.has(n.type)
      && !(n.type === 'VariableDeclaration' && parent && /^For/.test(parent.type));
    if (leaf) {
      const loc = n.type === 'DoWhileStatement' ? (n.test as AnyNode).loc! : n.loc!;
      out.push({ start: n.start, line: loc.start.line });
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === 'loc') continue;
      if (Array.isArray(v)) v.forEach(c => visit(c as AnyNode, n));
      else if (v && typeof (v as AnyNode).type === 'string') visit(v as AnyNode, n);
    }
  };
  visit(ast as unknown as AnyNode, null);
  return out;
}

interface CoverageRange { startOffset: number; endOffset: number; count: number }
interface CoverageFunction { functionName: string; ranges: CoverageRange[] }

export async function recordGolden(source: string): Promise<Omit<NodeGolden, 'sourceSha256'>> {
  const lines: GoldenLine[] = [];
  const calls: NodeGolden['calls'] = [];
  const uncaught: GoldenUncaught[] = [];
  const report = (e: unknown, where: GoldenUncaught['where']) => {
    uncaught.push({ ...describeThrown(e), where, consoleLines: lines.length });
  };

  // Node's own console, writing to memory: what it prints is the golden's text.
  // (Each write completes at once, so stdout and stderr lines keep the order they were written in.)
  const sink = (stream: GoldenLine['stream']) => new Writable({
    write(chunk: Buffer, _encoding, done) {
      for (const text of chunk.toString('utf8').replace(/\n$/, '').split('\n')) lines.push({ stream, text });
      done();
    },
  });
  const nodeConsole = new Console({
    stdout: sink('stdout'),
    stderr: sink('stderr'),
    colorMode: false,
    groupIndentation: 2,
  }) as unknown as Record<string, (...args: unknown[]) => void>;
  const programConsole: Record<string, (...args: unknown[]) => void> = {};
  for (const m of CONSOLE_METHODS) {
    programConsole[m] = (...args: unknown[]) => {
      calls.push({ method: m, args: args.map(a => canon(a)) });
      nodeConsole[m](...args);
    };
  }

  // Timers as a worker has them (numeric ids), tracked so we know when the program is done.
  const pending = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;
  const guarded = (fn: unknown, args: unknown[]) => {
    try {
      if (typeof fn === 'function') fn(...args);
    } catch (e) {
      report(e, 'timer');
    }
  };
  const globals = {
    console: programConsole,
    setTimeout: (fn: unknown, ms?: number, ...args: unknown[]) => {
      const id = nextId++;
      pending.set(id, setTimeout(() => { pending.delete(id); guarded(fn, args); }, ms));
      return id;
    },
    clearTimeout: (id: number) => { clearTimeout(pending.get(id)); pending.delete(id); },
    setInterval: (fn: unknown, ms?: number, ...args: unknown[]) => {
      const id = nextId++;
      pending.set(id, setInterval(() => guarded(fn, args), ms));
      return id;
    },
    clearInterval: (id: number) => { clearInterval(pending.get(id)); pending.delete(id); },
    queueMicrotask: (fn: unknown) => queueMicrotask(() => guarded(fn, [])),
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    atob,
    btoa,
  };
  const onRejection = (e: unknown) => report(e, 'promise');
  process.on('unhandledRejection', onRejection);

  const session = new inspector.Session();
  session.connect();
  const post = <T>(method: string, params?: object) =>
    new Promise<T>((resolve, reject) => session.post(method, params, (e, r) => (e ? reject(e) : resolve(r as T))));
  await post('Profiler.enable');
  await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });

  const base = {
    console: lines, calls, uncaught, endless: false, pendingTimers: false,
    compileError: null, executedLines: [], statementRuns: 0, functionCalls: 0, finalGlobals: {},
  };

  let script: vm.Script;
  try {
    script = new vm.Script(source, { filename: SCRIPT_URL });
  } catch (e) {
    session.disconnect();
    process.off('unhandledRejection', onRejection);
    const err = e as Error;
    return { ...base, compileError: { message: err.message, ...syntaxErrorPosition(err) } };
  }

  const ctx = vm.createContext({ ...globals });
  vm.runInContext('globalThis.self = globalThis;', ctx);
  vm.runInContext(STRUCTURED_CLONE_SOURCE, ctx);
  let endless = false;
  try {
    script.runInContext(ctx, { timeout: ENDLESS_MS });
  } catch (e) {
    if ((e as { code?: string })?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') endless = true;
    else report(e, 'script');
  }

  // Wait for the program's timers and promise callbacks (an endless loop never lets them run).
  if (!endless) {
    const end = Date.now() + DRAIN_MS;
    while (Date.now() < end) {
      await new Promise(r => setTimeout(r, 5));
      if (pending.size === 0) {
        await new Promise(r => setTimeout(r, 20));
        if (pending.size === 0) break;
      }
    }
  }
  const pendingTimers = !endless && pending.size > 0;
  for (const t of pending.values()) { clearTimeout(t); clearInterval(t); }

  const coverage = await post<{ result: { url: string; functions: CoverageFunction[] }[] }>('Profiler.takePreciseCoverage');
  session.disconnect();
  process.off('unhandledRejection', onRejection);
  const functions = coverage.result.find(s => s.url === SCRIPT_URL)?.functions ?? [];
  const ranges = functions.flatMap(f => f.ranges);

  // A statement ran if the innermost coverage range around its start has a count.
  const executed = new Set<number>();
  let statementRuns = 0;
  for (const s of stepStatements(source)) {
    let best: CoverageRange | null = null;
    for (const r of ranges) {
      if (r.startOffset <= s.start && s.start < r.endOffset && (!best || r.endOffset - r.startOffset <= best.endOffset - best.startOffset)) best = r;
    }
    if (best && best.count > 0) { executed.add(s.line); statementRuns += best.count; }
  }
  // Each function's first range is the whole function, counted once per call (the script itself starts at 0).
  const functionCalls = functions
    .filter(f => f.ranges[0] && f.ranges[0].startOffset > 0)
    .reduce((n, f) => n + f.ranges[0].count, 0);

  const finalGlobals: Record<string, ReturnType<typeof canon>> = {};
  for (const name of topLevelNames(source)) {
    try {
      finalGlobals[name] = canon(vm.runInContext(name, ctx, { timeout: 1000 }));
    } catch {
      finalGlobals[name] = '<uninitialized>';
    }
  }

  return {
    ...base,
    endless,
    pendingTimers,
    executedLines: [...executed].sort((a, b) => a - b),
    statementRuns: Math.min(statementRuns, MAX_COUNTED),
    functionCalls: Math.min(functionCalls, MAX_COUNTED),
    finalGlobals,
  };
}
