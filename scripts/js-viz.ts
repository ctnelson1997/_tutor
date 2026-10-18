/**
 * Print a condensed trace of every snapshot JSTutor produces for a program:
 * each step's line, frames and heap, and what Node printed. For debugging the
 * visualization where the console alone looks fine (#42).
 *
 *   npx tsx scripts/js-viz.ts <program> [--final] [--steps=a-b]
 *
 * <program> is a .js file, a corpus case id (control-flow/for-no-test-break),
 * or example:<slug> for a shipped example. It runs as the app runs it (in a
 * worker, the reply taken when the worker posts it).
 */
import { existsSync, readFileSync } from 'node:fs';
import { examples } from '../src/engines/js/examples';
import { loadCases, readGolden } from '../src/engines/js/__tests__/node/corpus';
import { runJsTutor } from '../src/engines/js/__tests__/node/harness';
import type { ExecutionSnapshot, RuntimeValue } from '../src/types/snapshot';
import { primitiveText } from '../src/utils/valueDisplay';

const [target, ...flags] = process.argv.slice(2);
const opt = (name: string) => flags.find(f => f.startsWith(`--${name}=`))?.slice(name.length + 3);

function load(): { source: string; nodeConsole?: string[] } {
  if (!target) {
    console.error('usage: npx tsx scripts/js-viz.ts <file.js | case id | example:slug> [--final] [--steps=a-b]');
    process.exit(1);
  }
  if (target.startsWith('example:')) {
    const ex = examples.find(e => e.slug === target.slice('example:'.length));
    if (!ex) throw new Error(`No example "${target}". Slugs: ${examples.map(e => e.slug).join(', ')}`);
    return { source: ex.code };
  }
  if (existsSync(target)) return { source: readFileSync(target, 'utf8') };
  const c = loadCases().find(x => x.id === target);
  if (!c) throw new Error(`"${target}" is not a file, a corpus case id, or example:<slug>`);
  const golden = readGolden(c);
  return { source: c.source, nodeConsole: golden?.console.map(l => (l.stream === 'stderr' ? `[stderr] ${l.text}` : l.text)) };
}

/** A value as the UI shows it: an arrow to an object, or the value's text. */
const show = (v: RuntimeValue): string => (v.type === 'ref' ? `#${v.heapId}` : primitiveText(v));

function print(s: ExecutionSnapshot, lines: string[]): void {
  const condition = s.condition ? `  [${s.condition.expression} → ${s.condition.result}]` : '';
  const label = s.label ? `  (${s.label})` : '';
  console.log(`\n[step ${s.step}] line ${s.line}: ${(lines[s.line - 1] ?? '').trim()}${condition}${label}`);
  for (const f of s.callStack) {
    const vars = [
      ...(f.thisArg ? [`this=${show(f.thisArg)}`] : []),
      ...f.variables.map(x => `${x.name}=${show(x.value)}`),
      ...(f.closureVars ?? []).map(x => `(closure) ${x.name}=${show(x.value)}`),
    ].join(', ');
    console.log(`  ${f.isBlockScope ? `  {${f.name} block}` : `FRAME ${f.name}`}: ${vars}`);
  }
  for (const h of s.heap) {
    const props = h.properties.map(p => `${p.key}:${show(p.value)}`).join(', ');
    console.log(`  heap #${h.id} ${h.objectType}${h.label ? `<${h.label}>` : ''} {${props}}`);
  }
  const out = s.console?.map(l => (l.stream === 'stderr' ? `[stderr] ${l.text}` : l.text)) ?? s.stdout;
  if (out.length) console.log(`  console: ${JSON.stringify(out)}`);
}

async function main(): Promise<void> {
  const { source, nodeConsole } = load();
  const reply = await runJsTutor(source);
  if (reply.type === 'error') {
    console.log(`ERROR before any step: ${reply.message}${reply.line ? ` (line ${reply.line})` : ''}`);
    return;
  }
  const err = reply.error;
  console.log(`steps=${reply.snapshots.length}${err ? `  ${err.kind ?? 'error'}: ${err.message}` : ''}`);
  let snapshots = reply.snapshots;
  const range = opt('steps');
  if (flags.includes('--final')) snapshots = snapshots.slice(-1);
  else if (range) {
    const [a, b] = range.split('-').map(Number);
    snapshots = snapshots.slice(a, (Number.isNaN(b) ? a : b) + 1);
  }
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  for (const s of snapshots) print(s, lines);
  if (nodeConsole) console.log(`\nNode printed: ${JSON.stringify(nodeConsole)}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
