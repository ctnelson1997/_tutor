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
 * The worker's script (#87). It loads the runtime (its own closure), then runs
 * the instrumented program as a classic script of its own, as a browser runs
 * a worker's script: its top-level declarations are the global scope's, a
 * top-level 'use strict' applies to it (#89), and it shares nothing with the
 * runtime but the functions the runtime puts on the global object. What the
 * worker needs afterwards (postMessage, importScripts, URL, Blob) is taken
 * before the program runs, and the reply carries the run's nonce, so a
 * program that calls postMessage or declares a global named like one of them
 * changes nothing. The differential suite (#42) runs this same script in a
 * Node worker thread.
 */
export const WORKER_SOURCE = `
    self.onmessage = function (e) {
      var data = e.data;
      if (!data || data.type !== 'run') return;
      var scope = self;
      var apply = Reflect.apply;
      var post = scope.postMessage;
      var load = scope.importScripts;
      var urls = scope.URL;
      var createURL = urls.createObjectURL;
      var revokeURL = urls.revokeObjectURL;
      var ScriptBlob = scope.Blob;
      var nonce = data.nonce;
      var reply = function (message) { apply(post, scope, [{ tutorReply: nonce, message: message }]); };

      var runtime;
      try {
        runtime = (0, eval)(data.runtime);
      } catch (err) {
        reply({ type: 'error', message: 'JSTutor could not start: ' + String(err) });
        return;
      }
      var url = apply(createURL, urls, [new ScriptBlob([data.program], { type: 'text/javascript' })]);
      try {
        apply(load, scope, [url]);
      } catch (err) {
        // The steps recorded before an uncaught exception (or a limit) are kept,
        // and the run ends there, as Node ends it.
        reply(runtime.runResult(err));
        return;
      } finally {
        apply(revokeURL, urls, [url]);
      }
      // The program's timers and promise callbacks run, and take steps, before the reply (#45).
      runtime.eventLoop(reply);
    };
  `;

/** The parts of a Web Worker the executor uses. */
export interface WorkerLike {
  onmessage: ((e: MessageEvent<unknown>) => void) | null;
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

/** What the worker runs: the runtime (an expression, its value the runtime's API) and the instrumented program, a script of its own. */
export interface PreparedProgram {
  runtime: string;
  program: string;
}

/** The worker's reply, as WORKER_SOURCE wraps it: only the one with this run's nonce counts. */
function replyOf(data: unknown, nonce: string): WorkerMessage | null {
  const reply = data as { tutorReply?: unknown; message?: WorkerMessage } | null;
  return reply && typeof reply === 'object' && reply.tutorReply === nonce && reply.message ? reply.message : null;
}

/**
 * Run a prepared program in a fresh worker; it is terminated once it replies, or after `timeoutMs`.
 * Messages the program posts itself are ignored (#87).
 */
export function executeInWorker(prepared: PreparedProgram, makeWorker: () => WorkerLike = createWorker, timeoutMs = WORKER_TIMEOUT): Promise<WorkerMessage> {
  return new Promise((resolve) => {
    const worker = makeWorker();
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

    const timeout = setTimeout(() => {
      worker.terminate();
      resolve({
        type: 'error',
        message: `Execution timed out after ${timeoutMs / 1000} seconds. Your code may contain an infinite loop.`,
      });
    }, timeoutMs);

    worker.onmessage = (e: MessageEvent<unknown>) => {
      const reply = replyOf(e.data, nonce);
      if (!reply) return;
      clearTimeout(timeout);
      worker.terminate();
      resolve(reply);
    };

    worker.onerror = (e: ErrorEvent) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve({
        type: 'error',
        message: e.message || 'An unknown error occurred in the worker.',
      });
    };

    worker.postMessage({ type: 'run', runtime: prepared.runtime, program: prepared.program, nonce });
  });
}

/** A program the JavaScript engine can't parse: the engine's message, and where (line 1-based, column 0-based). */
export interface SyntaxProblem {
  message: string;
  line: number | null;
  column: number | null;
}

/**
 * What the worker runs: the runtime and the instrumented source.
 * A program that doesn't parse gives its parser's (Acorn's) problem instead,
 * and syntax JSTutor can't show yet its error reply.
 */
export function prepareProgram(source: string): PreparedProgram | { reply: WorkerMessage } | { syntax: SyntaxProblem } {
  let instrumentedCode: string;
  try {
    instrumentedCode = instrument(source);
  } catch (err: unknown) {
    // Syntax JSTutor can't show yet stops the program before it runs (#46).
    if (err instanceof UnsupportedSyntaxError) return { reply: { type: 'error', message: err.message, line: err.line } };
    const message = err instanceof Error ? err.message : String(err);
    const loc = (err as { loc?: { line?: number; column?: number } } | null)?.loc;
    return { syntax: { message: message.replace(/ \(\d+:\d+\)$/, ''), line: loc?.line ?? null, column: loc?.column ?? null } };
  }
  return { runtime: getRuntimeCode(), program: instrumentedCode };
}

/** Asks the JavaScript engine itself what is wrong with a program that doesn't parse; null if it has nothing to say. */
export type ScriptChecker = (source: string) => Promise<SyntaxProblem | null>;

/**
 * The browser's own words for a program that doesn't parse (#50): the program
 * is loaded as a worker's script, and a script that fails to parse fires the
 * worker's error event with the engine's message and position (no browser
 * gives a SyntaxError's line to eval or new Function). A script that parses
 * starts running, so after a second the worker is ended and the parser's
 * problem stands.
 */
function checkScriptInWorker(source: string): Promise<SyntaxProblem | null> {
  return new Promise(resolve => {
    let worker: Worker;
    try {
      const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
      worker = new Worker(url);
      URL.revokeObjectURL(url);
    } catch {
      resolve(null);
      return;
    }
    const done = (problem: SyntaxProblem | null) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(problem);
    };
    const timer = setTimeout(() => done(null), 1000);
    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      done(syntaxProblemFromEvent(e));
    };
  });
}

