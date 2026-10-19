/**
 * Fresh interpreters for each run (#35, #36's decision B): Pyodide is loaded
 * once with the tracer's definitions, a memory snapshot of it is taken, and
 * each run gets a new interpreter restored from that snapshot (about 80 ms,
 * where a full load takes about a second), so nothing one program does (a
 * patched module, a lowered recursion limit, a module in sys.modules,
 * replaced builtins or streams) reaches the next. The next interpreter is
 * restored while the student reads the steps.
 *
 * Memory snapshots are an experimental Pyodide API (`_makeSnapshot`,
 * `_loadSnapshot`, pinned at PYODIDE_VERSION); if taking or restoring one
 * fails, every run gets a fully loaded interpreter instead: as isolated,
 * slower.
 *
 * The worker uses it with Pyodide from the CDN, the CPython suite's runner
 * with the `pyodide` dev dependency.
 */
import type { WorkerMessage } from '../../types/snapshot';
import { loadTracer, runProgram, type PyodideApi, type RunOptions } from './run';

/** The Pyodide a session gets from its loader. */
export interface SessionPyodide extends PyodideApi {
  makeMemorySnapshot?(): Uint8Array;
}

/** Loads a Pyodide: with `_makeSnapshot` to take a snapshot of, with `_loadSnapshot` restored from one. */
export type PyodideLoader<P extends SessionPyodide = SessionPyodide> = (options: { _makeSnapshot?: boolean; _loadSnapshot?: Uint8Array }) => Promise<P>;

export class PySession<P extends SessionPyodide = SessionPyodide> {
  private snapshot: Uint8Array | null = null;
  private next: Promise<P> | null = null;
  /** Why snapshots aren't used (every run loads Pyodide in full), or null. */
  fallbackReason: string | null = null;

  private readonly load: PyodideLoader<P>;
  private readonly tracerCode: string;
  /** Called on each fresh interpreter before it runs a program (the suite sets its streams up as a browser worker's). */
  private readonly prepare: (py: P) => void;

  constructor(load: PyodideLoader<P>, tracerCode: string, prepare: (py: P) => void = () => {}) {
    this.load = load;
    this.tracerCode = tracerCode;
    this.prepare = prepare;
  }

  /** Load Pyodide and the tracer once, and take the snapshot every run starts from. */
  async init(): Promise<void> {
    // Pyodide failing to load (no network) is the caller's to report; a
    // snapshot that can't be made means full loads.
    let base: P;
    try {
      base = await this.load({ _makeSnapshot: true });
    } catch (err) {
      base = await this.load({});
      this.useFullLoads(err);
    }
    loadTracer(base, this.tracerCode);
    if (!this.fallbackReason) {
      try {
        if (typeof base.makeMemorySnapshot !== 'function') throw new Error('this Pyodide makes no memory snapshots');
        this.snapshot = base.makeMemorySnapshot();
      } catch (err) {
        this.useFullLoads(err);
      }
    }
    // The first run gets a restored interpreter, or (without a snapshot) this one, unused yet.
    this.next = this.snapshot ? this.fresh() : Promise.resolve(base);
  }

  private useFullLoads(err: unknown): void {
    this.snapshot = null;
    this.fallbackReason = err instanceof Error ? err.message : String(err);
    console.warn(`PyTutor: no Pyodide memory snapshot (${this.fallbackReason}); each run loads Pyodide in full.`);
  }

  /** A new interpreter with the tracer's definitions, in the state the snapshot has. */
  private async fresh(): Promise<P> {
    if (this.snapshot) {
      try {
        const py = await this.load({ _loadSnapshot: this.snapshot });
        loadTracer(py, null);
        return py;
      } catch (err) {
        this.useFullLoads(err);
      }
    }
    const py = await this.load({});
    loadTracer(py, this.tracerCode);
    return py;
  }

  /** Run a program in an interpreter no other run has used; the next one is made ready meanwhile. */
  async run(source: string, options: RunOptions = {}): Promise<WorkerMessage> {
    if (!this.next) throw new Error('PySession.init() has not been called');
    let py: P;
    try {
      py = await this.next;
    } catch {
      // Making it ready failed (a full load needs the network): try again now.
      py = await this.fresh();
    }
    this.next = this.fresh();
    // A failed restore must not stay pending unobserved until the next run.
    this.next.catch(() => {});
    this.prepare(py);
    return runProgram(py, source, options);
  }
}
