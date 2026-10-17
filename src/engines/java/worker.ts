/**
 * Java Engine Web Worker
 *
 * Ephemeral worker (like the JS engine): created fresh for each execution,
 * parses and interprets Java code, then returns snapshots. A run that stops
 * early (an uncaught exception, the step limit) still returns its steps, with
 * the reason in `error` (see run.ts).
 */

import { runJava } from './run';

self.onmessage = (e: MessageEvent<{ type: string; source: string; stdin?: string }>) => {
  if (e.data.type !== 'run') return;
  self.postMessage(runJava(e.data.source, e.data.stdin ?? ''));
};
