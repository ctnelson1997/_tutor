/**
 * A setImmediate for the worker, installed before Pyodide loads (#79).
 *
 * Emscripten's runtime, which runs again for every Pyodide instance, picks
 * its setImmediate when the instance is made: the global one if there is one,
 * else a polyfill of its own, a 'message' listener added to the worker's
 * global scope (`addEventListener("message", …, true)`) and never removed.
 * That listener's closure holds the instance (its WebAssembly memory, heap
 * views and file system), so every interpreter the session restored for a
 * run stayed alive: about 30 MB a run, until the tab ran out of memory. With
 * a global setImmediate, Emscripten uses it and adds no listener, and an
 * interpreter is garbage once the session drops it.
 *
 * Browsers have no setImmediate; Node has one (the CPython suite's runners
 * never had the leak).
 */

type Callback = (...args: unknown[]) => void;

/** The global scope's setImmediate and clearImmediate, which this adds when it has none. */
export interface ImmediateScope {
  setImmediate?: unknown;
  clearImmediate?: unknown;
}

/** Give `scope` a setImmediate (callbacks in order, after the current task, through a MessageChannel) if it has none. */
export function installSetImmediate(scope: ImmediateScope = globalThis as ImmediateScope): void {
  if (typeof scope.setImmediate === 'function') return;
  const queue = new Map<number, () => void>();
  let nextId = 1;
  const channel = new MessageChannel();
  channel.port1.onmessage = (e: MessageEvent<number>) => {
    const run = queue.get(e.data);
    if (!run) return; // cleared
    queue.delete(e.data);
    run();
  };
  // Node keeps a process alive for a port with a listener; a browser has no unref.
  (channel.port1 as { unref?: () => void }).unref?.();
  scope.setImmediate = (callback: Callback, ...args: unknown[]): number => {
    const id = nextId++;
    queue.set(id, () => callback(...args));
    channel.port2.postMessage(id);
    return id;
  };
  scope.clearImmediate = (id: number): void => {
    queue.delete(id);
  };
}
