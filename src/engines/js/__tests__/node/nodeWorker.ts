/**
 * A Web Worker for Node (#42): the executor's `WorkerLike`, backed by a
 * `worker_threads` thread whose global scope is made to look like a browser
 * worker's. The thread runs the executor's own WORKER_SOURCE, so the suite
 * takes the reply exactly when the real worker sends it, and terminating the
 * thread drops whatever the program left pending, as terminating a Web Worker
 * does.
 *
 * The program runs in the thread's own realm, as a browser worker's program
 * runs in the worker's, so what V8 does per realm happens as in a browser
 * (Error.prepareStackTrace, which Node ignores inside a vm context;
 * structuredClone's results). Node's own globals are removed (`process`,
 * `Buffer`, `global`, `setImmediate`, `clearImmediate`), and the browser's
 * are added: `self === globalThis`, timers with numeric ids, `postMessage`,
 * `addEventListener` for `error` and `unhandledrejection` (an uncaught
 * exception in a callback that no listener prevents reaches the parent's
 * `onerror`, as in a browser), and a `console` whose output goes nowhere, like
 * the worker's DevTools console, which JSTutor never shows.
 */
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
import { WORKER_SOURCE, type SyntaxProblem, type WorkerLike } from '../../executor';
import type { WorkerMessage } from '../../../../types/snapshot';

// (In a function: its own names must not become the program's globals.)
const BOOTSTRAP = String.raw`(() => {
const { parentPort, workerData } = require('node:worker_threads');
const proc = process;
const nodeSetTimeout = setTimeout, nodeClearTimeout = clearTimeout, nodeSetInterval = setInterval, nodeClearInterval = clearInterval;
const g = globalThis;
for (const name of ['process', 'require', 'module', 'exports', '__filename', '__dirname', 'setImmediate', 'clearImmediate']) {
  try { delete g[name]; } catch (e) { /* not configurable */ }
}
const listeners = { error: [], unhandledrejection: [] };

function makeEvent(type, fields) {
  return Object.assign({ type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, fields);
}
// Returns true when a listener (or on<type>) prevented the default.
function dispatch(event) {
  for (const fn of (listeners[event.type] || []).slice()) fn.call(g, event);
  const handler = g['on' + event.type];
  if (typeof handler === 'function' && handler.call(g, event) === true) event.preventDefault();
  return event.defaultPrevented;
}
function callback(fn, args) {
  try {
    if (typeof fn === 'function') fn.apply(undefined, args);
  } catch (err) {
    const message = err instanceof Error || (err && typeof err === 'object' && 'message' in err) ? err.message : String(err);
    if (!dispatch(makeEvent('error', { error: err, message }))) throw err;
  }
}

let nextId = 1;
const timers = new Map();
const noop = () => {};
const api = {
  self: g,
  setTimeout(fn, ms, ...args) {
    const id = nextId++;
    timers.set(id, nodeSetTimeout(() => { timers.delete(id); callback(fn, args); }, ms));
    return id;
  },
  clearTimeout(id) { const t = timers.get(id); if (t !== undefined) { nodeClearTimeout(t); timers.delete(id); } },
  setInterval(fn, ms, ...args) {
    const id = nextId++;
    timers.set(id, nodeSetInterval(() => callback(fn, args), ms));
    return id;
  },
  clearInterval(id) { const t = timers.get(id); if (t !== undefined) { nodeClearInterval(t); timers.delete(id); } },
  console: Object.fromEntries(['log', 'info', 'debug', 'warn', 'error', 'trace', 'dir', 'dirxml', 'table', 'group',
    'groupCollapsed', 'groupEnd', 'count', 'countReset', 'assert', 'time', 'timeEnd', 'timeLog', 'clear'].map(m => [m, noop])),
  postMessage(message) { parentPort.postMessage(message); },
  addEventListener(type, fn) { if (typeof fn === 'function') (listeners[type] ||= []).push(fn); },
  removeEventListener(type, fn) { const l = listeners[type]; if (l && l.includes(fn)) l.splice(l.indexOf(fn), 1); },
};
for (const [key, value] of Object.entries(api)) {
  Object.defineProperty(g, key, { value, writable: true, configurable: true, enumerable: false });
}

// A rejection nothing handled: the browser's unhandledrejection event (it never stops the worker).
proc.on('unhandledRejection', (reason, promise) => { dispatch(makeEvent('unhandledrejection', { reason, promise })); });

(0, eval)(workerData.workerSource);
parentPort.on('message', data => {
  const handler = g.onmessage;
  if (typeof handler === 'function') handler.call(g, { data });
});
})();
`;

/** The text a browser gives a worker's uncaught exception: `Uncaught TypeError: …`. */
function uncaughtText(e: unknown): string {
  if (e instanceof Error) return `Uncaught ${e.name}: ${e.message}`;
  return `Uncaught ${String(e)}`;
}

/** A fresh Web Worker running the executor's worker script, in a Node thread. */
export function nodeWorker(): WorkerLike {
  const thread = new Worker(BOOTSTRAP, { eval: true, workerData: { workerSource: WORKER_SOURCE } });
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: message => thread.postMessage(message),
    terminate: () => { void thread.terminate(); },
  };
  thread.on('message', (data: WorkerMessage) => worker.onmessage?.({ data } as MessageEvent<WorkerMessage>));
  thread.on('error', (e: unknown) => worker.onerror?.({ message: uncaughtText(e) } as ErrorEvent));
  return worker;
}

/**
 * What the engine says of a program that doesn't parse, as a browser
 * worker's error event tells it (#50): Node's vm compiles the program as a
 * script, and V8's SyntaxError gives the message, and its stack the line and
 * a caret under the column.
 */
export async function nodeCheckScript(source: string): Promise<SyntaxProblem | null> {
  try {
    new vm.Script(source, { filename: 'main.js' });
    return null;
  } catch (e) {
    const err = e as Error;
    const stack = String(err.stack ?? '');
    const at = /main\.js:(\d+)\n[^\n]*\n( *)\^/.exec(stack);
    // (At the end of the input there is no caret, only the line.)
    const line = at ? Number(at[1]) : Number(/main\.js:(\d+)/.exec(stack)?.[1]) || null;
    return { message: err.message, line, column: at ? at[2].length : null };
  }
}
