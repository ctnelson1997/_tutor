/**
 * Run a Java program and build the reply the Java worker posts: the steps,
 * and why the run stopped early if it did. Only a parse error returns no
 * steps. Kept apart from worker.ts so it can be tested without a worker.
 */

import { parseJava, describeParseError, type CstNode } from './parser';
import { JavaInterpreter, type RunLimits } from './interpreter';
import type { WorkerMessage } from '../../types/snapshot';

export function runJava(source: string, stdin = '', limits?: Partial<RunLimits>): WorkerMessage {
  let cst: CstNode;
  try {
    cst = parseJava(source);
  } catch (err) {
    return { type: 'error', ...describeParseError(err instanceof Error ? err.message : String(err), source) };
  }
  try {
    const result = new JavaInterpreter(stdin, limits).execute(cst);
    return { type: 'result', snapshots: result.snapshots, ...(result.failure ? { error: result.failure } : {}) };
  } catch (err) {
    // execute() reports its own failures; reaching here is an engine bug.
    console.error(err);
    return { type: 'error', message: 'Internal JavaTutor error (please report it)' };
  }
}
