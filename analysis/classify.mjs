// Assigns every program that doesn't match to the roadmap issue(s) that fix it (a known-failures map), from the analyzers' reports.
// Usage: node classify.mjs <py|js>   → results/<lang>-causes.json, per-issue counts, and anything left unassigned
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lang = process.argv[2];
const report = JSON.parse(readFileSync(join(here, 'results', `${lang}-report.json`), 'utf8'));
const src = id => readFileSync(join(here, lang, 'cases', `${id}.${lang}`), 'utf8');
const has = (r, ...tags) => tags.some(t => r.tags.includes(t));
const note = (r, re) => r.notes.some(n => re.test(n));

function pyCauses(r) {
  const c = new Set();
  const s = src(r.id);
  const comprehension = s.split('\n').some(l => !/^\s*(async\s+)?for\b/.test(l) && /[[({].*\bfor\b.*\bin\b/.test(l));
  if (note(r, /Errno 29/)) c.add('input');
  if (has(r, 'pre-run-error') && note(r, /CodeRunner|unterminated/)) c.add('embedding');
  if (['oop/getattr-fallback', 'exceptions/recursion-error-message', 'extra/low-recursion-limit', 'numbers/huge-int-variable'].includes(r.id)) c.add('tracer-safety');
  if (has(r, 'worker-kill')) c.add('payload');
  if (has(r, 'lost-stdout', 'stderr-as-stdout') || (has(r, 'stdout') && /print\([^)]*\b(end|file)\s*=|sys\.std(out|err)|redirect_stdout/.test(s))) c.add('output');
  if (comprehension && (has(r, 'exception-extra', 'steps-not-in-cpython', 'skipped-lines', 'return-value') || (has(r, 'stdout') && !c.size)
    || (has(r, 'value-shown-wrong') && note(r, /shown as \d|shown as \{"type":"string"/)))) c.add('comprehensions');
  if (has(r, 'limit-expected') && !has(r, 'stdout')) c.add('expected');
  if (note(r, /\.0 shown as|e\+\d|j\) shown as|-0\.0 shown|1e-07 shown/)) c.add('numbers');
  if (note(r, /not shown: .*(__\w+__|<module>\.(list|sum|max|str|id|type|min|len|dict))/) || has(r, 'leaked-name')) c.add('state');
  if (has(r, 'traceback')) c.add('errors');
  if (has(r, 'compile-message', 'compile-line', 'compile-not-detected')) c.add('errors');
  return c;
}

function jsCauses(r) {
  const c = new Set();
  const s = src(r.id);
  const asyncCode = /\bawait\b|\.then\(|setTimeout|setInterval|queueMicrotask|Promise\./.test(s);
  if (has(r, 'async-output-lost', 'async-exception-lost') || (asyncCode && has(r, 'frames-left'))) c.add('async');
  if (has(r, 'console-display-lossy', 'console-method-missing', 'output-after-last-step', 'console-values')) c.add('console');
  if (r.group === 'format-only' || has(r, 'console-format', 'stderr-as-stdout')) c.add('console-format');
  if (has(r, 'worker-kill-endless') || (has(r, 'skipped-lines') && /^\s*\w+:\s*(for|while|do|\{)|static\s*\{|^\s*\w+\s*=\s*(\([^)]*\)|\w+)\s*=>|!function|void\s*\(function/m.test(s))) c.add('unreached');
  if (has(r, 'frames-left') && !(asyncCode && !/\bbreak\b|\bcontinue\b|function\*/.test(s))) c.add('frames');
  if (has(r, 'final-state') && note(r, /not shown|shown as "num:\d|shown as "null"|shown as "boolean/) && has(r, 'frames-left')) c.add('frames');
  if (['functions/fn-tostring', 'functions/error-stack-first-line', 'objects-classes/define-property-nonenumerable'].includes(r.id) || (has(r, 'console-display-lossy') && note(r, /__pushFrame__/))) c.add('visible');
  if (note(r, /NaN" shown as|Infinity" shown as|"num:-0" shown as|has holes|\.\[[^\]]+\] not shown|Map key/)) c.add('values');
  if (has(r, 'compile-message', 'compile-line', 'compile-not-detected')) c.add('parse-errors');
  if (has(r, 'limit-unexpected') && r.id === 'limits/big-array-reduce') c.add('expected');
  return c;
}

const out = {};
const unassigned = [];
const count = new Map();
for (const r of report) {
  if (r.group === 'match' || r.group === undefined) continue;
  const causes = [...(lang === 'py' ? pyCauses(r) : jsCauses(r))];
  if (!causes.length) unassigned.push(r);
  out[r.id] = { group: r.group, causes, tags: r.tags };
  for (const k of causes) count.set(k, (count.get(k) ?? 0) + 1);
}
writeFileSync(join(here, 'results', `${lang}-causes.json`), JSON.stringify(out, null, 1));
console.log('Programs per cause:', [...count].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', '));
const groups = {};
for (const [id, v] of Object.entries(out)) for (const k of v.causes) { groups[k] ??= {}; groups[k][v.group] = (groups[k][v.group] ?? 0) + 1; }
for (const [k, g] of Object.entries(groups)) console.log(`  ${k.padEnd(16)} ${JSON.stringify(g)}`);
console.log(`\nUnassigned (${unassigned.length}):`);
for (const r of unassigned) { console.log(`  ${r.id} [${r.group}] ${r.tags.join(',')}`); for (const n of r.notes.slice(0, 3)) console.log('      ' + n.slice(0, 200)); }
