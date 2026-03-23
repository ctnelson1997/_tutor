/**
 * Python Engine Executor
 *
 * Manages a persistent Pyodide Web Worker. The worker is created eagerly
 * at module load time (when the py engine is imported) so that Pyodide's
 * ~12 MB WASM download starts immediately rather than on first
 * "Visualize" click. If execution times out (infinite loop), the worker
 * is terminated and recreated on the next run.
 */

import { getTracerCode } from './tracer';
import type { WorkerMessage } from '../../types/snapshot';

const WORKER_TIMEOUT = 10_000;
const INIT_TIMEOUT = 30_000; // Pyodide download can take a while

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
const tracerCode = getTracerCode();

function createWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker = w;

    // Timeout for Pyodide initialization (download + compile WASM)
    const initTimeout = setTimeout(() => {
      w.terminate();
      worker = null;
      readyPromise = null;
      reject(new Error('Python engine took too long to load. Please check your network connection and try again.'));
    }, INIT_TIMEOUT);

    w.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'ready') {
        clearTimeout(initTimeout);
        resolve();
      } else if (e.data.type === 'error') {
        clearTimeout(initTimeout);
        w.terminate();
        worker = null;
        readyPromise = null;
        reject(new Error(e.data.message));
      }
    };

    w.onerror = (e: ErrorEvent) => {
      clearTimeout(initTimeout);
      w.terminate();
      worker = null;
      readyPromise = null;
      reject(new Error(e.message || 'Failed to create Python worker.'));
    };

    w.postMessage({ type: 'init' });
  });
}

async function ensureWorker(): Promise<void> {
  if (worker && readyPromise) {
    await readyPromise;
    return;
  }
  readyPromise = createWorker();
  await readyPromise;
}

/**
 * Execute user Python code through the Pyodide tracing pipeline.
 * Returns the raw WorkerMessage (snapshots or error).
 */
export async function execute(source: string): Promise<WorkerMessage> {
  try {
    await ensureWorker();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: 'error', message };
  }

  return new Promise((resolve) => {
    if (!worker) {
      resolve({ type: 'error', message: 'Python engine not available.' });
      return;
    }

    const timeout = setTimeout(() => {
      worker?.terminate();
      worker = null;
      readyPromise = null;
      resolve({
        type: 'error',
        message: `Execution timed out after ${WORKER_TIMEOUT / 1000} seconds. Your code may contain an infinite loop.`,
      });
    }, WORKER_TIMEOUT);

    const onMessage = (e: MessageEvent<WorkerMessage>) => {
      // Ignore the 'ready' message if it comes through during execution
      if ((e.data as { type: string }).type === 'ready') return;

      clearTimeout(timeout);
      worker!.removeEventListener('message', onMessage);
      resolve(e.data);
    };

    worker.addEventListener('message', onMessage);

    worker.onerror = (e: ErrorEvent) => {
      clearTimeout(timeout);
      worker?.terminate();
      worker = null;
      readyPromise = null;
      resolve({
        type: 'error',
        message: e.message || 'An unknown error occurred in the Python worker.',
      });
    };

    worker.postMessage({ type: 'run', source, tracerCode });
  });
}

// Start loading Pyodide immediately when this module is imported
// (at page load for the py build target). The download runs in the
// background so it's ready (or nearly ready) by the time the user
// clicks "Visualize". Failures are silently ignored here — ensureWorker()
// will surface them when execute() is actually called.
ensureWorker().catch(() => {});
