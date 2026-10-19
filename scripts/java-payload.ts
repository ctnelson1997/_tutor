/**
 * How big the snapshots of a run are (#18). For a few heavy Java programs and
 * for the whole JDK corpus: the number of steps, the run time, the size as
 * JSON (as an exported viewer file stores it), and the size as the worker's
 * postMessage transfers it (a structured clone, measured with v8.serialize,
 * which writes an object shared between snapshots once).
 *
 * The JS worker shares as it records since #49 (js-payload.ts), the Python
 * worker since #39 (py-payload.ts).
 *
 *   npx tsx scripts/java-payload.ts          # everything
 *   npx tsx scripts/java-payload.ts --quick  # the heavy Java programs only
 */
import { serialize } from 'node:v8';
import { parseJava } from '../src/engines/java/parser';
import { JavaInterpreter } from '../src/engines/java/interpreter';
import { loadCases } from '../src/engines/java/__tests__/jdk/corpus';
import type { ExecutionSnapshot } from '../src/types/snapshot';

export const HEAVY_PROGRAMS: Record<string, string> = {
  'insertion sort of 300 ints': `public class Main {
  public static void main(String[] args) {
    int[] a = new int[300];
    for (int i = 0; i < a.length; i++) a[i] = (i * 7919) % 300;
    for (int i = 1; i < a.length; i++) {
      int key = a[i];
      int j = i - 1;
      while (j >= 0 && a[j] > key) {
        a[j + 1] = a[j];
        j--;
      }
      a[j + 1] = key;
    }
    System.out.println(a[0] + " " + a[299]);
  }
}`,
  '1,000 small objects in an ArrayList': `import java.util.*;
public class Main {
  static class Point {
    int x, y;
    Point(int x, int y) { this.x = x; this.y = y; }
  }
  public static void main(String[] args) {
    List<Point> points = new ArrayList<>();
    for (int i = 0; i < 1000; i++) points.add(new Point(i, i * 2));
    int sum = 0;
    for (Point p : points) sum += p.x + p.y;
    System.out.println(sum);
  }
}`,
  '2,400-iteration arithmetic loop': `public class Main {
  public static void main(String[] args) {
    long total = 0;
    for (int i = 0; i < 2400; i++) total += (long) i * i % 7;
    System.out.println(total);
  }
}`,
};

export interface Payload {
  steps: number;
  ms: number;
  jsonBytes: number;
  cloneBytes: number;
}

export function measure(source: string, stdin = ''): Payload {
  const start = performance.now();
  const snapshots: ExecutionSnapshot[] = new JavaInterpreter(stdin).execute(parseJava(source)).snapshots;
  const ms = performance.now() - start;
  // One snapshot at a time: the whole array can exceed the longest string JavaScript allows.
  const jsonBytes = snapshots.reduce((n, s) => n + JSON.stringify(s).length + 1, 1);
  return { steps: snapshots.length, ms, jsonBytes, cloneBytes: serialize(snapshots).length };
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(2).padStart(8)} MB`;

function main(): void {
  for (const [name, source] of Object.entries(HEAVY_PROGRAMS)) {
    const p = measure(source);
    console.log(`${name.padEnd(38)} ${String(p.steps).padStart(5)} steps ${p.ms.toFixed(0).padStart(6)} ms  json ${mb(p.jsonBytes)}  clone ${mb(p.cloneBytes)}`);
  }
  if (process.argv.includes('--quick')) return;
  let steps = 0, ms = 0, json = 0, clone = 0, biggest = { id: '', bytes: 0 };
  for (const c of loadCases()) {
    let p: Payload;
    try {
      p = measure(c.source, c.stdin);
    } catch {
      continue; // unparseable (compile-error cases)
    }
    steps += p.steps; ms += p.ms; json += p.jsonBytes; clone += p.cloneBytes;
    if (p.cloneBytes > biggest.bytes) biggest = { id: c.id, bytes: p.cloneBytes };
  }
  console.log(`${'the JDK corpus'.padEnd(38)} ${String(steps).padStart(5)} steps ${ms.toFixed(0).padStart(6)} ms  json ${mb(json)}  clone ${mb(clone)}  (largest: ${biggest.id}, ${mb(biggest.bytes).trim()})`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/java-payload.ts')) main();
