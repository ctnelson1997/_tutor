/**
 * Node differential suite (#42): every corpus case (./cases, plus the shipped
 * examples) runs through JSTutor as the app runs it (instrumented, in a worker,
 * the reply taken when the worker posts it) and is compared with what Node
 * did, as recorded in the committed goldens. Nothing beyond the dev
 * dependencies is needed to run it.
 *
 * Each case gets one test per check (see harness.ts): output, ending,
 * coverage, final-state, and the invariants refs, lines, names, reachable and
 * frames.
 *
 * Checks listed in known-failures.json run as it.fails(): the suite stays green
 * while they fail, and turns red when a fix makes one pass — delete the entry then.
 * A check that newly fails needs a fix or an entry naming the issue that fixes it.
 *
 * Add a case: put <name>.js in cases/<category>/, run
 * `npm run test:js:golden -- <category>/<name>` with Node 24, commit both.
 * For a readable report of every difference: npx tsx scripts/js-diff.ts [filter]
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { WorkerMessage } from '../../../../types/snapshot';
import { findOrphanFiles, goldenIsCurrent, loadCases, readGolden, type NodeCase, type NodeGolden } from './corpus';
import {
  CHECKS,
  checkCase,
  loadKnownFailures,
  runCase,
  validateKnownFailures,
  type CaseResult,
  type CheckName,
  type KnownFailure,
  type Verdict,
} from './harness';

const cases = loadCases();
const known = loadKnownFailures();

// Runs go through a small pool: a case's tests wait for its run while the
// next cases' runs are already going, each in a worker thread of its own.
const POOL = 6;
const runs = new Map<string, Promise<WorkerMessage>>();
let next = 0;
let inFlight = 0;
function pump(): void {
  while (inFlight < POOL && next < cases.length) {
    const c = cases[next++];
    inFlight++;
    const golden = readGolden(c);
    if (!golden) continue;
    runs.set(c.id, runCase(c, golden).finally(() => { inFlight--; pump(); }));
  }
}
function runOf(c: NodeCase, golden: NodeGolden): Promise<WorkerMessage> {
  pump();
  if (!runs.has(c.id)) runs.set(c.id, runCase(c, golden));
  return runs.get(c.id)!;
}

const VERDICTS: Verdict[] = ['match', 'layout', 'wrong-output', 'wrong-state', 'error', 'compile'];
const tally = Object.fromEntries(VERDICTS.map(v => [v, 0])) as Record<Verdict, number>;
const checkFailures = Object.fromEntries(CHECKS.map(n => [n, 0])) as Record<CheckName, number>;

const knownLabel = (f: KnownFailure | undefined) => (f ? ` (known failure: ${f.issues.map(n => `#${n}`).join(', ')})` : '');

describe('Node differential corpus', () => {
  it('every case has a golden produced from its current source', () => {
    const problems = cases.flatMap(c => {
      const golden = readGolden(c);
      if (!golden) return [`${c.id}: no golden`];
      return goldenIsCurrent(c, golden) ? [] : [`${c.id}: golden is stale (the source changed)`];
    });
    expect(problems, 'run `npm run test:js:golden` with Node 24 and commit the goldens').toEqual([]);
  });

  it('has no goldens left behind by a renamed or deleted case', () => {
    expect(findOrphanFiles(cases), 'delete them, or run `npm run test:js:golden`').toEqual([]);
  });

  it('known-failures.json names real cases and checks, each with an issue and reason', () => {
    expect(validateKnownFailures(known, new Set(cases.map(c => c.id)))).toEqual([]);
  });
});

for (const c of cases) {
  const golden = readGolden(c);
  const usable = golden !== null && goldenIsCurrent(c, golden);

  describe(c.id, () => {
    // Checked once per case, shared by its tests, and released afterwards
    // (runs near the step cap hold thousands of snapshots).
    let result: Promise<CaseResult> | undefined;
    const checked = () => (result ??= runOf(c, golden!).then(reply => {
      runs.delete(c.id);
      const r = checkCase(c, golden!, reply);
      tally[r.verdict]++;
      for (const n of CHECKS) if (r.checks[n].length) checkFailures[n]++;
      return r;
    }));
    afterAll(() => { result = undefined; });

    for (const name of CHECKS) {
      const knownFailure = known[c.id]?.[name];
      const test = !usable ? it.skip : knownFailure ? it.fails : it;
      test(`${name}${knownLabel(knownFailure)}`, async () => {
        const r = await checked();
        expect(r.checks[name], `${c.id} fails the ${name} check`).toEqual([]);
      }, 30_000);
    }
  });
}

afterAll(() => {
  const total = VERDICTS.reduce((n, v) => n + tally[v], 0);
  if (total === 0) return;
  console.log([
    'Node differential summary (JSTutor vs. Node 24):',
    `  programs: ${tally.match} match · ${tally.layout} layout only · ${tally['wrong-output']} wrong output, no error · ${tally['wrong-state']} wrong steps or state, no error · ${tally.error} fail · ${tally.compile} parse errors differ  (of ${total})`,
    `  failing checks: ${CHECKS.map(n => `${n} ${checkFailures[n]}`).join(' · ')}`,
  ].join('\n'));
});
