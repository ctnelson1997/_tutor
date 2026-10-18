/**
 * How big the JS engine's replies are (#49). For a few heavy programs and for
 * the whole Node corpus: the number of steps, the run time, the size as JSON
 * (as an exported viewer file stores it), and the size as the worker's
 * postMessage transfers it (a structured clone, measured with v8.serialize,
 * which writes an object shared between snapshots once). Each program runs as
 * the app runs it, in a worker (runJsTutor).
 *
 *   npx tsx scripts/js-payload.ts          # everything
 *   npx tsx scripts/js-payload.ts --quick  # the heavy programs only
 */
import { serialize } from 'node:v8';
import { fileURLToPath } from 'node:url';
import { loadCases, readGolden } from '../src/engines/js/__tests__/node/corpus';
import { caseTimeout, runJsTutor } from '../src/engines/js/__tests__/node/harness';
import type { ExecutionSnapshot } from '../src/types/snapshot';

export const HEAVY_JS_PROGRAMS: Record<string, string> = {
  'insertion sort of 300 numbers': `const a = [];
for (let i = 0; i < 300; i++) a.push((i * 7919) % 300);
for (let i = 1; i < a.length; i++) {
  const key = a[i];
  let j = i - 1;
  while (j >= 0 && a[j] > key) {
    a[j + 1] = a[j];
    j--;
  }
  a[j + 1] = key;
}
console.log(a[0], a[299]);`,
  '1,000 small objects in an array': `const points = [];
for (let i = 0; i < 1000; i++) points.push({ x: i, y: i * 2 });
let sum = 0;
for (const p of points) sum += p.x + p.y;
console.log(sum);`,
  'recursion 1,000 deep': `function depth(n) {
  if (n === 0) return 0;
  return 1 + depth(n - 1);
}
console.log(depth(1000));`,
};

interface Payload { steps: number; ms: number; jsonBytes: number; cloneBytes: number }

export async function measure(source: string, timeoutMs = 60_000): Promise<Payload> {
  const started = performance.now();
  const reply = await runJsTutor(source, timeoutMs);
  const ms = performance.now() - started;
  const snapshots: ExecutionSnapshot[] = reply.type === 'result' ? reply.snapshots : [];
  // One snapshot at a time: the whole array can exceed the longest string JavaScript allows.
  const jsonBytes = snapshots.reduce((n, s) => n + JSON.stringify(s).length + 1, 1);
  return { steps: snapshots.length, ms, jsonBytes, cloneBytes: serialize(reply).length };
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(2).padStart(8)} MB`;
const line = (name: string, p: Payload) => `${name.padEnd(38)} ${String(p.steps).padStart(5)} steps ${p.ms.toFixed(0).padStart(6)} ms  json ${mb(p.jsonBytes)}  posted ${mb(p.cloneBytes)}`;

async function main(): Promise<void> {
  for (const [name, source] of Object.entries(HEAVY_JS_PROGRAMS)) console.log(line(name, await measure(source)));
  if (process.argv.includes('--quick')) return;
  let steps = 0, ms = 0, json = 0, clone = 0;
  let biggest = { id: '', bytes: 0 };
  for (const c of loadCases()) {
    const golden = readGolden(c);
    const p = await measure(c.source, golden ? caseTimeout(golden) : 60_000);
    steps += p.steps; ms += p.ms; json += p.jsonBytes; clone += p.cloneBytes;
    if (p.cloneBytes > biggest.bytes) biggest = { id: c.id, bytes: p.cloneBytes };
  }
  console.log(`${line('the Node corpus', { steps, ms, jsonBytes: json, cloneBytes: clone })}  (largest: ${biggest.id}, ${mb(biggest.bytes).trim()})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
