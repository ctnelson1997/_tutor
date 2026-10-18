// Compares JSTutor's runs with Node's: console output (meaning and display), exceptions, lines that ran, invariants, final state.
// Usage: node js-analyze.mjs                 summary + per-tag case lists (writes results/js-report.json)
//        node js-analyze.mjs --case <id> [--steps]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const resDir = join(here, 'results', 'js');
const casesDir = join(here, 'js', 'cases');
const MAX_STEPS = 5000;

const load = (id, mode) => { const f = join(resDir, `${id.replace('/', '__')}.${mode}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// JSTutor's value (with its heap) as the golden's canonical tree, as far as the drawing can say
function shownCanon(v, heap, depth = 0, seen = new Set()) {
  if (!v) return '?';
  switch (v.type) {
    case 'number': return v.value === '-0' ? 'num:-0' : typeof v.value === 'string' ? `num:${v.value}` : `num:${v.value}`;
    case 'string': return `str:${v.value}`;
    case 'boolean': return `boolean:${v.value}`;
    case 'undefined': return 'undefined';
    case 'null': return 'null';
    case 'bigint': return `bigint:${v.value}`;
    case 'symbol': return `sym:${String(v.value).replace(/^Symbol\((.*)\)$/, '$1')}`;
    case 'ref': {
      const h = heap.find(x => x.id === v.heapId);
      if (!h) return '<dangling>';
      if (seen.has(h.id)) return '<circular>';
      if (depth > 4) return '<deep>';
      seen = new Set(seen).add(h.id);
      const props = h.properties ?? [];
      const val = p => shownCanon(p.value, heap, depth + 1, seen);
      switch (h.objectType) {
        case 'function': return `fn:${h.label ?? ''}`;
        case 'array': return { array: props.map(val), len: props.length };
        case 'map': return { map: props.map(p => [p.key, val(p)]) };
        case 'set': return { set: props.map(val) };
        default: return { object: h.label || h.objectType, props: Object.fromEntries(props.map(p => [p.key, val(p)])) };
      }
    }
    default: return JSON.stringify(v);
  }
}

// differences between a golden canonical value and the shown one; map keys compared without their type tags
function diffCanon(want, got, path, out) {
  if (out.length > 6) return;
  if (typeof want === 'string' || typeof got === 'string') {
    if (want === '<uninitialized>' || want === '<deep>' || got === '<deep>') return;
    // JSTutor draws an accessor as a <getter>/<setter> placeholder on purpose (CLAUDE.md): not a difference
    if (want === '<accessor>' && /^str:<(getter|setter|accessor)>$/.test(got)) return;
    if (want === got) return;
    if (typeof want === 'string' && want.startsWith('fn:') && typeof got === 'string' && got.startsWith('fn:')) return;
    out.push(`${path}: ${JSON.stringify(want).slice(0, 80)} shown as ${JSON.stringify(got).slice(0, 80)}`); return;
  }
  if (want.array) {
    if (!got.array) { out.push(`${path}: array shown as ${JSON.stringify(got).slice(0, 60)}`); return; }
    if (want.len !== got.len) out.push(`${path}: length ${want.len} shown as ${got.len}`);
    want.array.forEach((x, i) => got.array[i] !== undefined && diffCanon(x === '<hole>' ? 'undefined' : x, got.array[i], `${path}[${i}]`, out));
    if (want.array.includes('<hole>')) out.push(`${path}: has holes, drawn as undefined`);
    return;
  }
  if (want.map) {
    if (!got.map) { out.push(`${path}: Map shown as ${JSON.stringify(got).slice(0, 60)}`); return; }
    if (want.map.length !== got.map.length) out.push(`${path}: Map size ${want.map.length} shown as ${got.map.length}`);
    want.map.forEach(([k, x], i) => {
      const g = got.map[i];
      if (!g) return;
      const kk = typeof k === 'string' ? k.replace(/^(num|str|boolean):/, '') : JSON.stringify(k);
      if (kk !== g[0]) out.push(`${path}: Map key ${JSON.stringify(k).slice(0, 40)} shown as ${JSON.stringify(g[0])}`);
      diffCanon(x, g[1], `${path}.get(${kk})`, out);
    });
    return;
  }
  if (want.set) {
    if (!got.set) { out.push(`${path}: Set shown as ${JSON.stringify(got).slice(0, 60)}`); return; }
    if (want.set.length !== got.set.length) out.push(`${path}: Set size ${want.set.length} shown as ${got.set.length}`);
    want.set.forEach((x, i) => got.set[i] !== undefined && diffCanon(x, got.set[i], `${path}{${i}}`, out));
    return;
  }
  if (want.object) {
    if (got.object && want.object === '' && Object.keys(want.props).length === 0 && Object.keys(got.props).length === 0) return;
    if (!got.object) { out.push(`${path}: ${want.object} shown as ${JSON.stringify(got).slice(0, 60)}`); return; }
    for (const [k, x] of Object.entries(want.props)) {
      if (!(k in got.props)) { out.push(`${path}.${k} not shown`); continue; }
      diffCanon(x, got.props[k], `${path}.${k}`, out);
    }
    return;
  }
  if (want.error || want.date || want.regexp || want.promise) return;
  if (!same(want, got)) out.push(`${path}: ${JSON.stringify(want).slice(0, 60)} shown as ${JSON.stringify(got).slice(0, 60)}`);
}

const norm = s => s.replace(/\s+/g, '').replace(/'/g, '"').replace(/"([A-Za-z_$][\w$]*)":/g, '$1:');

function invariants(snap, nLines, words, finalStep) {
  const out = [];
  const ids = new Set(snap.heap.map(h => h.id));
  const refsIn = v => (v && v.type === 'ref' ? [v.heapId] : []);
  const edges = new Map(snap.heap.map(h => [h.id, (h.properties ?? []).flatMap(p => [...refsIn(p.value), ...refsIn(p.keyValue)])]));
  const roots = [];
  for (const f of snap.callStack) {
    if (/__/.test(f.name)) out.push(`leaked-name: frame ${f.name}`);
    const vars = [...(f.variables ?? []), ...(f.closureVars ?? []).flatMap(c => c.variables ?? [c])];
    for (const v of vars) {
      if (!v || !v.name) continue;
      for (const r of refsIn(v.value)) { roots.push(r); if (!ids.has(r)) out.push(`dangling-ref: ${f.name}.${v.name}`); }
      if (v.name !== 'return ↵' && v.name !== 'this' && (v.name.startsWith('__') || !words.has(v.name))) out.push(`leaked-name: ${f.name}.${v.name}`);
      if (v.value?.type === 'string' && /__(capture|pushFrame|popFrame|condition)__/.test(v.value.value)) out.push(`leaked-code: ${f.name}.${v.name}`);
    }
    if (f.thisArg) for (const r of refsIn(f.thisArg)) { roots.push(r); if (!ids.has(r)) out.push(`dangling-ref: ${f.name}.this`); }
  }
  for (const [id, es] of edges) for (const r of es) if (!ids.has(r)) out.push(`dangling-ref: heap ${id} -> ${r}`);
  const seen = new Set(); const st = [...roots];
  while (st.length) { const id = st.pop(); if (seen.has(id)) continue; seen.add(id); st.push(...(edges.get(id) ?? [])); }
  for (const h of snap.heap) if (!seen.has(h.id)) out.push(`unreachable-heap: ${h.objectType} ${h.label ?? ''}`.trim());
  if (!(snap.line >= 1 && snap.line <= nLines)) out.push(`bad-line: ${snap.line}`);
  if (finalStep && snap.callStack.length > 1) out.push(`frames-left: ${snap.callStack.map(f => f.name).join('>')}`);
  return out;
}

function analyze(id) {
  const src = readFileSync(join(casesDir, id + '.js'), 'utf8');
  const nLines = src.split('\n').length;
  const words = new Set(src.match(/[A-Za-z_$#][\w$]*/g)?.map(w => w.replace(/^#/, '')) ?? []);
  const g = load(id, 'golden');
  const t = load(id, 'traced');
  const tags = []; const notes = [];
  const r = { id, category: id.split('/')[0], tags, notes };
  if (!g || !t) { tags.push('not-run'); return r; }
  if (t.timeout || t.crashed || t.killed) { tags.push(g.syncError?.timeout ? 'worker-kill-endless' : 'worker-kill'); notes.push('the worker would be killed after 10 s, losing every step'); r.group = 'error'; return r; }
  const reply = t.reply;
  r.bytes = t.replyBytes; r.cloneBytes = t.cloneBytes;

  if (g.compileError) {
    if (reply.type !== 'error') { tags.push('compile-not-detected'); r.group = 'wrong-output'; return r; }
    const want = `${g.compileError.class}: ${g.compileError.message}`;
    notes.push(`Node: ${want} (line ${g.compileError.line}) | JSTutor: ${reply.message} (line ${reply.line})`);
    if (reply.line !== g.compileError.line) tags.push('compile-line');
    tags.push('compile-message');
    r.group = 'compile-differs';
    return r;
  }
  if (reply.type === 'error') { tags.push('pre-run-error'); notes.push(reply.message.slice(0, 200)); r.group = 'error'; return r; }

  const snaps = reply.snapshots; r.steps = snaps.length;
  const err = reply.error; const last = snaps[snaps.length - 1];
  const endless = !!g.syncError?.timeout;
  const limited = err?.kind === 'limit';
  if (limited) {
    const expected = endless || (g.stmtExecutions ?? 0) >= MAX_STEPS * 0.8 || id.startsWith('limits/');
    tags.push(expected ? 'limit-expected' : 'limit-unexpected');
    if (!expected) notes.push(`stopped at the step cap after ${snaps.length} steps; Node ran ${g.stmtExecutions} statements`);
  } else if (endless) tags.push('endless-not-stopped');

  // ---- console: meaning (the values logged, in order) ----
  const shownCalls = t.calls;
  const gCalls = g.calls;
  const upTo = limited ? shownCalls.length : Math.max(gCalls.length, shownCalls.length);
  let firstDiff = -1;
  for (let i = 0; i < upTo; i++) {
    const a = gCalls[i], b = shownCalls[i];
    if (!a || !b || a.method !== b.method || !same(a.args, b.args)) { firstDiff = i; break; }
  }
  if (firstDiff >= 0 && !(limited && firstDiff >= shownCalls.length)) {
    const a = gCalls[firstDiff], b = shownCalls[firstDiff];
    const lostToAsync = !b && t.afterReply.length > 0;
    tags.push(lostToAsync ? 'async-output-lost' : 'console-values');
    notes.push(`console call ${firstDiff + 1}: Node ${a ? a.method + ' ' + JSON.stringify(a.text).slice(0, 90) : '<none>'} | JSTutor ${b ? b.method + ' ' + JSON.stringify(b.text).slice(0, 90) : '<none>'}${lostToAsync ? ` (${t.afterReply.length} call(s) ran after the worker replied)` : ''}`);
  } else if (t.afterReply.length) {
    tags.push('async-output-lost'); notes.push(`${t.afterReply.length} console call(s) after the reply`);
  }

  // ---- console: display (what the console panel shows vs what Node prints) ----
  const displayed = last ? last.stdout : [];
  const shownMethods = new Set(['log', 'warn', 'error']);
  const missingMethods = new Set();
  const expectLines = [];
  for (const c of shownCalls) {
    if (!shownMethods.has(c.method)) { missingMethods.add(c.method); continue; }
    expectLines.push(c);
  }
  if (missingMethods.size) { tags.push('console-method-missing'); notes.push(`console.${[...missingMethods].join('/console.')} not shown at all`); }
  let lossy = null, cosmetic = null, stderrMixed = false;
  for (let i = 0; i < Math.min(expectLines.length, displayed.length); i++) {
    const c = expectLines[i];
    let shown = displayed[i];
    const prefix = c.method === 'log' ? '' : `[${c.method}] `;
    if (prefix) { if (shown.startsWith(prefix)) { shown = shown.slice(prefix.length); stderrMixed = true; } }
    if (shown === c.text) continue;
    if (norm(shown) === norm(c.text)) { cosmetic ??= `Node ${JSON.stringify(c.text).slice(0, 70)} | JSTutor ${JSON.stringify(shown).slice(0, 70)}`; continue; }
    lossy ??= `Node ${JSON.stringify(c.text).slice(0, 90)} | JSTutor ${JSON.stringify(shown).slice(0, 90)}`;
  }
  if (expectLines.length > displayed.length && !limited) { tags.push('output-after-last-step'); notes.push(`${expectLines.length - displayed.length} console line(s) written after the last step, never shown: ${JSON.stringify(expectLines[displayed.length].text).slice(0, 80)}`); }
  if (lossy) { tags.push('console-display-lossy'); notes.push(`display: ${lossy}`); }
  if (cosmetic) { tags.push('console-format'); notes.push(`format: ${cosmetic}`); }
  if (stderrMixed) tags.push('stderr-as-stdout');

  // ---- exceptions ----
  const gUncaught = g.syncError && !g.syncError.timeout ? g.syncError : g.uncaught[0] ?? null;
  const want = gUncaught ? (gUncaught.class ? `${gUncaught.class}: ${gUncaught.message}` : gUncaught.message) : null;
  if (!limited && !endless) {
    if (gUncaught && err?.kind !== 'exception') { tags.push(gUncaught.where ? 'async-exception-lost' : 'exception-missing'); notes.push(`Node: uncaught ${want}${gUncaught.where ? ' (in a ' + gUncaught.where + ')' : ''}; JSTutor: ${err ? err.message : 'no error'}`); }
    else if (!gUncaught && err) { tags.push('exception-extra'); notes.push(`JSTutor: ${err.kind}: ${err.message}`); }
    else if (gUncaught && err && err.message !== want) { tags.push('exception-message'); notes.push(`Node: ${want} | JSTutor: ${err.message}`); }
  }

  // ---- lines that ran but never got a step ----
  if (!limited) {
    const stepLines = new Set(snaps.map(s => s.line));
    const skipped = g.executedLines.filter(l => !stepLines.has(l));
    const throws = !!gUncaught || /\bthrow\b|\bcatch\b|\.catch\(/.test(src);
    if (skipped.length && throws) { tags.push('skipped-lines-unsure'); notes.push(`(unsure, the program throws) lines with no step: ${skipped.slice(0, 12).join(', ')}`); }
    else if (skipped.length) { tags.push('skipped-lines'); notes.push(`lines that ran with no step: ${skipped.slice(0, 12).join(', ')}`); }
  }

  // ---- invariants ----
  const inv = new Map();
  snaps.forEach((s, i) => { for (const x of invariants(s, nLines, words, i === snaps.length - 1 && !err)) { const k = x.split(':')[0]; if (!inv.has(k)) inv.set(k, `step ${i}: ${x}`); } });
  for (const [k, ex] of inv) { tags.push(k); notes.push(ex); }

  // ---- final state ----
  if (!err && last && !t.afterReply.length) {
    const glob = last.callStack[0];
    const shown = new Map((glob.variables ?? []).map(v => [v.name, v.value]));
    const diffs = [];
    for (const [name, wantV] of Object.entries(g.finalGlobals)) {
      if (wantV === '<uninitialized>') continue;
      if (!shown.has(name)) { diffs.push(`${name} not shown`); continue; }
      diffCanon(wantV, shownCanon(shown.get(name), last.heap), name, diffs);
    }
    if (diffs.length) { tags.push('final-state'); notes.push(`final state: ${diffs.slice(0, 5).join('; ')}`); }
  }

  const wrongOutput = ['output-after-last-step', 'console-values', 'console-display-lossy', 'console-method-missing', 'async-output-lost', 'exception-missing', 'async-exception-lost', 'compile-not-detected', 'endless-not-stopped'].some(x => tags.includes(x));
  const errorish = ['exception-extra', 'pre-run-error', 'limit-unexpected', 'leaked-code'].some(x => tags.includes(x));
  const stateTags = ['skipped-lines', 'final-state', 'dangling-ref', 'leaked-name', 'unreachable-heap', 'bad-line', 'frames-left', 'exception-message'];
  r.group = wrongOutput ? 'wrong-output' : errorish ? 'error' : tags.some(x => stateTags.includes(x)) ? 'wrong-state'
    : tags.some(x => ['console-format', 'stderr-as-stdout'].includes(x)) ? 'format-only' : 'match';
  return r;
}

function ids() {
  const out = [];
  for (const cat of readdirSync(casesDir)) for (const f of readdirSync(join(casesDir, cat))) if (f.endsWith('.js')) out.push(`${cat}/${f.slice(0, -3)}`);
  return out.sort();
}

const caseArg = process.argv.indexOf('--case');
if (caseArg > 0) {
  const id = process.argv[caseArg + 1];
  console.log(JSON.stringify(analyze(id), null, 1));
  const g = load(id, 'golden'), t = load(id, 'traced');
  if (process.argv.includes('--steps') && t?.reply?.snapshots) {
    console.log('Node console:', g.calls.map(c => c.method + ' ' + c.text).join(' | '));
    console.log('lines that ran:', g.executedLines.join(','));
    for (const [i, s] of t.reply.snapshots.slice(0, 120).entries()) {
      const top = s.callStack[s.callStack.length - 1];
      console.log(`${String(i).padStart(4)} ${String(s.line).padStart(3)} ${s.callStack.map(f => f.name + (f.isBlockScope ? '{}' : '')).join('>')}  ${(top.variables ?? []).map(v => v.name + '=' + JSON.stringify(shownCanon(v.value, s.heap)).slice(0, 60)).join(' ')}${s.condition ? '  cond=' + JSON.stringify(s.condition) : ''}`);
    }
    console.log('stdout:', JSON.stringify(t.reply.snapshots.at(-1)?.stdout));
  }
  process.exit(0);
}

const all = ids().map(analyze);
const groups = ['match', 'format-only', 'wrong-output', 'wrong-state', 'error', 'compile-differs'];
const cats = [...new Set(all.map(r => r.category))];
console.log('category'.padEnd(16) + groups.map(g => g.padStart(15)).join('') + '  total');
for (const c of [...cats, 'ALL']) {
  const rs = all.filter(r => c === 'ALL' || r.category === c);
  console.log(c.padEnd(16) + groups.map(g => String(rs.filter(r => r.group === g).length).padStart(15)).join('') + String(rs.length).padStart(7));
}
const tagCount = new Map();
for (const r of all) for (const tg of r.tags) tagCount.set(tg, [...(tagCount.get(tg) ?? []), r.id]);
console.log('\nTags:');
for (const [tg, list] of [...tagCount].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${tg.padEnd(24)} ${String(list.length).padStart(4)}  ${list.slice(0, 6).join(', ')}${list.length > 6 ? ', …' : ''}`);
const sizes = all.filter(r => r.bytes).sort((a, b) => b.bytes - a.bytes).slice(0, 6);
console.log('\nLargest replies:', sizes.map(r => `${r.id} ${(r.bytes / 1e6).toFixed(1)} MB JSON, ${((r.cloneBytes ?? 0) / 1e6).toFixed(1)} MB clone/${r.steps} steps`).join('; '));
writeFileSync(join(here, 'results', 'js-report.json'), JSON.stringify(all, null, 1));
