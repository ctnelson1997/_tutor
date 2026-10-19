/**
 * What a PyTutor run costs to record and send (#39). For heavy Python
 * programs, the `limits/` cases and the whole CPython corpus: the number of
 * steps, the tracer's time (Pyodide under Node, the browser's engine), the
 * size as JSON (as an exported viewer file stores the steps) and the size as
 * the worker's postMessage transfers the reply (a structured clone, measured
 * with v8.serialize, which writes an object shared between steps once), and
 * how the run ended.
 *
 *   npx tsx scripts/py-payload.ts          # everything
 *   npx tsx scripts/py-payload.ts --quick  # the heavy programs only
 */
import { serialize } from 'node:v8';
import { loadNodePyodide, type NodePyodide } from '../src/engines/py/__tests__/cpython/pyodideNode';
import { loadCases } from '../src/engines/py/__tests__/cpython/corpus';
import { loadTracer, runProgram } from '../src/engines/py/run';
import { getTracerCode } from '../src/engines/py/tracer';
import type { WorkerMessage } from '../src/types/snapshot';

const recursion = (depth: number) => `def down(n):
    if n == 0:
        return 0
    return down(n - 1) + 1

print(down(${depth}))
`;

export const HEAVY_PROGRAMS: Record<string, string> = {
  'recursion 100 deep': recursion(100),
  'recursion 300 deep': recursion(300),
  'recursion 500 deep': recursion(500),
  'recursion 900 deep': recursion(900),
  'insertion sort of 300 ints': `a = [(i * 7919) % 300 for i in range(300)]
for i in range(1, len(a)):
    key = a[i]
    j = i - 1
    while j >= 0 and a[j] > key:
        a[j + 1] = a[j]
        j -= 1
    a[j + 1] = key
print(a[0], a[299])
`,
  '1,000 small objects in a list': `class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

points = []
for i in range(1000):
    points.append(Point(i, i * 2))
total = 0
for p in points:
    total += p.x + p.y
print(total)
`,
};

export interface Payload {
  steps: number;
  ms: number;
  jsonBytes: number;
  cloneBytes: number;
  ending: string;
}

/** Run a program as the worker does (the tracer's 8.5-second budget included) and measure its reply. */
export function measure(py: NodePyodide, source: string, stdin = ''): Payload {
  const start = performance.now();
  const reply: WorkerMessage = runProgram(py, source, { stdin });
  const ms = performance.now() - start;
  const snapshots = reply.type === 'result' ? reply.snapshots : [];
  // One snapshot at a time: the whole array can exceed the longest string JavaScript allows.
  const jsonBytes = snapshots.reduce((n, s) => n + JSON.stringify(s).length + 1, 1);
  const ending = reply.type === 'error' ? `error: ${reply.message}` : reply.error ? `${reply.error.kind}: ${reply.error.message}` : 'normal';
  return { steps: snapshots.length, ms, jsonBytes, cloneBytes: serialize(reply).length, ending };
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(2).padStart(8)} MB`;

function report(name: string, p: Payload): void {
  const ending = p.ending === 'normal' ? '' : `  ${p.ending.slice(0, 60)}`;
  console.log(`${name.padEnd(40)} ${String(p.steps).padStart(5)} steps ${(p.ms / 1000).toFixed(2).padStart(6)} s  JSON ${mb(p.jsonBytes)}  posted ${mb(p.cloneBytes)}${ending}`);
}

async function main(): Promise<void> {
  const quick = process.argv.includes('--quick');
  const py = await loadNodePyodide();
  loadTracer(py, getTracerCode());
  for (const [name, source] of Object.entries(HEAVY_PROGRAMS)) report(name, measure(py, source));
  if (quick) return;
  const cases = loadCases().filter(c => c.category !== 'syntax-errors');
  console.log('');
  for (const c of cases.filter(x => x.category === 'limits')) report(c.id, measure(py, c.source, c.stdin ?? ''));
  const total: Payload = { steps: 0, ms: 0, jsonBytes: 0, cloneBytes: 0, ending: 'normal' };
  for (const c of cases.filter(x => x.category !== 'limits')) {
    const p = measure(py, c.source, c.stdin ?? '');
    total.steps += p.steps;
    total.ms += p.ms;
    total.jsonBytes += p.jsonBytes;
    total.cloneBytes += p.cloneBytes;
  }
  console.log('');
  report(`the corpus without limits/ (${cases.filter(x => x.category !== 'limits').length} programs)`, total);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/py-payload.ts')) await main();
