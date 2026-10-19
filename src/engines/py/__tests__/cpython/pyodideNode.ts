/**
 * Pyodide under Node, for the CPython differential suite (#29): the same
 * interpreter the worker loads from the CDN (PYODIDE_VERSION), from the
 * `pyodide` dev dependency.
 */
import { loadPyodide, version, type PyodideInterface } from 'pyodide';
import { PYODIDE_VERSION } from '../../run';

export type { PyodideInterface };

/**
 * A fresh Pyodide. Refuses any version but the one PyTutor ships, so goldens
 * and runs match the browser's Python.
 *
 * String hashing uses a fixed seed (PYTHONHASHSEED=0), here only: the order of
 * a set of strings differs from one interpreter to the next in CPython and in
 * the browser, and a golden must be comparable with a run in another process.
 */
export async function loadNodePyodide(options: { _makeSnapshot?: boolean; _loadSnapshot?: Uint8Array } = {}): Promise<NodePyodide> {
  if (version !== PYODIDE_VERSION) {
    throw new Error(`The pyodide dev dependency is ${version}, but PyTutor loads ${PYODIDE_VERSION}: install pyodide@${PYODIDE_VERSION}`);
  }
  // (A snapshot's interpreter has the hash seed of the one the snapshot was taken of.)
  return loadPyodide({ env: { PYTHONHASHSEED: '0' }, ...options } as Parameters<typeof loadPyodide>[0]) as Promise<NodePyodide>;
}

/** A Pyodide under Node, as a PySession can take a memory snapshot of it. */
export type NodePyodide = PyodideInterface & { makeMemorySnapshot?(): Uint8Array };

/** Collects what one stream receives, decoding UTF-8 across writes. */
export function textSink(): { write: (bytes: Uint8Array) => number; text: () => string } {
  const decoder = new TextDecoder();
  let text = '';
  return {
    write: bytes => { text += decoder.decode(bytes, { stream: true }); return bytes.length; },
    text: () => text + decoder.decode(),
  };
}

/** A stdin that reads `text` (UTF-8), then reports end of file. */
export function stdinOf(text: string): { read: (buffer: Uint8Array) => number } {
  const bytes = new TextEncoder().encode(text);
  let pos = 0;
  return {
    read: buffer => {
      const n = Math.min(buffer.length, bytes.length - pos);
      buffer.set(bytes.subarray(pos, pos + n));
      pos += n;
      return n;
    },
  };
}
