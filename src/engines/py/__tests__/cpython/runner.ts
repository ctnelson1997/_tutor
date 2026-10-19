/**
 * A PyTutor runner for the CPython differential suite (#29): a child process
 * (forked with tsx by harness.ts) that runs each program it is sent as the
 * browser's worker does, through a PySession (a fresh interpreter for each
 * program, restored from a memory snapshot taken once), each set up as the
 * browser's worker has it:
 *   - the case's stdin is the run's, as the stdin panel's text is;
 *     Pyodide's own stdin is a Web Worker's default, which has no prompt();
 *   - what reaches Pyodide's own stdout and stderr goes to the browser's
 *     console, which students don't see: it is reported as lost.
 *
 * The tracer's time budget is replaced by a work budget (SUITE_WORK_BUDGET
 * values serialized), so a slow run stops at the same step on every machine.
 * The run's CPU time (this thread's, so not the garbage collector's other
 * threads) is reported for py-diff.
 */
import { performance } from 'node:perf_hooks';
import { PySession } from '../../session';
import { getTracerCode } from '../../tracer';
import { loadNodePyodide, textSink, type NodePyodide } from './pyodideNode';
import type { WorkerMessage } from '../../../../types/snapshot';

export interface RunRequest {
  id: number;
  source: string;
  stdin: string | null;
}

export type RunnerMessage =
  | { id: number; type: 'started' }
  | { id: number; type: 'reply'; reply: WorkerMessage; cpuMs: number; wallMs: number; lostStdout: string; lostStderr: string }
  | { id: number; type: 'failed'; message: string };

// What reaches Pyodide's own streams in the current run.
let lostOut = textSink();
let lostErr = textSink();
const session = new PySession<NodePyodide>(options => loadNodePyodide(options), getTracerCode(), py => {
  py.setStdin({ stdin: () => { throw new ReferenceError('prompt is not defined'); } });
  lostOut = textSink();
  lostErr = textSink();
  py.setStdout(lostOut);
  py.setStderr(lostErr);
});
const ready = session.init();

/**
 * Values the tracer may serialize before it stops the run, in place of its
 * time budget. Between what the corpus's slowest finished runs serialize
 * (large-list-10000: 0.50 M, 3.7 s; recursion-error-message: 0.44 M, 5.6 s)
 * and what the runs the browser kills reach first (recursion-error-caught:
 * 0.99 M in 12 s; deep-recursion-500: far more).
 */
export const SUITE_WORK_BUDGET = 750_000;

/** This thread's CPU time (Node 24): unlike process.cpuUsage(), without V8's parallel garbage collection. */
const threadCpuUsage = (process as unknown as { threadCpuUsage?: typeof process.cpuUsage }).threadCpuUsage?.bind(process) ?? process.cpuUsage.bind(process);
const send = (m: RunnerMessage) => process.send!(m);

process.on('message', (req: RunRequest) => {
  void (async () => {
    try {
      await ready;
      send({ id: req.id, type: 'started' });
      const cpu = threadCpuUsage();
      const t0 = performance.now();
      const reply = await session.run(req.source, { stdin: req.stdin ?? '', timeBudgetSeconds: Infinity, workBudget: SUITE_WORK_BUDGET });
      const used = threadCpuUsage(cpu);
      send({
        id: req.id,
        type: 'reply',
        reply,
        cpuMs: (used.user + used.system) / 1000,
        wallMs: performance.now() - t0,
        lostStdout: lostOut.text(),
        lostStderr: lostErr.text(),
      });
    } catch (e) {
      send({ id: req.id, type: 'failed', message: e instanceof Error ? e.stack ?? e.message : String(e) });
    }
  })();
});
