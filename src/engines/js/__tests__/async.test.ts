/**
 * Asynchronous code (#45): the program's promise callbacks, await
 * continuations and timers run, and take steps, before the worker replies.
 * Each test runs the program as the app does (runJsTutor: the worker script
 * in a Node thread), since the event loop is what's under test.
 */
import { describe, expect, it } from 'vitest';
import type { ExecutionSnapshot, WorkerMessage } from '../../../types/snapshot';
import { runJsTutor } from './node/harness';

async function run(source: string): Promise<Extract<WorkerMessage, { type: 'result' }>> {
  const reply = await runJsTutor(source);
  if (reply.type !== 'result') throw new Error(`no steps: ${reply.message}`);
  return reply;
}

const last = (snaps: ExecutionSnapshot[]) => snaps[snaps.length - 1];
const frames = (s: ExecutionSnapshot) => s.callStack.map(f => f.name);
const globalVar = (s: ExecutionSnapshot, name: string) => s.callStack[0].variables.find(v => v.name === name)?.value;

describe('asynchronous code (#45)', () => {
  it('runs await continuations and promise callbacks before the reply, in the order Node runs them', async () => {
    const r = await run(`async function f() {
  const x = await Promise.resolve(2);
  console.log("x", x);
}
f();
Promise.resolve("v").then(v => console.log("then", v));
console.log("after");`);
    expect(last(r.snapshots).stdout).toEqual(['after', 'x 2', 'then v']);
    expect(r.error).toBeUndefined();
  });

  it("labels the step that starts each callback, with the callback's frame alone on the stack", async () => {
    const r = await run(`let n = 0;
async function f() {
  await null;
  n = 1;
}
f();
setTimeout(function tick() {
  n = 2;
}, 10);
Promise.resolve().then(() => {
  n = 3;
});`);
    const labeled = r.snapshots.filter(s => s.label).map(s => [s.label, frames(s).join('>'), s.line]);
    expect(labeled).toEqual([
      ['resumed after await', 'Global>f', 4],
      ['promise callback', 'Global><anonymous>', 11],
      ['setTimeout callback', 'Global>tick', 8],
    ]);
  });

  it("keeps the Global frame current while a callback runs, and ends with the state after every callback", async () => {
    const r = await run(`let count = 0;
setTimeout(() => {
  count = 5;
  const done = true;
}, 0);
console.log("scheduled");`);
    const inside = r.snapshots.find(s => s.line === 4);
    expect(inside && globalVar(inside, 'count')).toEqual({ type: 'number', value: 5 });
    const end = last(r.snapshots);
    expect(frames(end)).toEqual(['Global']);
    expect(globalVar(end, 'count')).toEqual({ type: 'number', value: 5 });
    expect(end.line).toBe(5);
  });

  it('runs timers by virtual time: due time, then the order they were set; a long delay costs nothing', async () => {
    const started = Date.now();
    const r = await run(`const order = [];
setTimeout(() => order.push("2s"), 2000);
setTimeout(() => order.push("0 a"), 0);
setTimeout(() => order.push("1"), 1);
setTimeout(() => order.push("0 b"));
const id = setInterval(() => {
  order.push("tick");
  if (order.filter(x => x === "tick").length === 3) clearInterval(id);
}, 700);
const cancelled = setTimeout(() => order.push("cancelled"), 5);
clearTimeout(cancelled);`);
    expect(Date.now() - started).toBeLessThan(1500);
    const order = last(r.snapshots).callStack[0].variables.find(v => v.name === 'order');
    expect(order?.value.type).toBe('ref');
    const heapId = (order!.value as { heapId: string }).heapId;
    const items = last(r.snapshots).heap.find(h => h.id === heapId)!.properties.map(p => (p.value as { value: unknown }).value);
    expect(items).toEqual(['0 a', '1', '0 b', 'tick', 'tick', '2s', 'tick']);
  });

  it('ends the run at an unhandled rejection, as Node does', async () => {
    const r = await run(`async function check(age) {
  if (age < 0) throw new RangeError("negative: " + age);
  return age;
}
check(-3);
setTimeout(() => console.log("never"), 10);
console.log("started");`);
    expect(r.error).toMatchObject({ kind: 'exception', message: 'RangeError: negative: -3' });
    // its stack, with the program's lines (#47)
    expect(r.error?.stderr).toBe('Uncaught (in promise) RangeError: negative: -3\n    at check (main.js:2)\n    at main.js:5');
    expect(last(r.snapshots).stdout).toEqual(['started']);
  });

  it("ends the run at an exception a timer's callback didn't catch", async () => {
    const r = await run(`setTimeout(() => {
  null.boom;
}, 0);
console.log("ok");`);
    expect(r.error).toMatchObject({ kind: 'exception', message: "TypeError: Cannot read properties of null (reading 'boom')" });
    expect(frames(last(r.snapshots))).toEqual(['Global', '<anonymous>']);
  });

  it('stops a timer that never ends at the step cap, keeping its steps', async () => {
    const r = await run(`let ticks = 0;
setInterval(() => {
  ticks++;
}, 100);`);
    expect(r.error?.kind).toBe('limit');
    expect(r.snapshots.length).toBe(5000);
  });

  it('stops at the step cap inside a promise callback too, though the cap only rejects that promise', async () => {
    const r = await run(`async function spin() {
  await null;
  let i = 0;
  while (true) i++;
}
spin().catch(() => console.log("swallowed"));`);
    expect(r.error?.kind).toBe('limit');
    expect(last(r.snapshots).stdout).toEqual([]);
  });
});

