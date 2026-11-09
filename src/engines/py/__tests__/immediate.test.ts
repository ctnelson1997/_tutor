/**
 * The worker's setImmediate (#79): without one, every Pyodide instance adds a
 * message listener to the worker's global scope that keeps it alive, so each
 * run's interpreter stayed in memory. `scripts/py-browser-memory.ts` checks
 * the worker itself in a real browser.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { installSetImmediate, type ImmediateScope } from '../immediate';

type SetImmediate = (callback: (...args: unknown[]) => void, ...args: unknown[]) => number;

describe('installSetImmediate', () => {
  it('runs callbacks after the current task, in order, with their arguments', async () => {
    const scope: ImmediateScope = {};
    installSetImmediate(scope);
    const setImmediate = scope.setImmediate as SetImmediate;
    const clearImmediate = scope.clearImmediate as (id: number) => void;
    const order: string[] = [];
    const done = new Promise<void>(resolve => {
      setImmediate((a, b) => order.push(`first ${a} ${b}`), 1, 2);
      const cancelled = setImmediate(() => order.push('cancelled'));
      setImmediate(() => {
        order.push('last');
        resolve();
      });
      clearImmediate(cancelled);
    });
    order.push('this task');
    await done;
    expect(order).toEqual(['this task', 'first 1 2', 'last']);
  });

  it('gives each call its own id', () => {
    const scope: ImmediateScope = {};
    installSetImmediate(scope);
    const setImmediate = scope.setImmediate as SetImmediate;
    const ids = [setImmediate(() => {}), setImmediate(() => {})];
    ids.forEach(id => (scope.clearImmediate as (id: number) => void)(id));
    expect(new Set(ids).size).toBe(2);
  });

  it("leaves a scope's own setImmediate alone (Node's)", () => {
    const own = () => 0;
    const scope: ImmediateScope = { setImmediate: own, clearImmediate: own };
    installSetImmediate(scope);
    expect(scope.setImmediate).toBe(own);
    expect(scope.clearImmediate).toBe(own);
    installSetImmediate();
    expect(globalThis.setImmediate).toBe(setImmediate);
  });
});

describe("the pinned Pyodide's setImmediate polyfill", () => {
  // Emscripten's choice, as the pinned pyodide.asm.js makes it for every
  // instance: if a Pyodide upgrade changes it, #79's fix must be checked again.
  const asm = readFileSync(join(dirname(createRequire(import.meta.url).resolve('pyodide/package.json')), 'pyodide.asm.js'), 'utf8');
  const start = asm.indexOf('if(typeof setImmediate!="undefined"){emSetImmediate=setImmediateWrapped');
  const end = asm.indexOf('Module["requestFullscreen"]', start);
  const polyfill = asm.slice(start, end);

  /** The message listeners the polyfill adds to a worker-like global scope, with or without installSetImmediate first. */
  function listenersAdded(withShim: boolean): { added: string[]; usesGlobal: boolean } {
    const added: string[] = [];
    const scope: Record<string, unknown> = {
      addEventListener: (type: string) => added.push(type),
      postMessage: () => {},
      setImmediateWrapped: () => {},
      clearImmediateWrapped: () => {},
    };
    if (withShim) installSetImmediate(scope);
    vm.runInNewContext(polyfill, scope);
    return { added, usesGlobal: scope.emSetImmediate === scope.setImmediateWrapped };
  }

  it('is found in pyodide.asm.js', () => {
    expect(start).toBeGreaterThan(0);
    expect(polyfill).toContain('addEventListener("message",__setImmediate_cb,true)');
  });

  it('adds a message listener to a scope without setImmediate, holding the instance', () => {
    expect(listenersAdded(false)).toEqual({ added: ['message'], usesGlobal: false });
  });

  it('adds none once the worker has a setImmediate', () => {
    expect(listenersAdded(true)).toEqual({ added: [], usesGlobal: true });
  });
});
