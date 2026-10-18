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
    expect(r.error).toMatchObject({ kind: 'exception', message: 'RangeError: negative: -3', stderr: 'Uncaught (in promise) RangeError: negative: -3' });
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
