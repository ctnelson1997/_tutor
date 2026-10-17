/**
 * Run a Java program and build the reply the Java worker posts: the steps,
 * and why the run stopped early if it did. A program that doesn't compile
 * returns no steps. Kept apart from worker.ts so it can be tested without a
 * worker.
 */

import { parseJava, type CstNode } from './parser';
import { describeParseError, compileFailure } from './compileErrors';
import { JavaInterpreter, type RunLimits } from './interpreter';
import type { WorkerMessage } from '../../types/snapshot';

export function runJava(source: string, stdin = '', limits?: Partial<RunLimits>): WorkerMessage {
  let cst: CstNode;
  try {
    cst = parseJava(source);
  } catch (err) {
    // A syntax error is a compile error: nothing runs, and the console lists it as javac does (#23).
    const error = describeParseError(err instanceof Error ? err.message : String(err), source);
    return { type: 'result', snapshots: [], error: compileFailure([error], source) };
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
