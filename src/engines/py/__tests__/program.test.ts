/**
 * The program runs as `python main.py` runs it, in a real Pyodide: as the
 * `__main__` module (#77), so `unittest.main()`, `doctest.testmod()` and
 * pickle find what it defines, with the builtins module as `__builtins__`,
 * `__file__` and `sys.argv`; and tracing changes nothing it does (#78): its
 * objects die where it releases them, its own trace function gets CPython's
 * events, and its streams are CPython's TextIOWrappers.
 */
import { readFileSync } from 'node:fs';
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
    expect(reply.snapshots.some(s => s.callStack.some(f => f.name === 'TestAdd.test_wrong'))).toBe(true);
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

/**
 * What the program prints run untraced in this interpreter, in a module of
 * its own: what python main.py prints, which tracing must not change.
 */
function plainOutput(source: string): string {
  py.globals.set('__plain_src', source);
  const out = py.runPython([
    'import io, sys, types, contextlib',
    '_plain_buf = io.StringIO()',
    "_plain_main = types.ModuleType('__main__')",
    "_plain_main.__builtins__ = __import__('builtins')",
    "_plain_saved = sys.modules['__main__']",
    "sys.modules['__main__'] = _plain_main",
    'try:',
    '    with contextlib.redirect_stdout(_plain_buf):',
    "        exec(compile(__plain_src, 'main.py', 'exec'), _plain_main.__dict__)",
    'finally:',
    "    sys.modules['__main__'] = _plain_saved",
    '_plain_buf.getvalue()',
  ].join('\n')) as string;
  return out.replace(/\n$/, '');
}

describe("PyTutor's comprehension frames are invisible to the program (#85, extra/comprehension-transparency)", () => {
  it('folds them into the frame around them in the tracebacks the program prints, carets under the failing expression', () => {
    const text = consoleText(runFull([
      'import traceback',
      'def f(data):',
      '    try:',
      '        return [1 / x for x in data]',
      '    except ZeroDivisionError:',
      '        traceback.print_exc()',
      'f([0])',
    ].join('\n')).snapshots);
    expect(text).toBe([
      '! Traceback (most recent call last):',
      '!   File "main.py", line 4, in f',
      '!     return [1 / x for x in data]',
      '!             ~~^~~',
      '! ZeroDivisionError: division by zero',
    ].join('\n'));
  });

  it("leaves them out of sys._getframe and of a stack the program prints, and nothing below the program's module frame", () => {
    const text = consoleText(runFull([
      'import sys, traceback',
      'def f():',
      '    return [sys._getframe(i).f_code.co_name for i in range(2)]',
      'print(f())',
      'print([s.name for s in traceback.extract_stack()])',
      'try:',
      '    sys._getframe(1)',
      'except ValueError as e:',
      '    print(e)',
    ].join('\n')).snapshots);
    expect(text).toBe("['f', '<module>']\n['<module>']\ncall stack is not deep enough");
  });

  it('keeps a comprehension inlined when it reads a local not bound yet: UnboundLocalError, as CPython 3.12 raises', () => {
    const source = [
      'def late():',
      '    r = [y for _ in range(2)]',
      '    y = 1',
      '    return r',
      'def maybe(flag):',
      '    if flag:',
      '        y = 2',
      '    return [y for _ in range(1)]',
      'def bound(k):',
      '    total = 1',
      '    return [x * k * total for x in range(2)]',
      'for call in (late, lambda: maybe(False)):',
      '    try:',
      '        call()',
      '    except UnboundLocalError as e:',
      '        print(type(e).__name__)',
      'print(bound(3))',
    ].join('\n');
    const steps = runFull(source).snapshots;
    expect(consoleText(steps)).toBe('UnboundLocalError\nUnboundLocalError\n[0, 3]');
    // A comprehension that reads only bound locals keeps its frame.
    expect(steps.some(s => s.callStack.at(-1)!.name === 'list comprehension' && s.callStack.at(-2)!.name === 'bound')).toBe(true);
    expect(steps.some(s => s.callStack.at(-1)!.name === 'list comprehension' && s.callStack.at(-2)!.name === 'late')).toBe(false);
  });

  it("names the module's frame the Global frame and a method's by its class; hides a generic class's type parameters", () => {
    const steps = runFull([
      'class Animal:',
      '    def __init__(self, name):',
      '        self.name = name',
      'class Dog(Animal):',
      '    def __init__(self, name):',
      '        super().__init__(name)',
      'class Box[T]:',
      '    size = 1',
      'Dog("rex")',
    ].join('\n')).snapshots;
    expect(steps.some(s => s.callStack.map(f => f.name).join(' > ') === 'Global frame > Dog.__init__ > Animal.__init__')).toBe(true);
    const body = steps.filter(s => s.callStack.at(-1)!.name === 'Box').at(-1)!;
    expect(body.callStack.at(-1)!.variables.map(v => v.name)).toEqual(['size']);
  });
});

