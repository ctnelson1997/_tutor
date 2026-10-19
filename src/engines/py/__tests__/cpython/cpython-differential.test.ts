/**
 * CPython differential suite (#29): every corpus case (./cases, plus the
 * shipped examples) runs through PyTutor as the browser's worker runs it
 * (runProgram in a fresh Pyodide, runner.ts) and is compared with what CPython
 * 3.12 did, as recorded in the committed goldens. Nothing beyond the dev
 * dependencies is needed to run it.
 *
 * Each case gets one test per check (see harness.ts): output, ending,
 * traceback, steps, variables, values, final-state, and the invariants refs,
 * lines, names and reachable.
 *
 * Checks listed in known-failures.json run as it.fails(): the suite stays green
 * while they fail, and turns red when a fix makes one pass — delete the entry then.
 * A check that newly fails needs a fix or an entry naming the issue that fixes it.
 *
 * Add a case: put <name>.py (and <name>.stdin if it reads input) in
 * cases/<category>/, run `npm run test:py:golden -- <category>/<name>`, commit
 * them. For a readable report of every difference: npx tsx scripts/py-diff.ts [filter]
 */
import { afterAll, describe, expect, it } from 'vitest';
import { findOrphanFiles, goldenIsCurrent, loadCases, readGolden, type PyCase } from './corpus';
import {
  CHECKS,
  RunnerPool,
  checkCase,
  loadKnownFailures,
  runCase,
  validateKnownFailures,
  type CaseResult,
  type CheckName,
  type KnownFailure,
  type RunOutcome,
  type Verdict,
} from './harness';

const cases = loadCases();
const known = loadKnownFailures();
const usable = cases.filter(c => {
  const golden = readGolden(c);
  return golden !== null && goldenIsCurrent(c, golden);
});

// Each case runs in a fresh Pyodide in one of the pool's child processes. Runs
// start ahead of the tests that wait for them, a few at a time, so the
// replies held in memory stay few.
const pool = new RunnerPool();
const AHEAD = pool.size * 2;
const runs = new Map<string, Promise<RunOutcome>>();
let next = 0;
function pump(): void {
  while (runs.size < AHEAD && next < usable.length) {
    const c = usable[next++];
    if (!runs.has(c.id)) runs.set(c.id, runCase(pool, c));
  }
}
function runOf(c: PyCase): Promise<RunOutcome> {
  pump();
  if (!runs.has(c.id)) runs.set(c.id, runCase(pool, c));
  return runs.get(c.id)!;
}

const VERDICTS: Verdict[] = ['match', 'wrong-output', 'wrong-state', 'error', 'compile'];
const tally = Object.fromEntries(VERDICTS.map(v => [v, 0])) as Record<Verdict, number>;
const checkFailures = Object.fromEntries(CHECKS.map(n => [n, 0])) as Record<CheckName, number>;

const knownLabel = (f: KnownFailure | undefined) => (f ? ` (known failure: ${f.issues.map(n => `#${n}`).join(', ')})` : '');

describe('CPython differential corpus', () => {
  it('every case has a golden produced from its current source and stdin', () => {
    const problems = cases.flatMap(c => {
      const golden = readGolden(c);
      if (!golden) return [`${c.id}: no golden`];
      return goldenIsCurrent(c, golden) ? [] : [`${c.id}: golden is stale (the source or stdin changed)`];
    });
    expect(problems, 'run `npm run test:py:golden` and commit the goldens').toEqual([]);
  });

  it('has no goldens or stdin files left behind by a renamed or deleted case', () => {
    expect(findOrphanFiles(cases), 'delete them, or run `npm run test:py:golden`').toEqual([]);
  });

  it('known-failures.json names real cases and checks, each with an issue and reason', () => {
    expect(validateKnownFailures(known, new Set(cases.map(c => c.id)))).toEqual([]);
  });
});

for (const c of cases) {
  const golden = readGolden(c);
  const current = golden !== null && goldenIsCurrent(c, golden);

  describe(c.id, () => {
    // Checked once per case, shared by its tests, and released afterwards
    // (runs near the step cap hold thousands of snapshots).
    let result: Promise<CaseResult> | undefined;
    const checked = () => (result ??= runOf(c).then(outcome => {
      runs.delete(c.id);
      pump();
      const r = checkCase(c, golden!, outcome);
      tally[r.verdict]++;
      for (const n of CHECKS) if (r.checks[n].length) checkFailures[n]++;
      return r;
    }));
    afterAll(() => { result = undefined; });

    for (const name of CHECKS) {
      const knownFailure = known[c.id]?.[name];
      const test = !current ? it.skip : knownFailure ? it.fails : it;
      test(`${name}${knownLabel(knownFailure)}`, async () => {
        const r = await checked();
        expect(r.checks[name], `${c.id} fails the ${name} check`).toEqual([]);
      }, 120_000);
    }
  });
}

afterAll(() => {
  pool.close();
  const total = VERDICTS.reduce((n, v) => n + tally[v], 0);
  if (total === 0) return;
  console.log([
    'CPython differential summary (PyTutor vs. CPython 3.12):',
    `  programs: ${tally.match} match · ${tally['wrong-output']} wrong output, no error · ${tally['wrong-state']} wrong steps or state, no error · ${tally.error} fail · ${tally.compile} compile errors differ  (of ${total})`,
    `  failing checks: ${CHECKS.map(n => `${n} ${checkFailures[n]}`).join(' · ')}`,
  ].join('\n'));
});
