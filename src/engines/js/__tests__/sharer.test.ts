/**
 * The JS runtime shares unchanged parts of its snapshots as it records them
 * (#49) with SHARER_SOURCE, a script port of src/utils/snapshotSharing.ts.
 * Here both are given the same unshared steps (real runs, copied through
 * JSON) and must share exactly the same parts (shape).
 */
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { ExecutionSnapshot } from '../../../types/snapshot';
import { shareSnapshots } from '../../../utils/snapshotSharing';
import { SHARER_SOURCE } from '../sharer';
import { HEAVY_JS_PROGRAMS } from '../../../../scripts/js-payload';
import { runJsTutor } from './node/harness';

/** The runtime's sharer, run as the worker runs it. */
function runtimeShare(snapshots: ExecutionSnapshot[]): ExecutionSnapshot[] {
  const ctx = vm.createContext({});
  vm.runInContext(SHARER_SOURCE, ctx);
  const share = vm.runInContext('__shareSnapshot__', ctx) as (s: ExecutionSnapshot) => ExecutionSnapshot;
  return snapshots.map(s => share(s));
}

/**
 * The steps' contents and which of their parts are the same object: each
 * object is numbered when first met, and met again as a reference to it.
 * (V8's serializer isn't a fair judge: it encodes equal arrays and numbers
 * differently depending on how they were built.)
 */
function shape(snapshots: ExecutionSnapshot[]): string {
  const ids = new Map<object, number>();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : Number.isNaN(v) ? 'NaN' : v;
    if (v === null || typeof v !== 'object') return v;
    const seen = ids.get(v);
    if (seen !== undefined) return { $ref: seen };
    ids.set(v, ids.size);
    if (Array.isArray(v)) return v.map(walk);
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, walk((v as Record<string, unknown>)[k])]));
  };
  return JSON.stringify(walk(snapshots));
}

async function unsharedSteps(source: string): Promise<ExecutionSnapshot[]> {
  const reply = await runJsTutor(source);
  if (reply.type !== 'result') throw new Error(reply.message);
  return JSON.parse(JSON.stringify(reply.snapshots)) as ExecutionSnapshot[];
}

const PROGRAMS: Record<string, string> = {
  ...HEAVY_JS_PROGRAMS,
  'objects, a Map, stderr and a callback': `const owner = { name: "Ann" };
const scores = new Map([[owner, 1]]);
for (let i = 0; i < 5; i++) {
  scores.set(owner, scores.get(owner) + i);
  if (i === 3) console.error("three");
  console.log(i, [...scores.values()]);
}
setTimeout(() => { owner.name = "Bo"; }, 10);`,
};

describe("the runtime's snapshot sharing (#49)", () => {
  for (const [name, source] of Object.entries(PROGRAMS)) {
    it(`shares what shareSnapshots shares: ${name}`, async () => {
      const steps = await unsharedSteps(source);
      const mine = runtimeShare(steps.map(s => structuredClone(s)));
      const theirs = shareSnapshots(steps.map(s => structuredClone(s)));
      expect(shape(mine)).toBe(shape(theirs));
      // and it does share: the result is far smaller than the steps
      expect(shape(mine).length).toBeLessThan(shape(steps).length);
    }, 30_000);
  }
});
