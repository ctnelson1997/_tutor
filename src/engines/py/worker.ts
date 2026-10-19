/**
 * Pyodide Web Worker
 *
 * Persistent worker that loads Pyodide once from the CDN, with the tracer, and
 * runs each program in a fresh interpreter restored from a memory snapshot of
 * it (PySession, #35): nothing one run does reaches the next.
 *
 * Protocol:
 *   Main → Worker:  { type: 'init', tracerCode }      → load Pyodide and the tracer, take the snapshot
 *   Main → Worker:  { type: 'run', source, stdin }    → run a program, input() reading stdin
 *   Worker → Main:  { type: 'ready' }                 → ready to run
 *   Worker → Main:  { type: 'result', snapshots, error? } (a syntax error: no steps, a compile error) or { type: 'error', message }
 */
import { PYODIDE_VERSION } from './run';
import { PySession, type SessionPyodide } from './session';

// Worker globals — typed loosely to avoid needing the WebWorker lib
// (this file is compiled under the app's tsconfig which uses DOM lib)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _self = self as any;

const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full`;

let session: PySession | null = null;

/** What a student sees when Pyodide can't be fetched: the Python engine comes from the network. */
function loadFailure(err: unknown): string {
  return `Failed to load the Python engine, which needs an internet connection: ${err instanceof Error ? err.message : String(err)}`;
}

_self.onmessage = async (e: MessageEvent) => {
  const data = e.data;

  if (data.type === 'init') {
    try {
      // Dynamic import works in module workers (importScripts does not)
      const { loadPyodide } = await import(
        /* @vite-ignore */
        `${PYODIDE_CDN}/pyodide.mjs`
      );
      session = new PySession(
        options => loadPyodide({ indexURL: PYODIDE_CDN, ...options }) as Promise<SessionPyodide>,
        data.tracerCode,
      );
      await session.init();
      _self.postMessage({ type: 'ready' });
    } catch (err) {
      _self.postMessage({ type: 'error', message: loadFailure(err) });
    }
    return;
  }

  if (data.type === 'run') {
    if (!session) {
      _self.postMessage({ type: 'error', message: 'Python engine not loaded yet.' });
      return;
    }
    try {
      _self.postMessage(await session.run(data.source, { stdin: data.stdin ?? '' }));
    } catch (err) {
      // Making a fresh interpreter failed: with no snapshot, a full load needs the network.
      _self.postMessage({ type: 'error', message: loadFailure(err) });
    }
    return;
  }
};