/** A worker's error event as a syntax problem ("Uncaught SyntaxError: msg" in Chrome, "SyntaxError: msg" in Firefox), or null for another error. */
export function syntaxProblemFromEvent(e: { message: string; lineno?: number; colno?: number }): SyntaxProblem | null {
  const m = /^(?:Uncaught )?SyntaxError: ([^]*)$/.exec(e.message ?? '');
  if (!m) return null;
  return { message: m[1], line: e.lineno || null, column: e.colno ? e.colno - 1 : null };
}

/**
 * A program that doesn't parse, as a `compile` RunError with no steps (#50),
 * as JavaTutor reports a program javac rejects: the message and line, the line
 * marked, and on the console what the browser's console shows for it, with
 * the line and a caret under the column.
 */
export function syntaxErrorReply(source: string, problem: SyntaxProblem): WorkerMessage {
  const message = `SyntaxError: ${problem.message}`;
  const listing = [`Uncaught ${message}`];
  const text = problem.line ? source.split('\n')[problem.line - 1] : undefined;
  if (problem.line) listing.push(`    at main.js:${problem.line}${problem.column !== null ? `:${problem.column + 1}` : ''}`);
  if (text !== undefined) {
    listing.push(text);
    if (problem.column !== null) listing.push(text.slice(0, problem.column).replace(/[^\t]/g, ' ') + '^');
  }
  return {
    type: 'result',
    snapshots: [],
    error: { kind: 'compile', message, ...(problem.line ? { line: problem.line, lines: [problem.line] } : {}), stderr: listing.join('\n') },
  };
}

/** The workers a run uses: the program's, and the one that asks the engine about a program that doesn't parse. */
export interface ExecuteOptions {
  makeWorker?: () => WorkerLike;
  checkScript?: ScriptChecker;
  timeoutMs?: number;
}

/**
 * Run a program as JSTutor does: instrument it and run it in a worker; a
 * program that doesn't parse is reported in the engine's own words.
 */
export async function executeProgram(source: string, options: ExecuteOptions = {}): Promise<WorkerMessage> {
  const program = prepareProgram(source);
  if ('syntax' in program) {
    const engine = await (options.checkScript ?? checkScriptInWorker)(source).catch(() => null);
    return syntaxErrorReply(source, engine ?? program.syntax);
  }
  if ('reply' in program) return program.reply;
  return executeInWorker(program, options.makeWorker, options.timeoutMs);
}

/**
 * Execute user source code through the JS instrumentation pipeline.
 * Returns the raw WorkerMessage (snapshots or error).
 */
export async function execute(source: string): Promise<WorkerMessage> {
  return executeProgram(source);
}
