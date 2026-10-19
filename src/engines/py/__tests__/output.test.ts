/**
 * The program's output, captured at the streams (#31): the tracer runs in a
 * real Pyodide (the version the worker loads), and each step's `stdout` and
 * `console` are checked. The CPython suite compares whole programs' output
 * with CPython's; this pins down what each step shows.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionSnapshot, WorkerMessage } from '../../../types/snapshot';
import { runProgram } from '../run';
import { getTracerCode } from '../tracer';
import { loadNodePyodide, type PyodideInterface } from './cpython/pyodideNode';

let py: PyodideInterface;
const tracer = getTracerCode();

beforeAll(async () => {
  py = await loadNodePyodide();
}, 60_000);

function run(source: string): ExecutionSnapshot[] {
  const reply: WorkerMessage = runProgram(py, tracer, source);
  if (reply.type !== 'result') throw new Error(reply.message);
  return reply.snapshots;
}

const last = (steps: ExecutionSnapshot[]) => steps[steps.length - 1];

describe('output captured at the streams', () => {
  it("keeps print's end and sep, and splits stdout into lines as written", () => {
    const steps = run('for i in range(3):\n    print(i, end=" ")\nprint()\nprint("a", "b", sep="-", end="!\\n")\nprint("x\\ny")\n');
    expect(last(steps).stdout).toEqual(['0 1 2 ', 'a-b!', 'x', 'y']);
    // The open line grows from step to step.
    expect(steps.map(s => s.stdout.join('|'))).toContain('0 1 ');
  });

  it('shows sys.stdout.write, writelines and a final line without a newline', () => {
    const steps = run('import sys\nn = sys.stdout.write("hello")\nsys.stdout.writelines([" world\\n", "x"])\nprint(n)\n');
    expect(last(steps).stdout).toEqual(['hello world', 'x5']);
  });

  it('keeps stdout to stdout, and lists every line with its stream once stderr is used', () => {
    const steps = run('import sys\nprint("one")\nprint("partial ", end="")\nprint("warn", file=sys.stderr)\nprint("two")\n');
    expect(steps.find(s => s.line === 4)?.console).toBeUndefined();
    expect(last(steps).stdout).toEqual(['one', 'partial two']);
    expect(last(steps).console).toEqual([
      { text: 'one', stream: 'stdout' },
      { text: 'partial warn', stream: 'stdout' },
      { text: 'two', stream: 'stdout' },
    ]);
    const err = run('import sys\nsys.stderr.write("e\\n")\nprint("o")\n');
    expect(last(err).console).toEqual([{ text: 'e', stream: 'stderr' }, { text: 'o', stream: 'stdout' }]);
    expect(last(err).stdout).toEqual(['o']);
  });

  it('lets redirect_stdout and print(file=...) write where the program says', () => {
    const steps = run('import io, contextlib\nbuf = io.StringIO()\nwith contextlib.redirect_stdout(buf):\n    print("hidden")\nprint(repr(buf.getvalue()))\n');
    expect(last(steps).stdout).toEqual(["'hidden\\n'"]);
  });

  it('shows warnings and traceback.print_exc() on stderr, naming main.py with its source lines', () => {
    const steps = run('import warnings, traceback\nwarnings.warn("careful")\ntry:\n    1 / 0\nexcept ZeroDivisionError:\n    traceback.print_exc()\n');
    const text = last(steps).console!.map(l => `${l.stream}: ${l.text}`);
    expect(text).toContain('stderr: main.py:2: UserWarning: careful');
    expect(text).toContain('stderr:   warnings.warn("careful")');
    expect(text).toContain('stderr:   File "main.py", line 4, in <module>');
    expect(text).toContain('stderr: ZeroDivisionError: division by zero');
  });

  it("names the streams as CPython does, and refuses what CPython's stdout refuses", () => {
    const steps = run('import sys\nprint(sys.stdout.name, sys.stderr.name, sys.stdout.encoding, sys.stdout.isatty())\nprint(repr(sys.stdout))\ntry:\n    sys.stdout.write(5)\nexcept TypeError as e:\n    print(e)\n');
    expect(last(steps).stdout).toEqual([
      '<stdout> <stderr> utf-8 False',
      "<_io.TextIOWrapper name='<stdout>' mode='w' encoding='utf-8'>",
      'write() argument must be str, not int',
    ]);
  });

  it("gives the streams back after the run, even after the program replaced them", () => {
    const before = py.runPython('import sys; (sys.stdout, sys.stderr)');
    run('import sys, io\nsys.stdout = io.StringIO()\nprint("gone")\n');
    expect(py.runPython('import sys; (sys.stdout, sys.stderr)').toString()).toBe(before.toString());
  });

  it("doesn't show the warning 3.12 gives when the tracer reads a frame holding a comprehension's locals", () => {
    const steps = run('xs = [x * x for x in range(3)]\nprint(xs)\n');
    expect(last(steps).console).toBeUndefined();
    expect(last(steps).stdout).toEqual(['[0, 1, 4]']);
  });
});
