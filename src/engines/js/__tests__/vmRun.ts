/**
 * Runs a program as JSTutor's worker does, but synchronously, in a `vm`
 * context (for the pipeline and behavior-comparison suites): the runtime
 * first, then the instrumented program as a script of its own (#87), and the
 * reply as the worker builds it once the script has run. The event loop
 * (timers, promise callbacks) isn't run: tests of asynchronous code use the
 * worker (`runJsTutor`).
 */
import { createContext, runInContext } from 'node:vm';
import { instrument } from '../instrumenter';
import { getRuntimeCode } from '../runtime';
import type { WorkerMessage } from '../../../types/snapshot';

interface RuntimeApi { runResult: (...err: unknown[]) => WorkerMessage }

export function runInVm(source: string, sandbox: Record<string, unknown> = {}, timeout?: number): WorkerMessage {
  const program = instrument(source);
  const ctx = createContext(sandbox);
  const runtime = runInContext(getRuntimeCode(), ctx, { filename: 'runtime.js' }) as RuntimeApi;
  try {
    runInContext(program, ctx, { filename: 'main.js', timeout });
  } catch (err) {
    return runtime.runResult(err);
  }
  return runtime.runResult();
}
