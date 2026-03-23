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

// Worker globals — typed loosely to avoid needing the WebWorker lib
// (this file is compiled under the app's tsconfig which uses DOM lib)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _self = self as any;

// Pyodide CDN version — pin to a specific release
const PYODIDE_VERSION = '0.27.5';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null;
let tracerLoaded = false;

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

    try {
      // Load the tracer code once
      if (!tracerLoaded) {
        pyodide.runPython(data.tracerCode);
        tracerLoaded = true;
      }

      // Run traced execution — pass user source as a Python string
      const escapedSource = data.source
        .replace(/\\/g, '\\\\')
        .replace(/"""/g, '\\"\\"\\"');
      const result = pyodide.runPython(`run_traced("""${escapedSource}""")`);

      // result is a JSON string from Python
      const parsed = JSON.parse(result);
      _self.postMessage(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Try to extract line number from Python traceback
      let line: number | undefined;
      const lineMatch = message.match(/File "<exec>", line (\d+)/);
      if (lineMatch) {
        line = parseInt(lineMatch[1], 10);
      }
      _self.postMessage({ type: 'error', message, line });
    }
    return;
  }
};
