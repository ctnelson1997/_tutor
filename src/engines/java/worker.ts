/**
 * Java Engine Web Worker
 *
 * Ephemeral worker (like the JS engine): created fresh for each execution,
 * parses and interprets Java code, then returns snapshots.
 */

import { parseJava } from './parser';
import { JavaInterpreter } from './interpreter';
import type { WorkerMessage } from '../../types/snapshot';

self.onmessage = (e: MessageEvent<{ type: string; source: string }>) => {
  if (e.data.type !== 'run') return;

  const { source } = e.data;

  try {
    const cst = parseJava(source);
    const interpreter = new JavaInterpreter();
    const result = interpreter.execute(cst);

    if (result.error) {
      const msg: WorkerMessage = { type: 'error', message: result.error };
      self.postMessage(msg);
    } else {
      const msg: WorkerMessage = { type: 'result', snapshots: result.snapshots };
      self.postMessage(msg);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const msg: WorkerMessage = { type: 'error', message: `Parse error: ${message}` };
    self.postMessage(msg);
  }
};
