/**
 * JS Engine Executor
 *
 * Pure execution pipeline: instrument → runtime + worker → snapshots.
 * No store coupling — returns a WorkerMessage.
 */

import { instrument } from './instrumenter';
import { getRuntimeCode } from './runtime';
import type { WorkerMessage } from '../../types/snapshot';

const WORKER_TIMEOUT = 10_000;

function createWorker(): Worker {
  const workerCode = `
    self.onmessage = function(e) {
      var data = e.data;
      if (data.type !== 'run') return;

      try {
        var indirectEval = eval;
        indirectEval(data.code);

        var snapshots = self.__snapshots__ || [];
        self.postMessage({ type: 'result', snapshots: snapshots });
      } catch (err) {
        var message = err instanceof Error ? err.message : String(err);
        self.postMessage({ type: 'error', message: message });
      }
    };
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}

function executeInWorker(code: string): Promise<WorkerMessage> {
  return new Promise((resolve) => {
    const worker = createWorker();

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
        message: e.message || 'An unknown error occurred in the worker.',
      });
    };

    worker.postMessage({ type: 'run', code });
  });
}

/**
 * Execute user source code through the JS instrumentation pipeline.
 * Returns the raw WorkerMessage (snapshots or error).
 */
export async function execute(source: string): Promise<WorkerMessage> {
  let instrumentedCode: string;
  try {
    instrumentedCode = instrument(source);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    let line: number | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.loc?.line) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      line = (err as any).loc.line;
    }
    return { type: 'error', message: `Parse error: ${message}`, line };
  }

  const runtimeCode = getRuntimeCode();
  const fullCode = runtimeCode + '\n' + instrumentedCode;
  return executeInWorker(fullCode);
}
