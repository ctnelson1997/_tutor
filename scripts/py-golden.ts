/**
 * Regenerate the CPython differential goldens (src/engines/py/__tests__/cpython/):
 * run every corpus case in CPython 3.12 and record what it did (#29).
 *
 *   npm run test:py:golden                  # every case
 *   npm run test:py:golden -- realistic/    # only cases whose id contains "realistic/"
 *   npm run test:py:golden -- --check       # write nothing; exit 1 if any golden is stale
 *
 * CPython is Pyodide under Node, from the `pyodide` dev dependency, which must
 * be the version PyTutor ships (PYODIDE_VERSION); others are refused, so goldens
 * stay stable. `npm test` itself only reads the goldens.
 *
 * Each case runs in a process of its own (this script with --record <id>, which
 * also takes a .py file): a fresh interpreter, traced, then once more untraced to
 * check that the reference trace doesn't change what the program does.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { version } from 'pyodide';
import { PYODIDE_VERSION } from '../src/engines/py/run';
import {
  CASES_DIR,
  SYNTAX_ERRORS_CATEGORY,
  caseHash,
  findOrphanFiles,
  formatGolden,
  loadCases,
  type PyCase,
  type PyGolden,
} from '../src/engines/py/__tests__/cpython/corpus';
import { recordGolden } from '../src/engines/py/__tests__/cpython/record';

const TIMEOUT_MS = 60_000;
const self = fileURLToPath(import.meta.url);

function checkPyodideVersion(): void {
  if (version !== PYODIDE_VERSION) {
    console.error(`Goldens must come from Pyodide ${PYODIDE_VERSION} (what PyTutor loads), but the dev dependency is ${version}.`);
    process.exit(1);
  }
}

/** Child mode: record one case (by id, or a .py file with an optional .stdin beside it) and print its golden as JSON. */
async function recordOne(target: string): Promise<void> {
  let source: string;
  let stdin: string | null;
  if (target.endsWith('.py') && existsSync(target)) {
    source = readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    const stdinPath = target.replace(/\.py$/, '.stdin');
    stdin = existsSync(stdinPath) ? readFileSync(stdinPath, 'utf8').replace(/\r\n/g, '\n') : null;
  } else {
    const c = loadCases().find(x => x.id === target);
    if (!c) throw new Error(`no case ${target}`);
    ({ source, stdin } = c);
  }
  const { golden, problem } = await recordGolden(source, stdin);
  const out: PyGolden & { problem?: string } = { ...golden, sourceSha256: caseHash(source, stdin) };
  if (problem) out.problem = problem;
  process.stdout.write(JSON.stringify(out), () => process.exit(0));
}

function runChild(c: PyCase): Promise<PyGolden & { problem?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', self, '--record', c.id], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => err.push(d));
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      const text = Buffer.concat(out).toString('utf8');
      if (code !== 0 || !text) {
        reject(new Error(`exit ${code}: ${Buffer.concat(err).toString('utf8').slice(0, 800)}`));
        return;
      }
      resolve(JSON.parse(text) as PyGolden & { problem?: string });
    });
  });
}

/** Why a golden can't be trusted, or null if it's fine. */
function validate(c: PyCase, golden: PyGolden & { problem?: string }): string | null {
  if (golden.problem) return golden.problem;
  const expectsSyntaxError = c.category === SYNTAX_ERRORS_CATEGORY;
  if (expectsSyntaxError && golden.compileError === null) return `compiled, but cases in ${SYNTAX_ERRORS_CATEGORY}/ must not`;
  if (!expectsSyntaxError && golden.compileError !== null) {
    return `doesn't compile (only ${SYNTAX_ERRORS_CATEGORY}/ cases may): ${golden.compileError.class}: ${golden.compileError.msg} (line ${golden.compileError.line})`;
  }
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const recordIndex = args.indexOf('--record');
  if (recordIndex >= 0) { await recordOne(args[recordIndex + 1]); return; }

  checkPyodideVersion();
  const check = args.includes('--check');
  const filters = args.filter(a => !a.startsWith('--'));
  const all = loadCases();
  const cases = filters.length ? all.filter(c => filters.some(f => c.id.includes(f))) : all;
  if (cases.length === 0) {
    console.error(`No cases match ${filters.join(', ')}`);
    process.exit(1);
  }
  console.log(`${check ? 'Checking' : 'Generating'} ${cases.length} golden(s) with Pyodide ${version}`);

  const problems: string[] = [];
  const stale: string[] = [];
  let written = 0;
  let done = 0;
  const queue = [...cases];
  await Promise.all(Array.from({ length: Math.min(8, availableParallelism(), queue.length) }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      let golden: PyGolden & { problem?: string };
      try {
        golden = await runChild(c);
      } catch (e) {
        problems.push(`${c.id}: ${(e as Error).message}`);
        continue;
      }
      if (++done % 25 === 0 || done === cases.length) process.stdout.write(`  ran ${done}/${cases.length}\n`);
      const problem = validate(c, golden);
      if (problem) { problems.push(`${c.id}: ${problem}`); continue; }
      const text = formatGolden(golden);
      const current = existsSync(c.goldenPath) ? readFileSync(c.goldenPath, 'utf8').replace(/\r\n/g, '\n') : null;
      if (current === text) continue;
      if (check) { stale.push(c.id); continue; }
      mkdirSync(dirname(c.goldenPath), { recursive: true });
      writeFileSync(c.goldenPath, text);
      written++;
    }
  }));

  // A full run also deletes goldens whose case was renamed or deleted.
  const orphans = filters.length ? [] : findOrphanFiles(all).filter(o => o.endsWith('.golden.json'));
  if (!check) for (const o of orphans) unlinkSync(join(CASES_DIR, o));

  if (check) {
    console.log(`${cases.length - stale.length - problems.length} up to date, ${stale.length} stale or missing, ${orphans.length} orphaned golden(s)`);
    for (const id of stale.sort()) console.log(`  stale: ${id}`);
    for (const o of orphans) console.log(`  orphan: ${o}`);
  } else {
    console.log(`${written} written, ${cases.length - written - problems.length} unchanged, ${orphans.length} orphaned golden(s) removed`);
  }
  for (const p of problems.sort()) console.error(`  ERROR ${p}`);
  if (problems.length || (check && (stale.length || orphans.length))) process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
