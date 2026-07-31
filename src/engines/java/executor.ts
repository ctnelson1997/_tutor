/**
 * Java Engine Executor
 *
 * Creates an ephemeral Web Worker for each execution (same pattern as the
 * JS engine). The worker parses and interprets Java code, returning
 * snapshots. If execution times out, the worker is terminated.
 */

import type { WorkerMessage } from '../../types/snapshot';
import type { EngineExecuteOptions } from '../../types/engine';
import JavaWorker from './worker.ts?worker&inline';

const WORKER_TIMEOUT = 10_000;

export async function execute(source: string, options?: EngineExecuteOptions): Promise<WorkerMessage> {
  return new Promise((resolve) => {
    const worker = new JavaWorker();

    const timeout = setTimeout(() => {
      worker.terminate();
      resolve({
        type: 'error',
        message: `Execution timed out after ${WORKER_TIMEOUT / 1000} seconds. Your code may contain an infinite loop.`,
      });
    }, WORKER_TIMEOUT);

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve(e.data);
    };

    worker.onerror = (e: ErrorEvent) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve({
        type: 'error',
        message: e.message || 'An unknown error occurred in the Java worker.',
      });
    };

    worker.postMessage({ type: 'run', source, stdin: options?.stdin ?? '' });
  });
}
