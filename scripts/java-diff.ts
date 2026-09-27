/**
 * Report how JavaInterpreter compares with real Java on the JDK differential
 * corpus: each failing case's differences, its known-failure issue, and a
 * summary. Uses the committed goldens, so no JDK is needed.
 *
 *   npx tsx scripts/java-diff.ts                 # every case
 *   npx tsx scripts/java-diff.ts core/num oop/   # cases whose id contains any filter
 *   npx tsx scripts/java-diff.ts --passing       # also list passing cases
 *
 * The same checks run in `npm test` (jdk-differential.test.ts); this is the
 * readable view for working on a fix.
 */
import { goldenIsCurrent, loadCases, readGolden } from '../src/engines/java/__tests__/jdk/corpus';
import {
  ENFORCED_INVARIANTS,
  INVARIANTS,
  checkInvariant,
  compareOutput,
  loadKnownFailures,
  runInterpreter,
  type InvariantName,
  type KnownFailure,
  type OutcomeKind,
} from '../src/engines/java/__tests__/jdk/harness';

const args = process.argv.slice(2);
const showPassing = args.includes('--passing');
const filters = args.filter(a => !a.startsWith('--'));

const known = loadKnownFailures();
const cases = loadCases().filter(c => filters.length === 0 || filters.some(f => c.id.includes(f)));
const tag = (f: KnownFailure | undefined) => (f ? `[known: ${f.issues.map(n => '#' + n).join(', ')}]` : '[NEW]');

const counts: Record<OutcomeKind, number> = { pass: 0, wrong: 0, error: 0 };
const compile = { rejected: 0, total: 0 };
const invariantFailures = Object.fromEntries(INVARIANTS.map(n => [n, 0])) as Record<InvariantName, number>;
const surprises: string[] = [];

for (const c of cases) {
  const golden = readGolden(c);
  if (!golden || !goldenIsCurrent(c, golden)) {
    console.log(`SKIP ${c.id}: golden is ${golden ? 'stale' : 'missing'}; run npm run test:java:golden`);
    continue;
  }
  const run = runInterpreter(c.source, c.stdin);
  const verdict = compareOutput(golden, run);
  const knownOutput = known.output[c.id];
  if (golden.compileError !== null) {
    compile.total++;
    if (verdict.kind === 'pass') compile.rejected++;
  } else {
    counts[verdict.kind]++;
  }

  const lines: string[] = [];
  if (verdict.kind !== 'pass') {
    const label = verdict.kind === 'wrong' ? 'wrong output, no error' : 'error';
    lines.push(`FAIL ${c.id}  ${tag(knownOutput)}  (${label}, ${run.snapshots.length} steps)`);
    lines.push(...verdict.problems.map(p => `     ${p}`));
    if (!knownOutput) surprises.push(`${c.id}: output fails but isn't in known-failures.json`);
  } else if (knownOutput) {
    surprises.push(`${c.id}: output now matches real Java; remove it from known-failures.json`);
  }

  for (const name of INVARIANTS) {
    const violations = checkInvariant(name, c, run);
    const enforced = ENFORCED_INVARIANTS.includes(name);
    const knownInv = known.invariants[c.id]?.[name];
    if (violations.length) {
      invariantFailures[name]++;
      if (!enforced) continue; // reported in the summary only
      lines.push(`INV  ${c.id}  ${name}  ${tag(knownInv)}`);
      lines.push(...violations.map(v => `     ${v}`));
      if (!knownInv) surprises.push(`${c.id}: invariant ${name} fails but isn't in known-failures.json`);
    } else if (knownInv) {
      surprises.push(`${c.id}: invariant ${name} now holds; remove it from known-failures.json`);
    }
  }

  if (lines.length) console.log(lines.join('\n'));
  else if (showPassing) console.log(`ok   ${c.id}`);
}

const programs = counts.pass + counts.wrong + counts.error;
console.log(`\n== ${counts.pass} pass · ${counts.wrong} wrong output, no error · ${counts.error} error  (${programs} programs) ==`);
console.log(`== compile-error cases rejected before running: ${compile.rejected}/${compile.total} ==`);
console.log(`== invariant failures: ${INVARIANTS.map(n => `${n} ${invariantFailures[n]}${ENFORCED_INVARIANTS.includes(n) ? '' : ' (not enforced yet)'}`).join(' · ')} ==`);
if (surprises.length) {
  console.log(`\nknown-failures.json is out of date:\n${surprises.map(s => `  ${s}`).join('\n')}`);
  process.exitCode = 1;
}
