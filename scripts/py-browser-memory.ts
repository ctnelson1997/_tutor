/**
 * #79's check, in a real browser: runs programs in PyTutor's worker one after
 * another and counts the interpreters still alive (the worker's
 * WebAssembly.Memory objects after a forced garbage collection, two for each
 * Pyodide), with the worker's JS heap. A fresh interpreter per run (#35) must
 * leave as many after the 100th run as after the first: the next one, made
 * ready meanwhile (before #79's fix, every interpreter stayed). The Node suite
 * can't see this: Node has a setImmediate, so Emscripten adds no listener
 * there, and the suite's runner processes are short-lived.
 *
 *   npx tsx scripts/py-browser-memory.ts [runs]   # 100 runs by default
 *
 * It starts a Vite dev server for Python and a headless Chromium (CHROME_PATH,
 * else Playwright's Chromium, Chrome or Edge where they are usually installed;
 * a managed Chrome may refuse to run headless), drives the page over the
 * Chrome DevTools Protocol, and exits with 1 if interpreters pile up. Pyodide
 * comes from the CDN, as in the app.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const RUNS = Number(process.argv[2] ?? 100);
const MB = (n: number) => `${(n / 2 ** 20).toFixed(1)} MB`;

/** A Chrome or Chromium to run headless. */
function findChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const local = process.env.LOCALAPPDATA ?? '';
  const programs = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean) as string[];
  const candidates: string[] = [];
  // Playwright's own Chromium builds first: made to be driven.
  for (const cache of [join(local, 'ms-playwright'), join(homedir(), '.cache/ms-playwright'), join(homedir(), 'Library/Caches/ms-playwright')]) {
    if (!existsSync(cache)) continue;
    for (const dir of readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) {
      candidates.push(join(cache, dir, 'chrome-win64/chrome.exe'), join(cache, dir, 'chrome-win/chrome.exe'), join(cache, dir, 'chrome-linux/chrome'),
        join(cache, dir, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'));
    }
  }
  candidates.push(
    ...programs.map(p => join(p, 'Google/Chrome/Application/chrome.exe')),
    join(local, 'Google/Chrome/Application/chrome.exe'),
    ...programs.map(p => join(p, 'Microsoft/Edge/Application/msedge.exe')),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  );
  const found = candidates.find(p => existsSync(p));
  if (!found) throw new Error('no Chrome or Chromium found: set CHROME_PATH (npx playwright install chromium gives one)');
  return found;
}

/** Start a headless Chrome and return it with its DevTools WebSocket URL. */
function launchChrome(profile: string): Promise<{ chrome: ChildProcess; ws: string }> {
  const path = findChrome();
  const chrome = spawn(path, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((resolve, reject) => {
    let err = '';
    chrome.stderr!.on('data', (chunk: Buffer) => {
      err += chunk.toString();
      const m = /DevTools listening on (ws:\S+)/.exec(err);
      if (m) resolve({ chrome, ws: m[1] });
    });
    chrome.on('exit', code => reject(new Error(`${path} exited (${code}) before DevTools listened; set CHROME_PATH to another Chromium. ${err}`)));
  });
}

/** A protocol message or reply, read as the protocol documents it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/** A Chrome DevTools Protocol connection: commands, to a target's session or the browser, and events. */
class Cdp {
  private nextId = 0;
  private readonly pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Error) => void }>();
  private readonly listeners: ((msg: Json) => void)[] = [];
  private readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = ev => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id === undefined) return this.listeners.forEach(l => l(msg));
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(msg.error.message));
      else p?.resolve(msg.result);
    };
  }

  static connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    return new Promise((resolve, reject) => {
      ws.onopen = () => resolve(new Cdp(ws));
      ws.onerror = () => reject(new Error(`can't connect to ${url}`));
    });
  }

  send(method: string, params: object = {}, sessionId?: string): Promise<Json> {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(listener: (msg: Json) => void): void {
    this.listeners.push(listener);
  }

  close(): void {
    this.ws.close();
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'pytutor-memory-'));
const server = await createServer({ mode: 'py', logLevel: 'warn', server: { port: 5190 } });
let chrome: ChildProcess | undefined;
let cdp: Cdp | undefined;
let failed = false;
try {
  await server.listen();
  const url = server.resolvedUrls!.local[0];
  const launched = await launchChrome(profile);
  chrome = launched.chrome;
  cdp = await Cdp.connect(launched.ws);
  const c = cdp;

  const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: page } = await c.send('Target.attachToTarget', { targetId, flatten: true });
  const workers: string[] = [];
  let loaded = () => {};
  c.on(msg => {
    if (msg.sessionId === page && msg.method === 'Target.attachedToTarget') workers.push(msg.params.sessionId);
    if (msg.sessionId === page && msg.method === 'Page.loadEventFired') loaded();
  });
  await c.send('Page.enable', {}, page);
  await c.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, page);
  await new Promise<void>(resolve => {
    loaded = resolve;
    void c.send('Page.navigate', { url }, page);
  });

  const evaluate = async (expression: string, sessionId: string) => {
    const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  // The app's own executor module: the worker it made at page load.
  const run = (i: number) => evaluate(`(async () => {
    const { execute } = await import('/src/engines/py/executor.ts');
    const t0 = performance.now();
    const r = await execute('squares = [n * n for n in range(50)]\\nprint(sum(squares), ${i})', { stdin: '' });
    if (r.type !== 'result' || r.snapshots.length === 0) throw new Error(JSON.stringify(r));
    return performance.now() - t0;
  })()`, page) as Promise<number>;

  /** The live WebAssembly memories in a worker (count and bytes) and its JS heap. */
  const measureWorker = async (sessionId: string) => {
    const proto = await c.send('Runtime.evaluate', { expression: 'WebAssembly.Memory.prototype' }, sessionId);
    const { objects } = await c.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId, objectGroup: 'memory' }, sessionId);
    const found = await c.send('Runtime.callFunctionOn', {
      objectId: objects.objectId, returnByValue: true,
      functionDeclaration: 'function () { return [this.length, this.reduce((n, m) => n + m.buffer.byteLength, 0)]; }',
    }, sessionId);
    await c.send('Runtime.releaseObjectGroup', { objectGroup: 'memory' }, sessionId);
    const heap = await c.send('Runtime.getHeapUsage', {}, sessionId);
    const [count, bytes] = found.result.value as [number, number];
    return { count, bytes, heap: heap.usedSize as number };
  };
  /**
   * The page's workers together, after collecting their garbage: the app's
   * Python worker (and a second one if this import of the executor isn't the
   * app's, as after an edit under a dev server's hot reload).
   */
  const measure = async () => {
    const total = { count: 0, bytes: 0, heap: 0 };
    for (let i = 0; i < 2; i++) {
      for (const w of workers) await c.send('HeapProfiler.collectGarbage', {}, w).catch(() => {});
      await sleep(200);
    }
    for (const w of workers) {
      const m = await measureWorker(w).catch(() => null); // a worker that has ended
      if (!m) continue;
      total.count += m.count;
      total.bytes += m.bytes;
      total.heap += m.heap;
    }
    return total;
  };

  console.log(`${RUNS} runs in ${url} (Pyodide from the CDN)`);
  const firstMs = await run(1);
  const first = await measure();
  if (first.count === 0) throw new Error('no worker with a Pyodide found');
  const row = (i: number, ms: number, m: typeof first) =>
    console.log(`after run ${String(i).padStart(3)} (${ms.toFixed(0).padStart(4)} ms): ${m.count} WebAssembly memories (${MB(m.bytes)}), workers' JS heap ${MB(m.heap)}`);
  row(1, firstMs, first);
  let last = first;
  for (let i = 2; i <= RUNS; i++) {
    const ms = await run(i);
    if (i % 10 === 0 || i === RUNS) {
      last = await measure();
      row(i, ms, last);
    }
  }
  // Only the next interpreter: as many memories as after the first run.
  failed = last.count > first.count;
  console.log(failed
    ? `FAIL: ${last.count - first.count} more WebAssembly memories alive after ${RUNS} runs than after one`
    : `OK: as many WebAssembly memories alive after ${RUNS} runs as after one`);
} finally {
  cdp?.close();
  chrome?.kill();
  await server.close();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(failed ? 1 : 0);
