// Compares PyTutor's runs with CPython's: output, exceptions, invariants, and steps/state against the reference trace.
// Usage: node py-analyze.mjs                 summary + per-tag case lists (writes results/py-report.json)
//        node py-analyze.mjs --case <id>     side-by-side steps of one case
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const resDir = join(here, 'results', 'py');
const casesDir = join(here, 'py', 'cases');
const MAX_STEPS = 5000;
const WORKER_KILL_MS = 10000;

// ---- Python repr of what PyTutor shows, and the raw value of a Python repr ----
function unrepr(s) {
  const m = /^([rbu]*)(['"])([\s\S]*)\2$/.exec(s);
  if (!m || m[1]) return null;
  return m[3].replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_, c) => {
    if (c[0] === 'x' || c[0] === 'u' || c[0] === 'U') return c.length > 1 ? String.fromCodePoint(parseInt(c.slice(1), 16)) : c;
    return { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', f: '\f', v: '\v', 0: '\0' }[c] ?? '\\' + c;
  });
}
function shownRepr(v) {
  if (!v || typeof v !== 'object') return String(v);
  switch (v.type) {
    case 'null': return 'None';
    case 'boolean': return v.value ? 'True' : 'False';
    case 'number':
      if (v.value === 'Infinity') return 'inf';
      if (v.value === '-Infinity') return '-inf';
      if (v.value === 'NaN') return 'nan';
      return String(v.value);
    case 'string': return { str: v.value };
    case 'ref': return { ref: v.heapId };
    default: return JSON.stringify(v);
  }
}
// null when equal, else a short description
function compareValue(refRepr, shown, heap) {
  if (refRepr.endsWith('…')) return null;
  const s = shownRepr(shown);
  if (refRepr.startsWith('<') && refRepr.endsWith('>')) {
    if (typeof s === 'object' && s.ref) return null;
    return `${refRepr} shown as ${JSON.stringify(shown)}`;
  }
  const raw = unrepr(refRepr);
  if (raw !== null) {
    if (typeof s === 'object' && 'str' in s && s.str === raw) return null;
    return `${refRepr} shown as ${JSON.stringify(shown)}`;
  }
  if (typeof s === 'object') return `${refRepr} shown as ${JSON.stringify(shown)}`;
  if (s === refRepr) return null;
  return `${refRepr} shown as ${s}`;
}

// ---- invariants on one snapshot ----
function invariants(snap, nLines, sourceWords) {
  const out = [];
  const ids = new Set(snap.heap.map(h => h.id));
  const refsIn = v => (v && v.type === 'ref' ? [v.heapId] : []);
  const edges = new Map(snap.heap.map(h => [h.id, (h.properties ?? []).flatMap(p => [...refsIn(p.value), ...refsIn(p.keyValue ?? null)])]));
  const roots = [];
  for (const f of snap.callStack) {
    for (const v of f.variables ?? []) {
      for (const r of refsIn(v.value)) { roots.push(r); if (!ids.has(r)) out.push(`dangling-ref: ${f.name}.${v.name} -> ${r}`); }
      if (v.name !== 'return ↵' && !v.name.startsWith('→') && v.name !== '__comp_result__' && !sourceWords.has(v.name)) out.push(`leaked-name: ${f.name}.${v.name}`);
    }
  }
  for (const [id, es] of edges) for (const r of es) if (!ids.has(r)) out.push(`dangling-ref: heap ${id} -> ${r}`);
  const seen = new Set(); const stack = [...roots];
  while (stack.length) { const id = stack.pop(); if (seen.has(id)) continue; seen.add(id); stack.push(...(edges.get(id) ?? [])); }
  for (const h of snap.heap) if (!seen.has(h.id)) out.push(`unreachable-heap: ${h.objectType} ${h.label ?? ''} #${h.id}`.trim());
  if (!(snap.line >= 1 && snap.line <= nLines)) out.push(`bad-line: ${snap.line}`);
  return out;
}

function load(id, mode) {
  const f = join(resDir, `${id.replace('/', '__')}.${mode}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

const INTERNAL = /run_traced|<user_code>|_tutor|tracer|pyodide|JsException|File "<exec>"|Traceback \(most recent call last\):\s*$/;

function analyze(id) {
  const src = readFileSync(join(casesDir, id + '.py'), 'utf8');
  const nLines = src.split('\n').length;
  const importedNames = new Set([...src.matchAll(/^\s*import\s+([\w., ]+)$/gm)].flatMap(m => m[1].split(',').map(x => x.trim().split(/\s+as\s+/).pop().split('.')[0])));
  const sourceWords = new Set(src.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  const g = load(id, 'golden');
  const t = load(id, 'traced');
  const tags = [];
  const notes = [];
  const r = { id, category: id.split('/')[0], tags, notes };
  if (!g || !t) { tags.push('not-run'); return r; }

  const goldenEndless = !!g.timeout;
  if (t.timeout || t.crashed || (t.ms ?? 0) > WORKER_KILL_MS) {
    tags.push(goldenEndless ? 'worker-kill-endless' : 'worker-kill');
    notes.push(`PyTutor ran ${t.timeout ? 'past the harness timeout' : t.ms + ' ms'}: the browser worker is killed at 10 s and every step is lost`);
    r.group = 'error';
    return r;
  }
  const reply = t.reply;
  r.bytes = t.replyBytes;
  if (t.lostStdout) { tags.push('lost-stdout'); notes.push(`written to sys.stdout directly, never shown: ${JSON.stringify(t.lostStdout.slice(0, 120))}`); }

  // ---- programs CPython rejects ----
  if (g.compileError) {
    if (reply.type !== 'error') { tags.push('compile-not-detected'); r.group = 'wrong-output'; return r; }
    const want = `${g.compileError.class}: ${g.compileError.msg}`;
    if (reply.message !== want) { tags.push('compile-message'); notes.push(`CPython: ${want} | PyTutor: ${reply.message}`); }
    if (reply.line !== g.compileError.line) { tags.push('compile-line'); notes.push(`CPython line ${g.compileError.line}, PyTutor line ${reply.line}`); }
    r.group = tags.some(x => x.startsWith('compile-')) ? 'compile-differs' : 'match';
    return r;
  }
  if (reply.type === 'error') {
    tags.push('pre-run-error'); notes.push(reply.message.slice(0, 300)); r.group = 'error'; return r;
  }

  const snaps = reply.snapshots;
  r.steps = snaps.length;
  const err = reply.error;
  const last = snaps[snaps.length - 1];
  const shownOut = last ? last.stdout.join('\n') : '';
  const wantOut = (g.stdout ?? '').replace(/\n$/, '');
  const limited = err?.kind === 'limit';
  const refSteps = (g.events ?? []).filter(e => e.event !== 'exception' && !(e.event === 'call' && e.line === 0)).length;

  if (limited) {
    const expected = goldenEndless || g.truncated || refSteps >= MAX_STEPS * 0.9;
    tags.push(expected ? 'limit-expected' : 'limit-unexpected');
    if (!expected) notes.push(`stopped at the step cap after ${snaps.length} steps; CPython's trace has ${refSteps} events`);
    if (!wantOut.startsWith(shownOut) && !(goldenEndless)) { tags.push('stdout'); notes.push(`output so far isn't a prefix of CPython's`); }
  } else if (goldenEndless) {
    tags.push('endless-not-stopped');
  } else {
    if (shownOut !== wantOut) {
      tags.push('stdout');
      const a = wantOut.split('\n'), b = shownOut.split('\n');
      let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
      notes.push(`stdout differs at line ${i + 1}: CPython ${JSON.stringify(a[i] ?? '<end>')} | PyTutor ${JSON.stringify(b[i] ?? '<end>')}`);
      if (g.stderr && g.stderr.trim() && shownOut.includes(g.stderr.trim().split('\n')[0])) tags.push('stderr-as-stdout');
    }
    const gExc = g.exception ? `${g.exception.class}${g.exception.message ? ': ' + g.exception.message : ''}` : null;
    if (gExc && err?.kind !== 'exception') { tags.push('exception-missing'); notes.push(`CPython: ${gExc}; PyTutor: ${err ? err.kind + ' ' + err.message : 'no error'}`); }
    else if (!gExc && err) { tags.push('exception-extra'); notes.push(`PyTutor: ${err.kind}: ${err.message}`); }
    else if (gExc && err && err.message !== gExc) { tags.push('exception-message'); notes.push(`CPython: ${gExc} | PyTutor: ${err.message}`); }
    if (gExc && err?.stderr && g.traceback) {
      const norm = s => s.replace(/\r/g, '').trim().split('\n').filter(l => !/^\s*\^+\s*$|^\s*~+\^*~*\s*$/.test(l)).join('\n');
      if (norm(err.stderr) !== norm(g.traceback)) { tags.push('traceback'); r.traceback = { cpython: g.traceback, pytutor: err.stderr }; }
    }
  }
  if (err?.message && INTERNAL.test(err.message)) { tags.push('internal-text'); notes.push(err.message.slice(0, 200)); }

  // ---- invariants ----
  const inv = new Map();
  snaps.forEach((s, i) => { for (const x of invariants(s, nLines, sourceWords)) { const k = x.split(':')[0]; if (!inv.has(k)) inv.set(k, `step ${i}: ${x}`); } });
  for (const [k, ex] of inv) { tags.push(k); notes.push(ex); }

  // ---- steps and state against the reference trace ----
  const events = (g.events ?? []).filter(e => !(e.event === 'call' && e.line === 0));
  let j = 0; let misaligned = 0; const firstMis = []; const matched = new Array(events.length).fill(false);
  const valueDiffs = []; const missingVars = new Set(); const extraVars = new Set(); const returnDiffs = [];
  // PyTutor draws a synthetic frame for a comprehension (3.12 inlines them, pythontutor.com showed <listcomp>): a deliberate rule
  const compLines = new Set(g.continuation ?? []);
  const HIDDEN_CLASS_NAMES = new Set(['__classcell__', '__class__', '__module__', '__qualname__', '__doc__', '__firstlineno__', '__static_attributes__', '__annotations__']);
  // an endless program has no reference trace (CPython never finished it): only the cap stopping it is checked
  (goldenEndless ? [] : snaps).forEach((s, i) => {
    const names = s.callStack.map(f => f.name).filter(n => !/ comprehension$|^generator expression$/.test(n));
    if (names.length !== s.callStack.length) { compLines.add(s.line); if (/ comprehension$|^generator expression$/.test(s.callStack[s.callStack.length - 1].name)) return; }
    let found = -1;
    for (let k = j; k < Math.min(events.length, j + 60); k++) {
      const e = events[k];
      if (e.event === 'exception') continue;
      const es = e.stack.filter(n => !/^<(genexpr|listcomp|dictcomp|setcomp)>$/.test(n));
      if (e.line === s.line && es.length === names.length && es.every((n, q) => n === names[q])) { found = k; break; }
    }
    if (found < 0) { misaligned++; if (firstMis.length < 3) firstMis.push(`step ${i} line ${s.line} [${names.join('>')}]`); return; }
    matched[found] = true; j = found + 1;
    const e = events[found];
    const top = s.callStack[s.callStack.length - 1];
    const shownVars = new Map((top.variables ?? []).map(v => [v.name, v.value]));
    for (const [name, rep] of Object.entries(e.locals ?? {})) {
      if (rep === '<module>' || HIDDEN_CLASS_NAMES.has(name)) continue;
      if (!shownVars.has(name)) { missingVars.add(`${top.name}.${name}`); continue; }
      const d = compareValue(rep, shownVars.get(name), s.heap);
      if (d) valueDiffs.push(`step ${i} ${top.name}.${name}: ${d}`);
    }
    for (const [name, v] of shownVars) {
      if (name === 'return ↵' || name.startsWith('→') || name in (e.locals ?? {})) continue;
      const h = v.type === 'ref' ? s.heap.find(x => x.id === v.heapId) : null;
      if (h && /module/.test(h.objectType)) continue;
      if (importedNames.has(name)) continue;
      extraVars.add(`${top.name}.${name}`);
    }
    if (e.event === 'return' && 'value' in e && top.name !== '<module>') {
      const rv = shownVars.get('return ↵');
      if (!rv) returnDiffs.push(`step ${i} ${top.name}: no return ↵ (returns ${e.value})`);
      else { const d = compareValue(e.value, rv, s.heap); if (d) returnDiffs.push(`step ${i} ${top.name} return: ${d}`); }
    }
  });
  const covered = goldenEndless ? 0 : limited ? j : events.length;
  const skipped = [];
  for (let k = 0; k < covered; k++) if (!matched[k] && events[k].event === 'line' && !compLines.has(events[k].line) && !events[k].stack.some(n => /^<genexpr>$/.test(n))) skipped.push(events[k]);
  if (misaligned) { tags.push('steps-not-in-cpython'); notes.push(`${misaligned} step(s) match no CPython event in order, first: ${firstMis.join('; ')}`); }
  if (skipped.length) {
    tags.push('skipped-lines');
    const lines = [...new Set(skipped.map(e => e.line))];
    notes.push(`${skipped.length} CPython line event(s) have no step, lines ${lines.slice(0, 12).join(', ')}${lines.length > 12 ? '…' : ''}`);
  }
  if (valueDiffs.length) { tags.push('value-shown-wrong'); notes.push(`${valueDiffs.length} value(s), first: ${valueDiffs.slice(0, 3).join(' ; ')}`); }
  if (missingVars.size) { tags.push('missing-variable'); notes.push(`not shown: ${[...missingVars].slice(0, 6).join(', ')}`); }
  if (extraVars.size) { tags.push('extra-variable'); notes.push(`shown but not in CPython's frame: ${[...extraVars].slice(0, 6).join(', ')}`); }
  if (returnDiffs.length) { tags.push('return-value'); notes.push(returnDiffs.slice(0, 3).join(' ; ')); }

  // final state: module globals vs the last step's module frame
  if (!err && last) {
    const mod = last.callStack[0];
    const shown = new Map((mod.variables ?? []).map(v => [v.name, v.value]));
    const diffs = [];
    for (const [name, rep] of Object.entries(g.finalGlobals ?? {})) {
      if (rep === '<module>') continue;
      if (!shown.has(name)) diffs.push(`${name} missing`);
      else { const d = compareValue(rep, shown.get(name), last.heap); if (d) diffs.push(`${name}: ${d}`); }
    }
    if (diffs.length) { tags.push('final-state'); notes.push(`final globals: ${diffs.slice(0, 4).join('; ')}`); }
  }

  const wrongOutput = ['stdout', 'exception-missing', 'compile-not-detected', 'endless-not-stopped'].some(x => tags.includes(x));
  const errorish = ['exception-extra', 'internal-text', 'pre-run-error', 'limit-unexpected'].some(x => tags.includes(x));
  const stateTags = ['steps-not-in-cpython', 'skipped-lines', 'value-shown-wrong', 'missing-variable', 'extra-variable', 'return-value', 'final-state',
    'dangling-ref', 'leaked-name', 'unreachable-heap', 'bad-line', 'traceback', 'exception-message', 'lost-stdout'];
  r.group = wrongOutput ? 'wrong-output' : errorish ? 'error' : tags.some(x => stateTags.includes(x)) ? 'wrong-state' : 'match';
  return r;
}

function ids() {
  const out = [];
  for (const cat of readdirSync(casesDir)) for (const f of readdirSync(join(casesDir, cat))) if (f.endsWith('.py')) out.push(`${cat}/${f.slice(0, -3)}`);
  return out.sort();
}

const caseArg = process.argv.indexOf('--case');
if (caseArg > 0) {
  const id = process.argv[caseArg + 1];
  const r = analyze(id);
  console.log(JSON.stringify({ ...r }, null, 1));
  const g = load(id, 'golden'); const t = load(id, 'traced');
  if (process.argv.includes('--steps') && t?.reply?.snapshots) {
    const ev = (g.events ?? []).filter(e => !(e.event === 'call' && e.line === 0));
    console.log('--- CPython events');
    for (const e of ev.slice(0, 80)) console.log(`${e.event.padEnd(9)} ${String(e.line).padStart(3)} ${e.stack.join('>')}  ${JSON.stringify(e.locals)}${'value' in e ? ' -> ' + e.value : ''}`);
    console.log('--- PyTutor steps');
    for (const [i, s] of t.reply.snapshots.slice(0, 80).entries()) {
      const top = s.callStack[s.callStack.length - 1];
      console.log(`${String(i).padStart(4)} ${String(s.line).padStart(3)} ${s.callStack.map(f => f.name).join('>')}  ${top.variables.map(v => v.name + '=' + JSON.stringify(shownRepr(v.value))).join(' ')}`);
    }
  }
  process.exit(0);
}

const all = ids().map(analyze);
const groups = ['match', 'wrong-output', 'wrong-state', 'error', 'compile-differs'];
const cats = [...new Set(all.map(r => r.category))];
console.log('category'.padEnd(18) + groups.map(g => g.padStart(16)).join('') + '   total');
for (const c of [...cats, 'ALL']) {
  const rs = all.filter(r => c === 'ALL' || r.category === c);
  console.log(c.padEnd(18) + groups.map(g => String(rs.filter(r => r.group === g).length).padStart(16)).join('') + String(rs.length).padStart(8));
}
const tagCount = new Map();
for (const r of all) for (const tg of r.tags) tagCount.set(tg, [...(tagCount.get(tg) ?? []), r.id]);
console.log('\nTags:');
for (const [tg, list] of [...tagCount].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${tg.padEnd(24)} ${String(list.length).padStart(4)}  ${list.slice(0, 6).join(', ')}${list.length > 6 ? ', …' : ''}`);
const sizes = all.filter(r => r.bytes).sort((a, b) => b.bytes - a.bytes).slice(0, 8);
console.log('\nLargest replies:', sizes.map(r => `${r.id} ${(r.bytes / 1e6).toFixed(1)} MB/${r.steps} steps`).join('; '));
writeFileSync(join(here, 'results', 'py-report.json'), JSON.stringify(all, null, 1));
