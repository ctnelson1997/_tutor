/**
 * Print a condensed trace of every snapshot the Java interpreter produces for a
 * program: each step's line, frames and heap. For debugging the visualization
 * (#8, #9) where stdout alone looks fine.
 *
 *   npx tsx scripts/java-viz.ts <program> [--final] [--steps=a-b] [--stdin=text]
 *
 * <program> is a .java file, a corpus case id (core/num-long-literal, which also
 * brings its .stdin), or example:<slug> for a shipped example. In --stdin, \n
 * stands for a newline.
 */
import { existsSync, readFileSync } from 'node:fs';
import { examples } from '../src/engines/java/examples';
import { loadCases } from '../src/engines/java/__tests__/jdk/corpus';
import { runInterpreter } from '../src/engines/java/__tests__/jdk/harness';
import type { ExecutionSnapshot, RuntimeValue } from '../src/types/snapshot';
import { primitiveText } from '../src/utils/valueDisplay';

const [target, ...flags] = process.argv.slice(2);
const opt = (name: string) => flags.find(f => f.startsWith(`--${name}=`))?.slice(name.length + 3);

function load(): { source: string; stdin: string } {
  if (!target) {
    console.error('usage: npx tsx scripts/java-viz.ts <file.java | case id | example:slug> [--final] [--steps=a-b] [--stdin=text]');
    process.exit(1);
  }
  if (target.startsWith('example:')) {
    const ex = examples.find(e => e.slug === target.slice('example:'.length));
    if (!ex) throw new Error(`No example "${target}". Slugs: ${examples.map(e => e.slug).join(', ')}`);
    return { source: ex.code, stdin: '' };
  }
  if (existsSync(target)) {
    const stdinPath = target.replace(/\.java$/, '.stdin');
    return { source: readFileSync(target, 'utf8'), stdin: existsSync(stdinPath) ? readFileSync(stdinPath, 'utf8') : '' };
  }
  const c = loadCases().find(x => x.id === target);
  if (!c) throw new Error(`"${target}" is not a file, a corpus case id, or example:<slug>`);
  return { source: c.source, stdin: c.stdin };
}

/** A value as the UI shows it: an arrow to an object, or the engine's own text (Java's 'B', 5.0). */
const show = (v: RuntimeValue): string => (v.type === 'ref' ? `#${v.heapId}` : primitiveText(v));

function print(s: ExecutionSnapshot, lines: string[]): void {
  console.log(`\n[step ${s.step}] line ${s.line}: ${(lines[s.line - 1] ?? '').trim()}`);
  for (const f of s.callStack) {
    const vars = [...(f.thisArg ? [`this=${show(f.thisArg)}`] : []), ...f.variables.map(x => `${x.name}=${show(x.value)}`)].join(', ');
    console.log(`  ${f.isBlockScope ? `  {${f.name} block}` : `FRAME ${f.name}`}: ${vars}`);
  }
  for (const h of s.heap) {
    const props = h.properties.map(p => `${p.key}:${show(p.value)}`).join(', ');
    console.log(`  heap #${h.id} ${h.objectType}${h.label ? `<${h.label}>` : ''} {${props}}`);
  }
  if (s.stdout.length) console.log(`  stdout: ${JSON.stringify(s.stdout)}`);
}

const { source, stdin: caseStdin } = load();
const stdinFlag = opt('stdin');
const run = runInterpreter(source, stdinFlag !== undefined ? stdinFlag.replace(/\\n/g, '\n') : caseStdin);
console.log(`steps=${run.snapshots.length}${run.error ? `  ERROR: ${run.error}` : ''}`);

let snapshots = run.snapshots;
const range = opt('steps');
if (flags.includes('--final')) snapshots = snapshots.slice(-1);
else if (range) {
  const [a, b] = range.split('-').map(Number);
  snapshots = snapshots.slice(a, (Number.isNaN(b) ? a : b) + 1);
}
const lines = source.replace(/\r\n/g, '\n').split('\n');
for (const s of snapshots) print(s, lines);
