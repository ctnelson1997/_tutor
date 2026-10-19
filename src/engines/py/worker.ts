/**
 * Pyodide Web Worker
 *
 * Persistent worker that loads Pyodide once from CDN and accepts
 * execution requests. Each execution gets a fresh Python namespace.
 *
 * Protocol:
 *   Main → Worker:  { type: 'init' }          → triggers Pyodide load
 *   Main → Worker:  { type: 'run', source }    → execute Python code
 *   Worker → Main:  { type: 'ready' }          → Pyodide loaded
 *   Worker → Main:  { type: 'result', snapshots } or { type: 'error', message, line? }
 */
import { PYODIDE_VERSION, runProgram } from './run';

// Worker globals — typed loosely to avoid needing the WebWorker lib
// (this file is compiled under the app's tsconfig which uses DOM lib)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _self = self as any;

const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null;

_self.onmessage = async (e: MessageEvent) => {
  const data = e.data;

  if (data.type === 'init') {
    try {
      // Dynamic import works in module workers (importScripts does not)
      const { loadPyodide } = await import(
        /* @vite-ignore */
        `${PYODIDE_CDN}/pyodide.mjs`
      );
      pyodide = await loadPyodide({
        indexURL: PYODIDE_CDN,
      });
      _self.postMessage({ type: 'ready' });
    } catch (err) {
      _self.postMessage({
        type: 'error',
        message: `Failed to load Python engine: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return;
  }

  if (data.type === 'run') {
    if (!pyodide) {
      _self.postMessage({ type: 'error', message: 'Python engine not loaded yet.' });
      return;
    }
    _self.postMessage(runProgram(pyodide, data.tracerCode, data.source));
    return;
  }
};
