/**
 * A Web Worker for Node (#42): the executor's `WorkerLike`, backed by a
 * `worker_threads` thread whose global scope is built like a browser
 * worker's. The thread runs the executor's own WORKER_SOURCE, so the suite
 * takes the reply exactly when the real worker sends it, and terminating the
 * thread drops whatever the program left pending, as terminating a Web Worker
 * does.
 *
 * The global scope: JavaScript's builtins (a fresh `vm` context), `self ===
 * globalThis`, timers with numeric ids, `queueMicrotask`, `structuredClone`,
 * `MessageChannel`, `performance`, the encoding and URL classes, `atob`/`btoa`,
 * `postMessage`, `addEventListener` for `error` and `unhandledrejection` (an
 * uncaught exception in a callback that no listener prevents reaches the
 * parent's `onerror`, as in a browser), and a `console` whose output goes
 * nowhere, like the worker's DevTools console, which JSTutor never shows.
 */
import { Worker } from 'node:worker_threads';
import { WORKER_SOURCE, type WorkerLike } from '../../executor';
import { STRUCTURED_CLONE_SOURCE } from './realm';
import type { WorkerMessage } from '../../../../types/snapshot';

const BOOTSTRAP = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');

const ctx = vm.createContext({});
const g = vm.runInContext('globalThis', ctx);
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
    timers.set(id, setTimeout(() => { timers.delete(id); callback(fn, args); }, ms));
    return id;
  },
  clearTimeout(id) { const t = timers.get(id); if (t !== undefined) { clearTimeout(t); timers.delete(id); } },
  setInterval(fn, ms, ...args) {
    const id = nextId++;
    timers.set(id, setInterval(() => callback(fn, args), ms));
    return id;
  },
  clearInterval(id) { const t = timers.get(id); if (t !== undefined) { clearInterval(t); timers.delete(id); } },
  queueMicrotask(fn) { queueMicrotask(() => callback(fn, [])); },
  TextEncoder, TextDecoder, URL, URLSearchParams, atob, btoa, performance, MessageChannel, MessagePort,
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
process.on('unhandledRejection', (reason, promise) => { dispatch(makeEvent('unhandledrejection', { reason, promise })); });

vm.runInContext(workerData.structuredCloneSource, ctx);
vm.runInContext(workerData.workerSource, ctx);
parentPort.on('message', data => {
  const handler = g.onmessage;
  if (typeof handler === 'function') handler.call(g, { data });
});
`;

/** The text a browser gives a worker's uncaught exception: `Uncaught TypeError: …`. */
function uncaughtText(e: unknown): string {
  if (e instanceof Error) return `Uncaught ${e.name}: ${e.message}`;
  return `Uncaught ${String(e)}`;
}

/** A fresh Web Worker running the executor's worker script, in a Node thread. */
export function nodeWorker(): WorkerLike {
  const thread = new Worker(BOOTSTRAP, { eval: true, workerData: { workerSource: WORKER_SOURCE, structuredCloneSource: STRUCTURED_CLONE_SOURCE } });
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
