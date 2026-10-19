/**
 * Show CPython's reference trace and PyTutor's steps for one program, one
 * line each, to see where they part (#29).
 *
 *   npx tsx scripts/py-viz.ts <case id | file.py | example:slug>
 *   npx tsx scripts/py-viz.ts realistic/group-students --steps=0-40
 *   npx tsx scripts/py-viz.ts my.py --stdin=input.txt      # a file has no golden: CPython runs now
 *   npx tsx scripts/py-viz.ts realistic/bst --final        # the last step's frames and heap in full
 *
 * A step's line: its number, line, frames (innermost last), and the innermost
 * frame's variables as Python reprs (`#id` for a heap reference). An event's
 * line: event, line, frames and locals as the golden records them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { examples } from '../src/engines/py/examples';
import type { ExecutionSnapshot, RuntimeValue } from '../src/types/snapshot';
import { loadCases, readGolden, type PyGolden } from '../src/engines/py/__tests__/cpython/corpus';
import { RunnerPool } from '../src/engines/py/__tests__/cpython/harness';
import { record } from '../src/engines/py/__tests__/cpython/record';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
const final = args.includes('--final');
const range = args.find(a => a.startsWith('--steps='))?.slice('--steps='.length);
const stdinArg = args.find(a => a.startsWith('--stdin='))?.slice('--stdin='.length);
if (!target) {
  console.error('usage: npx tsx scripts/py-viz.ts <case id | file.py | example:slug> [--steps=a-b] [--final] [--stdin=file]');
  process.exit(1);
}

function show(v: RuntimeValue): string {
  switch (v.type) {
    case 'ref': return `#${v.heapId}`;
    case 'null': return 'None';
    case 'boolean': return v.value ? 'True' : 'False';
    case 'string': return v.display ?? JSON.stringify(v.value);
    default: return v.display ?? String(v.value);
  }
}

function stepLine(s: ExecutionSnapshot): string {
  const top = s.callStack[s.callStack.length - 1];
  const vars = (top?.variables ?? []).map(v => `${v.name}=${show(v.value)}`).join(' ');
  const extra = [s.condition ? `[${s.condition.expression} → ${s.condition.result}]` : '', s.columnRange ? `cols ${s.columnRange.startCol}-${s.columnRange.endCol}` : ''].filter(Boolean).join(' ');
  return `${String(s.step).padStart(4)} ${String(s.line).padStart(3)} ${s.callStack.map(f => f.name).join(' > ')}  ${vars}${extra ? '  ' + extra : ''}`;
}

function printFinal(s: ExecutionSnapshot): void {
  for (const f of s.callStack) {
    console.log(`  frame ${f.name}`);
    for (const v of f.variables) console.log(`    ${v.name} = ${show(v.value)}`);
  }
  for (const h of s.heap) {
    console.log(`  #${h.id} ${h.objectType}${h.label ? ' ' + h.label : ''}`);
    for (const p of h.properties) console.log(`    ${p.key}: ${show(p.value)}`);
  }
}

async function main(): Promise<void> {
  let source: string;
  let stdin: string | null = null;
  let golden: PyGolden | null = null;
  const c = loadCases().find(x => x.id === target);
  if (c) {
    ({ source, stdin } = c);
    golden = readGolden(c);
  } else if (target!.startsWith('example:')) {
    const ex = examples.find(e => e.slug === target!.slice('example:'.length));
    if (!ex) throw new Error(`no example ${target}`);
    source = ex.code;
  } else if (existsSync(target!)) {
    source = readFileSync(target!, 'utf8').replace(/\r\n/g, '\n');
    const stdinPath = stdinArg ?? target!.replace(/\.py$/, '.stdin');
    stdin = existsSync(stdinPath) ? readFileSync(stdinPath, 'utf8').replace(/\r\n/g, '\n') : null;
  } else {
    throw new Error(`no case, example or file ${target}`);
  }
  if (!golden) golden = { ...(await record(source, stdin)), sourceSha256: '' };

  const pool = new RunnerPool(1);
  const outcome = await pool.run(source, stdin).finally(() => pool.close());
  const [from, to] = range ? range.split('-').map(Number) : [0, Infinity];

  console.log(`--- CPython: ${golden.exception ? `uncaught ${golden.exception.class}: ${golden.exception.message}` : golden.compileError ? `${golden.compileError.class}: ${golden.compileError.msg} (line ${golden.compileError.line})` : golden.endless ? 'endless' : 'ends normally'}`);
  console.log(golden.stdout.replace(/\n$/, '').split('\n').map(l => `  | ${l}`).join('\n'));
  if (!final) {
    console.log('--- CPython events');
    // As referenceEvents numbers them, with runs of frames kept as name*n.
    golden.events.filter(e => !(e.event === 'call' && e.line === 0)).forEach((e, i) => {
      if (i < from || i > to) return;
      const locals = Object.entries(e.locals).map(([k, v]) => `${k}=${v}`).join(' ');
      console.log(`${String(i).padStart(4)} ${e.event.padEnd(9)} ${String(e.line).padStart(3)} ${e.stack.join(' > ')}  ${locals}${e.value !== undefined ? '  -> ' + e.value : ''}${e.exc ? '  !' + e.exc : ''}`);
    });
  }

  const { reply } = outcome;
  console.log(`--- PyTutor: ${(outcome.cpuMs / 1000).toFixed(2)} s${outcome.killed ? ' (the worker would be killed)' : ''}`);
  if (reply.type === 'error') {
    console.log(`  error before any step: ${reply.message}${reply.line ? ` (line ${reply.line})` : ''}`);
    return;
  }
  if (reply.error) console.log(`  ends with ${reply.error.kind}: ${reply.error.message}${reply.error.line ? ` (line ${reply.error.line})` : ''}`);
  if (outcome.lostStdout) console.log(`  lost to the browser's console: ${JSON.stringify(outcome.lostStdout)}`);
  const last = reply.snapshots[reply.snapshots.length - 1];
  if (last) console.log(last.stdout.map(l => `  | ${l}`).join('\n'));
  if (final) {
    if (last) printFinal(last);
    return;
  }
  console.log('--- PyTutor steps');
  for (const s of reply.snapshots.slice(from, to === Infinity ? undefined : to + 1)) console.log(stepLine(s));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
