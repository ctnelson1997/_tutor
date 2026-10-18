// One JS corpus case, in one of two modes (each in its own process):
//   node js-case.mjs golden <file.js> <out.json>   Node runs the program as a classic script, timers drained,
//                                                 with block coverage (which statements ran) and the final globals.
//   node js-case.mjs traced <file.js> <out.json>   JSTutor instruments and runs it exactly as its Web Worker does:
//                                                 the reply is taken as soon as the synchronous code ends.
import vm from 'node:vm';
import util from 'node:util';
import v8 from 'node:v8';
import inspector from 'node:inspector';
import { readFileSync, writeFileSync } from 'node:fs';
import { instrument, getRuntimeCode, parse } from './jstutor.mjs';

const [mode, file, outFile] = process.argv.slice(2);
const source = readFileSync(file, 'utf8');
const started = Date.now();

// ---- a value as a canonical, type-tagged tree (what was logged, independent of formatting) ----
function canon(v, depth = 0, seen = new Set()) {
  const t = typeof v;
  if (v === null) return 'null';
  if (t === 'undefined') return 'undefined';
  if (t === 'number') return Object.is(v, -0) ? 'num:-0' : `num:${v}`;
  if (t === 'string') return `str:${v}`;
  if (t === 'boolean' || t === 'bigint') return `${t}:${v}`;
  if (t === 'symbol') return `sym:${v.description}`;
  if (seen.has(v)) return '<circular>';
  if (depth > 4) return '<deep>';
  seen = new Set(seen).add(v);
  if (t === 'function') return `fn:${v.name}`;
  let tag = '';
  try { tag = Object.prototype.toString.call(v).slice(8, -1); } catch { tag = '?'; }
  const ctor = (() => { try { return Object.getPrototypeOf(v)?.constructor?.name ?? 'null-proto'; } catch { return '?'; } })();
  if (Array.isArray(v)) {
    const items = [];
    for (let i = 0; i < v.length && i < 50; i++) items.push(i in v ? canon(v[i], depth + 1, seen) : '<hole>');
    return { array: items, len: v.length };
  }
  if (v instanceof Map || tag === 'Map') return { map: [...v].slice(0, 50).map(([k, x]) => [canon(k, depth + 1, seen), canon(x, depth + 1, seen)]) };
  if (v instanceof Set || tag === 'Set') return { set: [...v].slice(0, 50).map(x => canon(x, depth + 1, seen)) };
  if (tag === 'Error' || v instanceof Error) return { error: `${v.name}: ${v.message}` };
  if (tag === 'Date') return { date: String(v.getTime()) };
  if (tag === 'RegExp') return { regexp: String(v) };
  if (tag === 'Promise') return { promise: true };
  const props = {};
  for (const k of Reflect.ownKeys(v).slice(0, 50)) {
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (!d || !d.enumerable) continue;
    props[typeof k === 'symbol' ? `[${k.description}]` : k] = 'value' in d ? canon(d.value, depth + 1, seen) : '<accessor>';
  }
  return { object: ctor, props };
}

function recorderConsole(calls) {
  const rec = method => (...args) => { calls.push({ method, args: args.map(a => canon(a)), text: util.format(...args), at: Date.now() }); };
  const c = {};
  for (const m of ['log', 'warn', 'error', 'info', 'debug', 'table', 'dir', 'trace', 'group', 'groupEnd', 'groupCollapsed', 'count', 'countReset', 'assert', 'time', 'timeEnd', 'timeLog']) c[m] = rec(m);
  return c;
}

// Timers as a browser worker has them, tracked so we know when the program is done
function timerGlobals(onError) {
  const pending = new Set();
  const wrap = fn => function (...a) { try { return fn.apply(this, a); } catch (e) { onError(e); } };
  return {
    pending,
    globals: {
      setTimeout: (fn, ms, ...a) => { const h = setTimeout(() => { pending.delete(h); wrap(fn)(...a); }, ms); pending.add(h); return h; },
      clearTimeout: h => { pending.delete(h); clearTimeout(h); },
      setInterval: (fn, ms, ...a) => { const h = setInterval(() => wrap(fn)(...a), ms); pending.add(h); return h; },
      clearInterval: h => { pending.delete(h); clearInterval(h); },
      queueMicrotask: fn => queueMicrotask(wrap(fn)),
      structuredClone,
      TextEncoder, TextDecoder, URL, atob, btoa,
    },
  };
}

async function drain(pending, limitMs) {
  const end = Date.now() + limitMs;
  while (Date.now() < end) {
    await new Promise(r => setTimeout(r, 5));
    if (pending.size === 0) { await new Promise(r => setTimeout(r, 20)); if (pending.size === 0) return true; }
  }
  return false;
}

function errInfo(e) {
  if (e && typeof e === 'object' && 'message' in e) return { class: e.name ?? e.constructor?.name, message: e.message, thrown: 'error' };
  return { class: null, message: String(e), thrown: typeof e };
}