describe("tracing changes nothing the program does (#78)", () => {
  const lifetimes = readFileSync(new URL('./cpython/cases/extra/object-lifetimes.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

  it('objects die where the program releases them: __del__, weak references, generators, cycles (extra/object-lifetimes)', () => {
    const steps = runFull(lifetimes).snapshots;
    expect(consoleText(steps)).toBe(plainOutput(lifetimes));
    expect(consoleText(steps).split('\n').slice(0, 2)).toEqual(['released a', 'after a']);
  });

  it('runs __del__ and an abandoned generator\'s finally block with their steps', () => {
    const steps = runFull(lifetimes).snapshots;
    const del = steps.filter(s => s.callStack.at(-1)!.name === 'Resource.__del__');
    expect(del.length).toBeGreaterThan(6);
    expect(del[0].callStack.map(f => f.name)).toEqual(['Global frame', 'Resource.__del__']);
    const finallyLine = lifetimes.split('\n').indexOf('        print("generator closed")') + 1;
    expect(steps.some(s => s.callStack.at(-1)!.name === 'numbers' && s.line === finallyLine)).toBe(true);
  });

  it('counts references as python main.py does: lists, objects and numbers in module variables', () => {
    const source = [
      'import sys',
      'class P: pass',
      'p = P()',
      'items = [p, p]',
      'n = int("123456789")',
      's = "".join(["ab", "cd"])',
      'print(sys.getrefcount(items), sys.getrefcount(p), sys.getrefcount(n), sys.getrefcount(s))',
      'other = items',
      'print(sys.getrefcount(items))',
    ].join('\n');
    expect(consoleText(runFull(source).snapshots)).toBe(plainOutput(source));
    expect(plainOutput(source)).toBe('2 4 2 2\n3');
  });

  it("gives the program's own trace function the events CPython gives it (extra/program-settrace)", () => {
    const source = readFileSync(new URL('./cpython/cases/extra/program-settrace.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const steps = runFull(source).snapshots;
    expect(consoleText(steps)).toBe(plainOutput(source));
    // Its sys.settrace(None) ends only its own tracing: the steps go on to the end.
    expect(steps.at(-1)!.line).toBe(source.trimEnd().split('\n').length);
  });

  it('goes on after sys.settrace(None), with the output written since', () => {
    const steps = runFull('import sys\nsys.settrace(None)\na = 1\nprint(a)').snapshots;
    expect(consoleText(steps)).toBe('1');
    expect(steps.map(s => s.line)).toEqual([1, 2, 3, 4, 4]);
  });

  it('ends a trace function that raises, the exception reaching the program, as CPython does', () => {
    const source = [
      'import sys',
      'def bad(frame, event, arg):',
      '    raise ValueError("from the tracer")',
      'def f():',
      '    return 1',
      'sys.settrace(bad)',
      'try:',
      '    f()',
      'except ValueError as e:',
      '    print("caught", e)',
      'print(sys.gettrace(), f())',
    ].join('\n');
    const steps = runFull(source).snapshots;
    expect(consoleText(steps)).toBe(plainOutput(source));
    expect(consoleText(steps)).toBe('caught from the tracer\nNone 1');
    // The tracer goes on.
    expect(steps.at(-1)!.line).toBe(11);
  });

  it("makes sys.stdout and sys.stderr CPython's TextIOWrappers (extra/stream-features)", () => {
    const steps = runFull([
      'import io, sys',
      'sys.stdout.reconfigure(encoding="utf-8")',
      'sys.stdout.buffer.write(b"bytes\\n")',
      'sys.stderr.buffer.write("caf\\u00e9\\n".encode())',
      'print(type(sys.stdout).__name__, type(sys.stdout) is io.TextIOWrapper, sys.stdout.line_buffering, sys.stdout.write_through)',
      'print(repr(sys.stdout), sys.stdout.name, sys.stderr.errors)',
      'print("no newline", end="")',
      'print("", "end", sep="|")',
    ].join('\n')).snapshots;
    expect(consoleText(steps)).toBe([
      'bytes',
      '! café',
      'TextIOWrapper True False True',
      "<_io.TextIOWrapper name='<stdout>' mode='w' encoding='utf-8'> <stdout> backslashreplace",
      'no newline|end',
    ].join('\n'));
  });

  it('refuses what CPython\'s streams refuse: str to the buffer, text it can\'t encode, writes after close', () => {
    const reply = runProgram(py, [
      'import sys',
      'try:',
      '    sys.stdout.buffer.write("text")',
      'except TypeError as e:',
      '    print(e)',
      'try:',
      '    print("\\udc80")',
      'except UnicodeEncodeError as e:',
      '    print(e.reason)',
    ].join('\n'));
    if (reply.type !== 'result') throw new Error(reply.message);
    expect(consoleText(reply.snapshots)).toBe("a bytes-like object is required, not 'str'\nsurrogates not allowed");
  });

  it('reads the stdin panel through sys.stdin and sys.stdin.buffer, from one position, each read echoed', () => {
    const reply = runProgram(py, [
      'import io, sys',
      'print(type(sys.stdin).__name__, isinstance(sys.stdin, io.TextIOWrapper), repr(sys.stdin))',
      'first = sys.stdin.buffer.readline()',
      'second = input()',
      'third = sys.stdin.readline()',
      'rest = [line.strip() for line in sys.stdin]',
      'print(first, second, third, rest, sys.stdin.read())',
    ].join('\n'), { stdin: 'one\ntwo\nthree\nfour\nfive' });
    if (reply.type !== 'result') throw new Error(reply.message);
    const s = last(reply.snapshots);
    expect(s.stdout).toEqual([
      "TextIOWrapper True <_io.TextIOWrapper name='<stdin>' mode='r' encoding='utf-8'>",
      "b'one\\n' two three",
      " ['four', 'five'] ",
    ]);
    // What was read is echoed on the console, marked as input (#32).
    expect(s.console!.filter(l => l.input?.length).map(l => l.text.slice(l.input![0][0], l.input![0][1]))).toEqual(['one', 'two', 'three', 'four', 'five']);
  });
});
