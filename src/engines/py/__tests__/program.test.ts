/**
 * The program runs as `python main.py` runs it, in a real Pyodide: as the
 * `__main__` module (#77), so `unittest.main()`, `doctest.testmod()` and
 * pickle find what it defines, with the builtins module as `__builtins__`,
 * `__file__` and `sys.argv`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionSnapshot, WorkerMessage } from '../../../types/snapshot';
import { loadTracer, runProgram } from '../run';
import { getTracerCode } from '../tracer';
import { loadNodePyodide, type PyodideInterface } from './cpython/pyodideNode';

let py: PyodideInterface;

beforeAll(async () => {
  py = await loadNodePyodide();
  loadTracer(py, getTracerCode());
}, 60_000);

function runFull(source: string): Extract<WorkerMessage, { type: 'result' }> {
  const reply = runProgram(py, source);
  if (reply.type !== 'result') throw new Error(reply.message);
  return reply;
}
const last = (steps: ExecutionSnapshot[]) => steps[steps.length - 1];
/** The console at the last step, stderr's lines marked `!`. */
function consoleText(steps: ExecutionSnapshot[]): string {
  const s = last(steps);
  return (s.console ?? s.stdout.map(text => ({ text, stream: 'stdout' }))).map(l => (l.stream === 'stderr' ? '! ' : '') + l.text).join('\n');
}

describe('the program is the __main__ module (#77)', () => {
  it('unittest.main() runs the tests it defines and reports a failure', () => {
    const reply = runFull([
      'import time, unittest',
      'time.perf_counter = lambda: 0.0',
      'def add(a, b):',
      '    return a + b',
      'class TestAdd(unittest.TestCase):',
      '    def test_small(self):',
      '        self.assertEqual(add(1, 2), 3)',
      '    def test_wrong(self):',
      '        self.assertEqual(add(2, 2), 5)',
      'if __name__ == "__main__":',
      '    unittest.main()',
    ].join('\n'));
    const text = consoleText(reply.snapshots);
    expect(text).toContain('! FAIL: test_wrong (__main__.TestAdd.test_wrong)');
    expect(text).toContain('! AssertionError: 4 != 5');
    expect(text).toContain('! Ran 2 tests in 0.000s');
    expect(text).toContain('! FAILED (failures=1)');
    // unittest.main() ends with sys.exit(True): quietly, as python main.py does.
    expect(reply.error).toBeUndefined();
    // The test methods take steps.
    expect(reply.snapshots.some(s => s.callStack.some(f => f.name === 'test_wrong'))).toBe(true);
  });

  it('doctest.testmod() finds the examples in its docstrings', () => {
    const steps = runFull([
      'def square(n):',
      '    """',
      '    >>> square(-2)',
      '    5',
      '    """',
      '    return n * n',
      'import doctest',
      'print(doctest.testmod())',
    ].join('\n')).snapshots;
    const text = consoleText(steps);
    expect(text).toContain('File "main.py", line 3, in __main__.square');
    expect(text).toContain('TestResults(failed=1, attempted=1)');
  });

  it('pickles an instance of a class the program defines', () => {
    const steps = runFull([
      'import pickle, sys',
      'class Point:',
      '    def __init__(self, x):',
      '        self.x = x',
      'p = pickle.loads(pickle.dumps(Point(3)))',
      'print(p.x, sys.modules["__main__"].Point is Point)',
    ].join('\n')).snapshots;
    expect(consoleText(steps)).toBe('3 True');
  });

  it('has the names python main.py gives it, and main.py on disk', () => {
    const source = [
      'import sys',
      'print(type(__builtins__).__name__, __doc__, __file__, sys.argv)',
      'print([k for k in globals() if k.startswith("__")])',
      'print(open(__file__).read().splitlines()[0])',
    ].join('\n');
    const steps = runFull(source).snapshots;
    expect(consoleText(steps)).toBe([
      "module None main.py ['main.py']",
      "['__name__', '__doc__', '__package__', '__loader__', '__spec__', '__annotations__', '__builtins__', '__file__', '__cached__']",
      'import sys',
    ].join('\n'));
    // None of them is drawn as one of the program's variables.
    expect(last(steps).callStack[0].variables.map(v => v.name)).toEqual(['sys']);
  });

  it('has its docstring as __doc__', () => {
    expect(consoleText(runFull('"""A program."""\nprint(__doc__)').snapshots)).toBe('A program.');
  });

  it('gives sys.modules["__main__"], sys.argv and sys.path back after the run', () => {
    const before = py.runPython('import sys; (id(sys.modules["__main__"]), list(sys.argv), list(sys.path))').toJs();
    runFull('import sys\nsys.argv.append("x")\nleft_over = 1');
    const after = py.runPython('import sys; (id(sys.modules["__main__"]), list(sys.argv), list(sys.path))').toJs();
    expect(after).toEqual(before);
    // The next run's module is a new one.
    expect(consoleText(runFull('print("left_over" in globals())').snapshots)).toBe('False');
  });
});
