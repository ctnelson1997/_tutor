/**
 * JS Engine Executor
 *
 * Pure execution pipeline: instrument → runtime + worker → snapshots.
 * No store coupling — returns a WorkerMessage.
 */

import { UnsupportedSyntaxError, instrument } from './instrumenter';
import { getRuntimeCode } from './runtime';
import type { WorkerMessage } from '../../types/snapshot';

export const WORKER_TIMEOUT = 10_000;

/**
 * The worker's script. It runs the program (the runtime followed by the
 * instrumented code) in its own global scope and posts the reply.
 * The differential suite (#42) runs this same script in a Node worker thread.
 */
export const WORKER_SOURCE = `
    self.onmessage = function(e) {
      var data = e.data;
      if (data.type !== 'run') return;

      try {
        var indirectEval = eval;
        indirectEval(data.code);
      } catch (err) {
        // The steps recorded before an uncaught exception (or the step cap) are kept,
        // and the run ends there, as Node ends it.
        if (typeof self.__runResult__ === 'function') {
          self.postMessage(self.__runResult__(err));
        } else {
          self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
      // The program's timers and promise callbacks run, and take steps, before the reply (#45).
      self.__eventLoop__(function (message) { self.postMessage(message); });
    };
  `;

/** The parts of a Web Worker the executor uses. */
export interface WorkerLike {
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

function createWorker(): WorkerLike {
  const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
}

/** Run a prepared program in a fresh worker; it is terminated once it replies, or after `timeoutMs`. */
export function executeInWorker(code: string, makeWorker: () => WorkerLike = createWorker, timeoutMs = WORKER_TIMEOUT): Promise<WorkerMessage> {
  return new Promise((resolve) => {
    const worker = makeWorker();

    const timeout = setTimeout(() => {
      worker.terminate();
      resolve({
        type: 'error',
        message: `Execution timed out after ${timeoutMs / 1000} seconds. Your code may contain an infinite loop.`,
      });
    }, timeoutMs);

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
 * The program the worker runs: the runtime, then the instrumented source.
 * A program that doesn't parse gets its error reply instead.
 */
export function prepareProgram(source: string): { code: string } | { reply: WorkerMessage } {
  let instrumentedCode: string;
  try {
    instrumentedCode = instrument(source);
  } catch (err: unknown) {
    // Syntax JSTutor can't show yet stops the program before it runs (#46).
    if (err instanceof UnsupportedSyntaxError) return { reply: { type: 'error', message: err.message, line: err.line } };
    const message = err instanceof Error ? err.message : String(err);
    let line: number | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.loc?.line) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      line = (err as any).loc.line;
    }
    return { reply: { type: 'error', message: `Parse error: ${message}`, line } };
  }
  return { code: getRuntimeCode() + '\n' + instrumentedCode };
}

/**
 * Execute user source code through the JS instrumentation pipeline.
 * Returns the raw WorkerMessage (snapshots or error).
 */
export async function execute(source: string): Promise<WorkerMessage> {
  const program = prepareProgram(source);
  if ('reply' in program) return program.reply;
  return executeInWorker(program.code);
}
