/**
 * Report how PyTutor compares with CPython 3.12 on the CPython differential
 * corpus (#29): each failing check with its problems and its known-failure
 * issue, and a summary as #28 counts it. Uses the committed goldens.
 *
 *   npx tsx scripts/py-diff.ts                       # every case
 *   npx tsx scripts/py-diff.ts realistic/ oop/       # cases whose id contains any filter
 *   npx tsx scripts/py-diff.ts --passing             # also list passing cases
 *   npx tsx scripts/py-diff.ts --issue=33            # only checks whose known failure names #33
 *   npx tsx scripts/py-diff.ts --prune               # also delete known-failures.json entries that now pass
 *
 * The same checks run in `npm test` (cpython-differential.test.ts); this is the
 * readable view for working on a fix.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { KNOWN_FAILURES_PATH, goldenIsCurrent, loadCases, readGolden, type PyCase } from '../src/engines/py/__tests__/cpython/corpus';
import { CHECKS, RunnerPool, checkCase, loadKnownFailures, runCase, type CaseResult, type KnownFailure, type RunOutcome, type Verdict } from '../src/engines/py/__tests__/cpython/harness';

const args = process.argv.slice(2);
const showPassing = args.includes('--passing');
const prune = args.includes('--prune');
const issueFilter = args.find(a => a.startsWith('--issue='))?.slice('--issue='.length);
const filters = args.filter(a => !a.startsWith('--'));

const known = loadKnownFailures();
const cases = loadCases().filter(c => filters.length === 0 || filters.some(f => c.id.includes(f)));
const tag = (f: KnownFailure | undefined) => (f ? `[known: ${f.issues.map(n => '#' + n).join(', ')}]` : '[NEW]');

const VERDICTS: Verdict[] = ['match', 'wrong-output', 'wrong-state', 'error', 'compile'];
const LABELS: Record<Verdict, string> = {
  match: 'match', 'wrong-output': 'wrong output, no error', 'wrong-state': 'wrong steps or state, no error',
  error: 'fails', compile: 'compile error differs',
};
const counts = Object.fromEntries(VERDICTS.map(v => [v, 0])) as Record<Verdict, number>;
const checkFailures = Object.fromEntries(CHECKS.map(n => [n, 0])) as Record<string, number>;
const surprises: string[] = [];
const nowPassing: [string, string][] = [];

function report(c: PyCase, outcome: RunOutcome, result: CaseResult): void {
  counts[result.verdict]++;
  const lines: string[] = [];
  for (const name of CHECKS) {
    const problems = result.checks[name];
    const k = known[c.id]?.[name];
    if (problems.length) {
      checkFailures[name]++;
      if (!k) surprises.push(`${c.id}: ${name} fails but isn't in known-failures.json`);
      if (issueFilter && !k?.issues.includes(Number(issueFilter))) continue;
      lines.push(`  ${name.padEnd(11)} ${tag(k)}`);
      lines.push(...problems.map(p => `      ${p}`));
    } else if (k) {
      surprises.push(`${c.id}: ${name} now passes; remove it from known-failures.json`);
      nowPassing.push([c.id, name]);
    }
  }
  const { reply } = outcome;
  const steps = reply.type === 'result' ? `${reply.snapshots.length} steps` : 'no steps';
  const time = `${(outcome.cpuMs / 1000).toFixed(1)} s`;
  if (lines.length) console.log(`${c.id}  (${LABELS[result.verdict]}, ${steps}, ${time})\n${lines.join('\n')}`);
  else if (showPassing) console.log(`ok   ${c.id}`);
}

async function main(): Promise<void> {
  const pool = new RunnerPool();
  try {
    const usable = cases.filter(c => {
      const golden = readGolden(c);
      if (golden && goldenIsCurrent(c, golden)) return true;
      console.log(`SKIP ${c.id}: golden is ${golden ? 'stale' : 'missing'}; run npm run test:py:golden`);
      return false;
    });
    // Run in parallel, report in order.
    const runs = usable.map(c => runCase(pool, c));
    for (const [i, c] of usable.entries()) {
      const outcome = await runs[i];
      report(c, outcome, checkCase(c, readGolden(c)!, outcome));
    }
  } finally {
    pool.close();
  }

  const total = VERDICTS.reduce((n, v) => n + counts[v], 0);
  console.log(`\n== ${VERDICTS.map(v => `${counts[v]} ${LABELS[v]}`).join(' · ')}  (${total} programs) ==`);
  console.log(`== failing checks: ${CHECKS.map(n => `${n} ${checkFailures[n]}`).join(' · ')} ==`);
  if (prune && nowPassing.length) {
    const doc = JSON.parse(readFileSync(KNOWN_FAILURES_PATH, 'utf8')) as { failures: Record<string, Record<string, unknown>> };
    for (const [id, name] of nowPassing) {
      delete doc.failures[id]?.[name];
      if (doc.failures[id] && Object.keys(doc.failures[id]).length === 0) delete doc.failures[id];
    }
    writeFileSync(KNOWN_FAILURES_PATH, JSON.stringify(doc, null, 2) + '\n');
    console.log(`\npruned ${nowPassing.length} known failure(s) that now pass`);
    surprises.splice(0, surprises.length, ...surprises.filter(x => !x.includes('now passes')));
  }
  if (surprises.length && !issueFilter) {
    console.log(`\nknown-failures.json is out of date:\n${surprises.map(s => `  ${s}`).join('\n')}`);
    process.exitCode = 1;
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
