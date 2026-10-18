/**
 * Regenerate the Node differential goldens (src/engines/js/__tests__/node/):
 * run every corpus case in Node and record what it did (#42).
 *
 *   npm run test:js:golden                 # every case
 *   npm run test:js:golden -- async/       # only cases whose id contains "async/"
 *   npm run test:js:golden -- --check      # write nothing; exit 1 if any golden is stale
 *
 * Goldens must come from Node 24 (NODE_MAJOR); other versions are refused so
 * goldens stay stable. `npm test` itself only reads them.
 *
 * Each case runs in a process of its own (this script with --record <id>, which
 * also takes a .js file), so unhandled rejections and V8's coverage belong to
 * that case alone.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASES_DIR,
  NODE_MAJOR,
  SYNTAX_ERRORS_CATEGORY,
  caseHash,
  findOrphanFiles,
  formatGolden,
  loadCases,
  type NodeCase,
  type NodeGolden,
} from '../src/engines/js/__tests__/node/corpus';
import { recordGolden } from '../src/engines/js/__tests__/node/record';

const TIMEOUT_MS = 30_000;
const self = fileURLToPath(import.meta.url);

function checkNodeVersion(): void {
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== NODE_MAJOR) {
    console.error(`Goldens must come from Node ${NODE_MAJOR}, but this is Node ${process.versions.node}.`);
    process.exit(1);
  }
}

/** Child mode: record one case (by id, or a .js file) and print its golden as JSON. */
async function recordOne(target: string): Promise<void> {
  const source = target.endsWith('.js') && existsSync(target)
    ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n')
    : loadCases().find(x => x.id === target)?.source;
  if (source === undefined) throw new Error(`no case ${target}`);
  const golden: NodeGolden = { ...(await recordGolden(source)), sourceSha256: caseHash(source) };
  process.stdout.write(JSON.stringify(golden), () => process.exit(0));
}

function runChild(c: NodeCase): Promise<NodeGolden> {
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
      resolve(JSON.parse(text) as NodeGolden);
    });
  });
}

/** Why a golden can't be trusted, or null if it's fine. */
function validate(c: NodeCase, golden: NodeGolden): string | null {
  const expectsSyntaxError = c.category === SYNTAX_ERRORS_CATEGORY;
  if (expectsSyntaxError && golden.compileError === null) return `parsed, but cases in ${SYNTAX_ERRORS_CATEGORY}/ must not`;
  if (!expectsSyntaxError && golden.compileError !== null) {
    return `doesn't parse (only ${SYNTAX_ERRORS_CATEGORY}/ cases may): ${golden.compileError.message} (line ${golden.compileError.line})`;
  }
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const recordIndex = args.indexOf('--record');
  if (recordIndex >= 0) { await recordOne(args[recordIndex + 1]); return; }

  checkNodeVersion();
  const check = args.includes('--check');
  const filters = args.filter(a => !a.startsWith('--'));
  const all = loadCases();
  const cases = filters.length ? all.filter(c => filters.some(f => c.id.includes(f))) : all;
  if (cases.length === 0) {
    console.error(`No cases match ${filters.join(', ')}`);
    process.exit(1);
  }
  console.log(`${check ? 'Checking' : 'Generating'} ${cases.length} golden(s) with Node ${process.versions.node}`);

  const problems: string[] = [];
  const stale: string[] = [];
  let written = 0;
  let done = 0;
  const queue = [...cases];
  await Promise.all(Array.from({ length: Math.min(8, availableParallelism(), queue.length) }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      let golden: NodeGolden;
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
  const orphans = filters.length ? [] : findOrphanFiles(all);
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
