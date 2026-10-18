/**
 * What the JS engine's steps cost to send from the worker (#49). Each step
 * shares what didn't change with the steps before it as it is recorded, so the
 * worker's postMessage (a structured clone, measured with v8.serialize) carries
 * each unchanged object once. Before #49 the insertion sort below posted
 * 26 MB, recursion 1,000 deep 52 MB, and a runaway recursion stopped at the
 * step cap 208 MB (482 MB before #44).
 */
import { serialize } from 'node:v8';
import { describe, expect, it } from 'vitest';
import type { ExecutionSnapshot } from '../../../types/snapshot';
import { HEAVY_JS_PROGRAMS } from '../../../../scripts/js-payload';
import { runJsTutor } from './node/harness';

const MB = 1e6;
const HEAVY = { timeout: 30_000 };

async function posted(source: string): Promise<{ snapshots: ExecutionSnapshot[]; bytes: number }> {
  const reply = await runJsTutor(source, 60_000);
  if (reply.type !== 'result') throw new Error(reply.message);
  return { snapshots: reply.snapshots, bytes: serialize(reply).length };
}

describe('JS snapshot payload (#49)', () => {
  it('posts an insertion sort of 300 numbers (5,000 steps) in under 5 MB', HEAVY, async () => {
    const { snapshots, bytes } = await posted(HEAVY_JS_PROGRAMS['insertion sort of 300 numbers']);
    expect(snapshots).toHaveLength(5000);
    expect(bytes).toBeLessThan(5 * MB);
  });

  it('posts 1,000 objects in an array in under 5 MB, and recursion 1,000 deep in under 10 MB', HEAVY, async () => {
    expect((await posted(HEAVY_JS_PROGRAMS['1,000 small objects in an array'])).bytes).toBeLessThan(5 * MB);
    expect((await posted(HEAVY_JS_PROGRAMS['recursion 1,000 deep'])).bytes).toBeLessThan(10 * MB);
  });

  it('posts an array that never changes as one object, and frames and stdout that are unchanged once', async () => {
    const { snapshots } = await posted(`const fixed = [1, 2, 3];
const moving = [0, 0, 0];
for (let i = 0; i < 3; i++) moving[i] = fixed[i] * 2;
console.log(moving);`);
    const fixedIn = (s: ExecutionSnapshot) => s.heap.find(h => (h.properties[0]?.value as { value?: unknown }).value === 1);
    const withFixed = snapshots.filter(s => fixedIn(s));
    for (const s of withFixed) expect(fixedIn(s)).toBe(fixedIn(withFixed[0]));
    // the loop's steps share the stdout array (nothing printed yet)
    const loop = snapshots.filter(s => s.line === 3);
    for (const s of loop) expect(s.stdout).toBe(loop[0].stdout);
  });
});
