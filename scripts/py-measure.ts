/**
 * The measurements behind #36's decisions, to repeat them:
 *   1. isolation: a full Pyodide load against a fresh interpreter restored
 *      from a memory snapshot (what PySession does for each run);
 *   2. recording: plain runs of the corpus against runs under a bare
 *      sys.settrace callback, a bare sys.monitoring callback, and PyTutor's
 *      tracer (time, and the reply's JSON);
 *   3. offline viewers: what bundling Pyodide into an exported file would add.
 *
 *   npx tsx scripts/py-measure.ts            # all three (about a minute)
 *   npx tsx scripts/py-measure.ts --quick    # isolation and viewer size only
 */
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { loadCases } from '../src/engines/py/__tests__/cpython/corpus';
import { loadNodePyodide, type NodePyodide } from '../src/engines/py/__tests__/cpython/pyodideNode';
import { loadTracer, runProgram } from '../src/engines/py/run';
import { getTracerCode } from '../src/engines/py/tracer';

const quick = process.argv.includes('--quick');
const ms = (t0: number) => Math.round(performance.now() - t0);
const mb = (n: number) => (n / 1e6).toFixed(1) + ' MB';

const MEASURE = String.raw`
import sys, io, time
def _measure(src, stdin, mode):
    code = compile(src, 'main.py', 'exec')
    count = [0]
    saved = sys.stdin, sys.stdout, sys.stderr
    sys.stdin, sys.stdout, sys.stderr = io.StringIO(stdin), io.StringIO(), io.StringIO()
    if mode == 'settrace':
        def tr(frame, event, arg):
            if frame.f_code.co_filename != 'main.py':
                return None
            count[0] += 1
            return tr
        sys.settrace(tr)
    elif mode == 'monitoring':
        mon = sys.monitoring
        E = mon.events
        mon.use_tool_id(3, 'measure')
        def cb(code, *args):
            if code.co_filename != 'main.py':
                return mon.DISABLE
            count[0] += 1
        for ev in (E.PY_START, E.PY_RESUME, E.PY_RETURN, E.PY_YIELD, E.LINE):
            mon.register_callback(3, ev, cb)
        mon.set_events(3, E.PY_START | E.PY_RESUME | E.PY_RETURN | E.PY_YIELD | E.LINE)
    t0 = time.perf_counter()
    try:
        exec(code, {'__name__': '__main__'})
    except BaseException:
        pass
    finally:
        t = time.perf_counter() - t0
        sys.settrace(None)
        if mode == 'monitoring':
            sys.monitoring.set_events(3, 0)
            sys.monitoring.free_tool_id(3)
        sys.stdin, sys.stdout, sys.stderr = saved
    return (t * 1000, count[0])
`;

async function main(): Promise<void> {
  const tracer = getTracerCode();

  console.log('1. Isolation');
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    await loadNodePyodide();
    console.log(`   full load: ${ms(t0)} ms`);
  }
  const t0 = performance.now();
  const base = await loadNodePyodide({ _makeSnapshot: true });
  loadTracer(base, tracer);
  const snapshot = base.makeMemorySnapshot!();
  console.log(`   load + tracer + snapshot: ${ms(t0)} ms, snapshot ${mb(snapshot.length)}`);
  const fresh = async (): Promise<NodePyodide> => {
    const py = await loadNodePyodide({ _loadSnapshot: snapshot });
    loadTracer(py, null);
    py.setStdout({ batched: () => {} });
    py.setStderr({ batched: () => {} });
    return py;
  };
  for (let i = 0; i < 3; i++) {
    const t1 = performance.now();
    await fresh();
    console.log(`   restored from the snapshot: ${ms(t1)} ms (rss ${mb(process.memoryUsage().rss)})`);
  }

  if (!quick) {
    console.log('2. Recording (the corpus without limits/ and syntax-errors/)');
    const totals = { plain: 0, settrace: 0, monitoring: 0, tracer: 0, json: 0, settraceEvents: 0, monitoringEvents: 0 };
    let n = 0;
    for (const c of loadCases()) {
      if (c.id.startsWith('limits/') || c.id.startsWith('syntax-errors/')) continue;
      for (const mode of ['plain', 'settrace', 'monitoring'] as const) {
        const py = await fresh();
        py.runPython(MEASURE);
        py.globals.set('_src', c.source);
        py.globals.set('_stdin', c.stdin ?? '');
        const [time, events] = (py.runPython(`_measure(_src, _stdin, '${mode}')`) as { toJs(): [number, number] }).toJs();
        totals[mode] += time;
        if (mode !== 'plain') totals[`${mode}Events`] += events;
      }
      const py = await fresh();
      const t1 = performance.now();
      const reply = runProgram(py, c.source, { stdin: c.stdin ?? '' });
      totals.tracer += performance.now() - t1;
      totals.json += JSON.stringify(reply).length;
      n++;
    }
    const r = Math.round;
    console.log(`   ${n} programs: plain ${r(totals.plain)} ms · bare sys.settrace ${r(totals.settrace)} ms (${totals.settraceEvents} events) · bare sys.monitoring ${r(totals.monitoring)} ms (${totals.monitoringEvents} events) · PyTutor's tracer ${r(totals.tracer)} ms, ${mb(totals.json)} of JSON`);
  }

  console.log('3. Offline viewers: Pyodide inside an exported file');
  const dir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
  let total = 0;
  for (const f of ['pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide.asm.js', 'pyodide.mjs', 'pyodide-lock.json']) {
    const size = statSync(join(dir, f)).size;
    total += size;
    console.log(`   ${f}: ${mb(size)}`);
  }
  console.log(`   in all ${mb(total)}, ${mb(total * 4 / 3)} as base64 in the HTML`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