let result;
if (mode === 'golden') {
  const calls = [];
  const uncaught = [];
  const timers = timerGlobals(e => uncaught.push({ ...errInfo(e), where: 'timer' }));
  process.on('unhandledRejection', e => uncaught.push({ ...errInfo(e), where: 'promise' }));
  const ctx = vm.createContext({ console: recorderConsole(calls), ...timers.globals });
  vm.runInContext('globalThis.self = globalThis;', ctx);

  const session = new inspector.Session();
  session.connect();
  const post = (m, p) => new Promise((res, rej) => session.post(m, p, (e, r) => (e ? rej(e) : res(r))));
  await post('Profiler.enable');
  await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });

  let compileError = null;
  let script = null;
  try { script = new vm.Script(source, { filename: 'file:///main.js' }); }
  catch (e) {
    const m = /main\.js:(\d+)/.exec(e.stack ?? '');
    compileError = { class: e.name, message: e.message, line: m ? Number(m[1]) : null };
  }
  let syncError = null;
  if (script) {
    try { script.runInContext(ctx, { timeout: 15000 }); }
    catch (e) { syncError = errInfo(e); if (/Script execution timed out/.test(e.message)) syncError.timeout = true; }
  }
  const drained = script && !syncError?.timeout ? await drain(timers.pending, 3000) : true;
  const cov = await post('Profiler.takePreciseCoverage');
  const mine = cov.result.find(s => s.url.endsWith('main.js'));
  const ranges = mine ? mine.functions.flatMap(f => f.ranges) : [];

  // statements that ran: the innermost coverage range around each statement's start has a count
  const executedLines = new Set();
  const statementLines = new Set();
  let stmtExecutions = 0;
  if (!compileError) {
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });
    const visit = (n, parent) => {
      if (!n || typeof n.type !== 'string') return;
      const leaf = /Statement$|Declaration$/.test(n.type) && !['BlockStatement', 'EmptyStatement', 'FunctionDeclaration', 'ClassDeclaration', 'LabeledStatement', 'TryStatement'].includes(n.type)
        && !(n.type === 'VariableDeclaration' && parent && /^For/.test(parent.type));
      if (leaf) {
        // JSTutor steps at a do-while's `while` line (#24), not at `do {`
        const at = n.type === 'DoWhileStatement' ? n.test.loc.start.line : n.loc.start.line;
        statementLines.add(at);
        let best = null;
        for (const r of ranges) if (r.startOffset <= n.start && n.start < r.endOffset && (!best || r.endOffset - r.startOffset <= best.endOffset - best.startOffset)) best = r;
        if (best && best.count > 0) { executedLines.add(at); stmtExecutions += best.count; }
      }
      for (const [k, v] of Object.entries(n)) {
        if (k === 'loc') continue;
        if (Array.isArray(v)) v.forEach(c => visit(c, n)); else if (v && typeof v.type === 'string') visit(v, n);
      }
    };
    visit(ast, null);
  }

  // the final value of every top-level name
  const finalGlobals = {};
  if (!compileError) {
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    const names = [];
    for (const s of ast.body) {
      if (s.type === 'VariableDeclaration') for (const d of s.declarations) { const ids = []; const collect = p => { if (!p) return; if (p.type === 'Identifier') ids.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => collect(q.value ?? q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(collect); else if (p.type === 'RestElement') collect(p.argument); else if (p.type === 'AssignmentPattern') collect(p.left); }; collect(d.id); names.push(...ids); }
      if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) names.push(s.id.name);
    }
    for (const n of names) {
      try { finalGlobals[n] = canon(vm.runInContext(n, ctx)); } catch { finalGlobals[n] = '<uninitialized>'; }
    }
  }
  result = { mode, compileError, syncError, uncaught, drained, calls, executedLines: [...executedLines].sort((a, b) => a - b), statementLines: [...statementLines].sort((a, b) => a - b), stmtExecutions, finalGlobals };
} else {
  // ---- as src/engines/js/executor.ts: instrument, then run runtime + code in a fresh worker scope ----
  let code;
  let reply;
  try { code = getRuntimeCode() + '\n' + instrument(source); }
  catch (err) {
    reply = { type: 'error', message: `Parse error: ${err.message}`, line: err?.loc?.line };
  }
  const calls = [];
  const afterReply = [];
  let replied = false;
  const lateErrors = [];
  let killed = false;
  if (!reply) {
    const timers = timerGlobals(e => lateErrors.push({ ...errInfo(e), where: 'timer', afterReply: replied }));
    process.on('unhandledRejection', e => lateErrors.push({ ...errInfo(e), where: 'promise', afterReply: replied }));
    const consoleRec = recorderConsole(calls);
    const ctx = vm.createContext({ console: consoleRec, ...timers.globals });
    vm.runInContext('globalThis.self = globalThis;', ctx);
    try {
      vm.runInContext(code, ctx, { timeout: 10000 });
      reply = ctx.__runResult__();
    } catch (err) {
      if (/Script execution timed out/.test(err?.message ?? '')) { killed = true; reply = { type: 'error', message: 'Execution timed out after 10 seconds. Your code may contain an infinite loop.' }; }
      else if (typeof ctx.__runResult__ === 'function') reply = ctx.__runResult__(err);
      else reply = { type: 'error', message: err instanceof Error ? err.message : String(err) };
    }
    reply = JSON.parse(JSON.stringify(reply));
    replied = true;
    const before = calls.length;
    if (!killed) await drain(timers.pending, 3000);
    afterReply.push(...calls.splice(before));
  }
  const json = JSON.stringify(reply);
  let cloneBytes = null;
  try { cloneBytes = v8.serialize(reply).length; } catch { /* ignore */ }
  result = { mode, reply, calls, afterReply, lateErrors, killed, replyBytes: json.length, cloneBytes };
}
result.ms = Date.now() - started;
writeFileSync(outFile, JSON.stringify(result));
process.exit(0);
