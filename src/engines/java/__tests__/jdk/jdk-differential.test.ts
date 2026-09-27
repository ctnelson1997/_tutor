/**
 * JDK differential suite: every corpus case (./cases, plus the shipped examples)
 * runs through JavaInterpreter and is compared with what real `java` (JDK 21)
 * did, as recorded in the committed goldens. No JDK is needed to run it.
 *
 * Each case gets:
 *   - "matches real Java": the same stdout, and the run ends the same way —
 *     normally, with the same uncaught exception class, or (for programs javac
 *     rejects) with an error before anything runs;
 *   - one test per enforced snapshot invariant (see INVARIANTS in harness.ts).
 *
 * Checks listed in known-failures.json run as it.fails(): the suite stays green
 * while they fail, and turns red when a fix makes one pass — delete the entry then.
 * A check that newly fails needs a fix or an entry naming the issue that fixes it.
 *
 * Add a case: put <name>.java (and optionally <name>.stdin) in cases/<category>/,
 * run `npm run test:java:golden -- <category>/<name>` with JDK 21, commit both.
 * For a readable report of every difference: npx tsx scripts/java-diff.ts [filter]
 */
import { afterAll, describe, expect, it } from 'vitest';
import { findOrphanFiles, goldenIsCurrent, loadCases, readGolden } from './corpus';
import {
  ENFORCED_INVARIANTS,
  checkInvariant,
  compareOutput,
  loadKnownFailures,
  runInterpreter,
  validateKnownFailures,
  type InterpreterRun,
  type InvariantName,
  type KnownFailure,
  type OutcomeKind,
} from './harness';

const cases = loadCases();
const known = loadKnownFailures();

const tally = {
  programs: { pass: 0, wrong: 0, error: 0 } as Record<OutcomeKind, number>,
  compileErrors: { rejected: 0, total: 0 },
  invariants: Object.fromEntries(ENFORCED_INVARIANTS.map(n => [n, 0])) as Record<InvariantName, number>,
};

const knownLabel = (f: KnownFailure | undefined) =>
  f ? ` (known failure: ${f.issues.map(n => `#${n}`).join(', ')})` : '';

describe('JDK differential corpus', () => {
  it('every case has a golden produced from its current source and stdin', () => {
    const problems = cases.flatMap(c => {
      const golden = readGolden(c);
      if (!golden) return [`${c.id}: no golden`];
      return goldenIsCurrent(c, golden) ? [] : [`${c.id}: golden is stale (the source or stdin changed)`];
    });
    expect(problems, 'run `npm run test:java:golden` with JDK 21 and commit the goldens').toEqual([]);
  });

  it('has no goldens or stdin files left behind by a renamed or deleted case', () => {
    expect(findOrphanFiles(cases), 'delete them, or run `npm run test:java:golden`').toEqual([]);
  });

  it('known-failures.json names real cases and enforced invariants, each with an issue and reason', () => {
    expect(validateKnownFailures(known, new Set(cases.map(c => c.id)))).toEqual([]);
  });
});

for (const c of cases) {
  const golden = readGolden(c);
  const usable = golden !== null && goldenIsCurrent(c, golden);

  describe(c.id, () => {
    // Run once per case, shared by its tests, and released afterwards (runs
    // near the step cap hold thousands of snapshots).
    let run: InterpreterRun | undefined;
    const result = () => (run ??= runInterpreter(c.source, c.stdin));
    afterAll(() => { run = undefined; });

    const knownOutput = known.output[c.id];
    const outputTest = !usable ? it.skip : knownOutput ? it.fails : it;
    outputTest(`matches real Java${knownOutput ? knownLabel(knownOutput) : ''}`, () => {
      const verdict = compareOutput(golden!, result());
      if (golden!.compileError !== null) {
        tally.compileErrors.total++;
        if (verdict.kind === 'pass') tally.compileErrors.rejected++;
      } else {
        tally.programs[verdict.kind]++;
      }
      expect(verdict.problems, `${c.id} differs from real Java (${verdict.kind})`).toEqual([]);
    });

    for (const name of ENFORCED_INVARIANTS) {
      const knownInvariant = known.invariants[c.id]?.[name];
      const invariantTest = !usable ? it.skip : knownInvariant ? it.fails : it;
      invariantTest(`invariant: ${name}${knownLabel(knownInvariant)}`, () => {
        const violations = checkInvariant(name, c, result());
        if (violations.length) tally.invariants[name]++;
        expect(violations, `${c.id} breaks the ${name} invariant`).toEqual([]);
      });
    }
  });
}

afterAll(() => {
  const p = tally.programs;
  const ran = p.pass + p.wrong + p.error;
  if (ran === 0 && tally.compileErrors.total === 0) return;
  const invariants = ENFORCED_INVARIANTS.map(n => `${n} ${tally.invariants[n]}`).join(' · ');
  console.log([
    'JDK differential summary (JavaInterpreter vs. real java, JDK 21):',
    `  programs:        ${p.pass} pass · ${p.wrong} wrong output, no error · ${p.error} error  (of ${ran})`,
    `  compile errors:  ${tally.compileErrors.rejected} of ${tally.compileErrors.total} rejected before running`,
    `  invariants:      failing cases: ${invariants}`,
  ].join('\n'));
});
