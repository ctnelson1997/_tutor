/**
 * Regenerate the JDK differential goldens (src/engines/java/__tests__/jdk/):
 * run every corpus case through real `java` and record what it did.
 *
 *   npm run test:java:golden                 # every case
 *   npm run test:java:golden -- core/num     # only cases whose id contains "core/num"
 *   npm run test:java:golden -- --check      # write nothing; exit 1 if any golden is stale
 *
 * Requires JDK 21: `java` on PATH, or JAVA_BIN=/path/to/java. Other versions are
 * refused so goldens stay stable. `npm test` itself never needs a JDK.
 *
 * Each case runs as `java Main.java` (the single-file source launcher, which
 * runs the first top-level class) in its own temp directory, so stack traces
 * and javac diagnostics name `Main.java` whatever machine produced them.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  CASES_DIR,
  COMPILE_ERRORS_CATEGORY,
  caseHash,
  findOrphanFiles,
  formatGolden,
  goldenFromJavaRun,
  loadCases,
  type JdkCase,
  type JdkGolden,
} from '../src/engines/java/__tests__/jdk/corpus';

const JAVA = process.env.JAVA_BIN || 'java';
const REQUIRED_MAJOR = 21;
const TIMEOUT_MS = 30_000;
// -Xss4m and the UTF-8 streams match the analysis that seeded the corpus (#3, #4).
const JAVA_ARGS = ['-Xss4m', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', 'Main.java'];

interface JavaRun { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }

function checkJavaVersion(): string {
  const r = spawnSync(JAVA, ['-version'], { encoding: 'utf8' });
  if (r.error) {
    console.error(`Could not run "${JAVA}": ${r.error.message}\nInstall JDK ${REQUIRED_MAJOR}, or set JAVA_BIN to its java executable.`);
    process.exit(1);
  }
  const banner = (r.stderr || r.stdout).split(/\r?\n/)[0];
  const major = Number(/version "(\d+)/.exec(banner)?.[1]);
  if (major !== REQUIRED_MAJOR) {
    console.error(`Goldens must come from JDK ${REQUIRED_MAJOR}, but "${JAVA}" is: ${banner}\nSet JAVA_BIN to a JDK ${REQUIRED_MAJOR} java executable.`);
    process.exit(1);
  }
  return banner;
}

function runJava(c: JdkCase, dir: string): Promise<JavaRun> {
  writeFileSync(join(dir, 'Main.java'), c.source);
  return new Promise((resolve, reject) => {
    const child = spawn(JAVA, JAVA_ARGS, { cwd: dir });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => err.push(d));
    child.stdin.on('error', () => { /* the program exited without reading its input */ });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        exitCode: code,
        timedOut,
      });
    });
    child.stdin.end(c.stdin);
  });
}

/** Run cases through java, `limit` at a time, each worker in its own temp dir. */
async function runAll(cases: JdkCase[], limit: number): Promise<Map<string, JavaRun>> {
  const results = new Map<string, JavaRun>();
  const queue = [...cases];
  let done = 0;
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jdk-golden-'));
    try {
      for (let c = queue.shift(); c; c = queue.shift()) {
        results.set(c.id, await runJava(c, dir));
        if (++done % 25 === 0 || done === cases.length) process.stdout.write(`  ran ${done}/${cases.length}\n`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));
  return results;
}

/** Why a golden can't be trusted, or null if it's fine. */
function validate(c: JdkCase, run: JavaRun, golden: JdkGolden): string | null {
  if (run.timedOut) return `timed out after ${TIMEOUT_MS / 1000}s (infinite loop, or waiting on stdin?)`;
  const expectsCompileError = c.category === COMPILE_ERRORS_CATEGORY;
  if (expectsCompileError && golden.compileError === null) {
    return `compiled, but cases in ${COMPILE_ERRORS_CATEGORY}/ must be rejected by javac`;
  }
  if (!expectsCompileError && golden.compileError !== null) {
    return `doesn't compile (only ${COMPILE_ERRORS_CATEGORY}/ cases may fail to compile):\n${golden.compileError}`;
  }
  // e.g. "error: can't find main(String[]) method in class: Helper" when main's class isn't first.
  // (A bare non-zero exit with clean stderr is System.exit(n), which is fine.)
  const launcherError = /^error: .*$/m.exec(golden.stderr);
  if (golden.exitCode !== 0 && golden.exception === null && golden.compileError === null && launcherError) {
    return `the source launcher failed: ${launcherError[0]} (the class with main must come first)`;
  }
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const filters = args.filter(a => !a.startsWith('--'));

  const banner = checkJavaVersion();
  const all = loadCases();
  const cases = filters.length ? all.filter(c => filters.some(f => c.id.includes(f))) : all;
  if (cases.length === 0) {
    console.error(`No cases match ${filters.join(', ')}`);
    process.exit(1);
  }
  console.log(`${check ? 'Checking' : 'Generating'} ${cases.length} golden(s) with ${banner}`);

  const runs = await runAll(cases, Math.max(1, Math.min(8, availableParallelism())));

  const problems: string[] = [];
  const stale: string[] = [];
  let written = 0;
  for (const c of cases) {
    const run = runs.get(c.id)!;
    const golden = goldenFromJavaRun(run, caseHash(c.source, c.stdin));
    const problem = validate(c, run, golden);
    if (problem) { problems.push(`${c.id}: ${problem}`); continue; }
    const text = formatGolden(golden);
    const current = existsSync(c.goldenPath) ? readFileSync(c.goldenPath, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current === text) continue;
    if (check) { stale.push(c.id); continue; }
    mkdirSync(dirname(c.goldenPath), { recursive: true });
    writeFileSync(c.goldenPath, text);
    written++;
  }

  // A full run also deletes goldens whose case was renamed or deleted. An orphaned
  // .stdin is hand-written input, so it's reported rather than deleted.
  const orphans = filters.length ? [] : findOrphanFiles(all);
  const orphanGoldens = orphans.filter(o => o.endsWith('.golden.json'));
  const orphanStdin = orphans.filter(o => o.endsWith('.stdin'));
  if (!check) for (const o of orphanGoldens) unlinkSync(join(CASES_DIR, o));

  if (check) {
    console.log(`${cases.length - stale.length - problems.length} up to date, ${stale.length} stale or missing, ${orphanGoldens.length} orphaned golden(s)`);
    for (const id of stale) console.log(`  stale: ${id}`);
    for (const o of orphanGoldens) console.log(`  orphan: ${o}`);
  } else {
    console.log(`${written} written, ${cases.length - written - problems.length} unchanged, ${orphanGoldens.length} orphaned golden(s) removed`);
  }
  for (const p of problems) console.error(`  ERROR ${p}`);
  for (const o of orphanStdin) console.error(`  ERROR ${o}: no matching .java file (rename or delete it)`);
  if (problems.length || orphanStdin.length || (check && (stale.length || orphanGoldens.length))) process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
