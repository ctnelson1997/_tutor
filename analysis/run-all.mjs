// Runs every corpus case of one language in both modes, 6 processes at a time.
// Usage: node run-all.mjs <py|js> [filter] [--force]
// Writes results/<lang>/<category>__<name>.<mode>.json; a run past its timeout is { timeout: true }.
import { spawn } from 'node:child_process';
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [lang, ...rest] = process.argv.slice(2);
const force = rest.includes('--force');
const filter = rest.find(a => !a.startsWith('--')) ?? '';
const ext = lang === 'py' ? '.py' : '.js';
const casesDir = join(here, lang, 'cases');
const outDir = join(here, 'results', lang);
mkdirSync(outDir, { recursive: true });

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith(ext) ? [join(dir, d.name)] : []);
}
const files = walk(casesDir).filter(f => relative(casesDir, f).replace(/\\/g, '/').includes(filter)).sort();
const TIMEOUT = { golden: 25000, traced: 25000 };

const jobs = [];
for (const file of files) {
  const id = relative(casesDir, file).replace(/\\/g, '/').replace(ext, '');
  for (const mode of ['golden', 'traced']) {
    const out = join(outDir, `${id.replace('/', '__')}.${mode}.json`);
    const stdin = file.replace(ext, '.stdin');
    const newest = Math.max(statSync(file).mtimeMs, existsSync(stdin) ? statSync(stdin).mtimeMs : 0,
      statSync(join(here, `${lang}-case.mjs`)).mtimeMs);
    if (!force && existsSync(out) && statSync(out).mtimeMs > newest) continue;
    jobs.push({ id, mode, file, out });
  }
}

let done = 0;
async function run(job) {
  await new Promise(resolve => {
    const child = spawn(process.execPath, [join(here, `${lang}-case.mjs`), job.mode, job.file, job.out], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { if (stderr.length < 4000) stderr += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); writeFileSync(job.out, JSON.stringify({ mode: job.mode, timeout: true })); }, TIMEOUT[job.mode]);
    child.on('exit', code => {
      clearTimeout(timer);
      if (code !== 0 && code !== null && !existsSync(job.out)) writeFileSync(job.out, JSON.stringify({ mode: job.mode, crashed: true, stderr }));
      resolve();
    });
  });
  if (++done % 25 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`);
}

const queue = [...jobs];
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await run(queue.shift()); }));
console.log(`${files.length} cases, ${jobs.length} runs`);