describe('async fidelity (#92)', () => {
  it('prints a promise with its state once the runtime has seen it settle', async () => {
    const r = await run(`const now = Promise.resolve(42);
const failed = Promise.reject('nope');
failed.catch(() => {});
const later = new Promise((resolve) => setTimeout(() => resolve(7), 10));
console.log(now, failed, later);
setTimeout(() => console.log(later), 20);
async function g() { return 'done'; }
const q = g();
q.then((v) => console.log(v, q));`);
    expect(last(r.snapshots).stdout).toEqual(["Promise { 42 } Promise { <rejected> 'nope' } Promise { <pending> }", "done Promise { 'done' }", 'Promise { 7 }']);
  });

  it("keeps promises the browser's: async functions and Promise.resolve give the same object, and await takes as many turns", async () => {
    const r = await run(`const p = Promise.resolve(1);
console.log(Promise.resolve(p) === p, p instanceof Promise, (async () => {})() instanceof Promise);
const order = [];
(async () => { await null; order.push('a1'); await null; order.push('a2'); })();
Promise.resolve().then(() => order.push('t1')).then(() => order.push('t2'));
setTimeout(() => console.log(order.join(' ')), 0);`);
    expect(last(r.snapshots).stdout).toEqual(['true true true', 'a1 t1 a2 t2']);
  });

  it('moves the clock with virtual time: Date.now, new Date and console.time see a timer\'s delay', async () => {
    const r = await run(`const start = Date.now();
console.time('wait');
setTimeout(() => {
  console.log(Date.now() - start >= 2000, new Date().getTime() - start >= 2000);
  console.timeEnd('wait');
}, 2000);`);
    const out = last(r.snapshots).stdout;
    expect(out[0]).toBe('true true');
    expect(out[1]).toMatch(/^wait: 2\.\d{3}s$/);
  });

  it('waits for fetch and for reading the response, then runs their callbacks', async () => {
    const r = await run(`async function load() {
  const response = await fetch('data:text/plain,payload');
  const text = await response.text();
  console.log('got', text);
}
load();
console.log('sent');`);
    expect(last(r.snapshots).stdout).toEqual(['sent', 'got payload']);
    expect(r.error).toBeUndefined();
  });

  it('ends the run at close(), with its steps, running no timer after it', async () => {
    const r = await run(`console.log('a');
setTimeout(() => console.log('never'), 10);
close();
console.log('b');`);
    expect(last(r.snapshots).stdout).toEqual(['a', 'b']);
    expect(r.error).toEqual({ kind: 'error', message: 'The program called close(), which ends the worker: nothing after it runs.' });
  });

  it("ends the run at an exception in a task of the program's own (a MessageChannel handler), with its steps", async () => {
    const r = await run(`const channel = new MessageChannel();
channel.port1.onmessage = () => { throw new Error('in handler'); };
channel.port2.postMessage(1);
console.log('posted');`);
    expect(last(r.snapshots).stdout).toEqual(['posted']);
    expect(r.error).toMatchObject({ kind: 'exception', message: 'Error: in handler' });
  });
});
