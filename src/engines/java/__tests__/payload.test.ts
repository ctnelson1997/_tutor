/**
 * What the steps of a run cost to send from the worker and to keep (#18).
 * Each step shares what didn't change with the steps before it, so the
 * worker's postMessage (a structured clone, measured with v8.serialize)
 * carries each unchanged object once. Before #18, the insertion sort below
 * cost 75 MB and the list of 1,000 objects 516 MB.
 */
import { describe, it, expect } from 'vitest';
import { serialize } from 'node:v8';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import { HEAVY_PROGRAMS } from '../../../../scripts/java-payload';

const run = (source: string) => new JavaInterpreter().execute(parseJava(source)).snapshots;
const MB = 1e6;
/** The heavy programs take a second or two alone, longer while other suites run. */
const HEAVY = { timeout: 30_000 };

describe('snapshot payload', () => {
  it('keeps an insertion sort of 300 ints (5,000 steps) under 5 MB', HEAVY, () => {
    const snapshots = run(HEAVY_PROGRAMS['insertion sort of 300 ints']);
    expect(snapshots).toHaveLength(5000);
    expect(serialize(snapshots).length).toBeLessThan(5 * MB);
  });

  it('keeps 1,000 small objects in a list under 15 MB', HEAVY, () => {
    expect(serialize(run(HEAVY_PROGRAMS['1,000 small objects in an ArrayList'])).length).toBeLessThan(15 * MB);
  });

  it('shares an object that never changes across every step', () => {
    const snapshots = run(`public class Main {
  public static void main(String[] args) {
    int[] fixed = {1, 2, 3};
    int[] moving = new int[3];
    for (int i = 0; i < 3; i++) moving[i] = fixed[i] * 2;
  }
}`);
    const fixedIn = (s: (typeof snapshots)[number]) => s.heap.find(h => h.properties[0]?.value.type === 'number' && h.properties[0].value.value === 1)!;
    const first = fixedIn(snapshots[1]); // the first step is before fixed exists
    for (const s of snapshots.slice(1)) expect(fixedIn(s)).toBe(first);
    const moving = snapshots.map(s => s.heap.find(h => h !== fixedIn(s))).filter(h => h !== undefined);
    expect(new Set(moving).size).toBe(4); // [0,0,0], then one version per write
  });
});
