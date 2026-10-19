/**
 * The tracer on its own terms, not the program's (#34), run in a real
 * Pyodide: drawing objects runs none of the program's code; the recursion
 * limit is the one `python main.py` has; ints past the digit limit are drawn
 * by their size; a program that replaces builtins or sys.stdout runs as in
 * CPython and the tracer keeps working; and a failure of the tracer itself
 * keeps the steps so far and says so.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ExecutionSnapshot, HeapObject, StackFrame } from '../../../types/snapshot';
import { INTERNAL_ERROR, loadTracer, runProgram } from '../run';
import { getTracerCode } from '../tracer';
import { loadNodePyodide, textSink, type PyodideInterface } from './cpython/pyodideNode';

let py: PyodideInterface;
const tracer = getTracerCode();
const pyStderr = textSink();

beforeAll(async () => {
  py = await loadNodePyodide();
  loadTracer(py, tracer);
  py.setStderr(pyStderr);
}, 60_000);

afterEach(() => vi.restoreAllMocks());

function runFull(source: string) {
  const reply = runProgram(py, source);
  if (reply.type !== 'result') throw new Error(reply.message);
  return reply;
}
const run = (source: string): ExecutionSnapshot[] => runFull(source).snapshots;
const last = (steps: ExecutionSnapshot[]) => steps[steps.length - 1];
const vars = (f: StackFrame) => Object.fromEntries(f.variables.map(v => [v.name, v.value]));
const heapOf = (s: ExecutionSnapshot, name: string): HeapObject => {
  const v = vars(s.callStack[0])[name];
  if (v?.type !== 'ref') throw new Error(`${name} isn't a reference`);
  return s.heap.find(h => h.id === v.heapId)!;
};

describe("drawing runs none of the program's code", () => {
  it('reads instances, list subclasses and slots as stored, never through their hooks', () => {
    const steps = run([
      'class Loud:',
      '    def __init__(self):',
      '        self.x = 1',
      '    def __getattribute__(self, name):',
      '        print("getattribute", name)',
      '        return object.__getattribute__(self, name)',
      '    def __getattr__(self, name):',
      '        print("getattr", name)',
      '        raise AttributeError(name)',
      '    def __repr__(self):',
      '        print("repr")',
      '        return "Loud()"',
      'class LoudList(list):',
      '    def __len__(self):',
      '        print("len")',
      '        return 0',
      '    def __getitem__(self, i):',
      '        print("getitem")',
      '        return None',
      'class Slotted:',
      '    __slots__ = ("a", "unset")',
      '    def __init__(self):',
      '        self.a = 7',
      '    def __getattr__(self, name):',
      '        print("getattr", name)',
      '        raise AttributeError(name)',
      'obj = Loud()',
      'items = LoudList([3, 4])',
      's = Slotted()',
      'done = True',
    ].join('\n'));
    expect(last(steps).stdout).toEqual([]);
    const end = last(steps);
    expect(heapOf(end, 'obj')).toMatchObject({ objectType: 'object', label: 'Loud', properties: [{ key: 'x', value: { type: 'number', value: 1 } }] });
    expect(heapOf(end, 'items').properties.map(p => p.value)).toEqual([{ type: 'number', value: 3 }, { type: 'number', value: 4 }]);
    expect(heapOf(end, 's').properties).toEqual([{ key: 'a', value: { type: 'number', value: 7 } }]);
  });

  it("draws an object used as a dict key as an arrow to it, and a tuple key as its text", () => {
    const end = last(run('class K:\n    def __str__(self):\n        print("str")\n        return "k"\nk = K()\nd = {k: 1, (1, "a"): 2}\n'));
    expect(end.stdout).toEqual([]);
    const props = heapOf(end, 'd').properties;
    expect(props[0].keyValue).toEqual(vars(end.callStack[0]).k);
    expect(props[1]).toMatchObject({ key: "(1, 'a')", value: { type: 'number', value: 2 } });
    expect(props[1].keyValue?.type).toBe('ref');
  });

  it('draws data nested deeper than the recursion limit', () => {
    const steps = run('import json\ndeep = json.loads("[" * 1500 + "]" * 1500)\ndel json\ndone = True\n');
    expect(last(steps).heap.filter(h => h.objectType === 'list')).toHaveLength(1500);
  });
});

describe('the recursion limit, as python main.py has it', () => {
  it('lets the program recurse as deep as CPython does, and goes on tracing after the RecursionError', () => {
    // (CPython: with the limit at 80, the module frame and 79 calls of down. The
    // functions alone are imported: the sys module itself is drawn in full until #38.)
    const src = 'from sys import setrecursionlimit, getrecursionlimit\nsetrecursionlimit(80)\ndeepest = 0\ndef down(n):\n    global deepest\n    deepest = n\n    down(n + 1)\ntry:\n    down(1)\nexcept RecursionError as e:\n    print(deepest, e, getrecursionlimit())\nsetrecursionlimit(50)\ntry:\n    down(1)\nexcept RecursionError:\n    print(deepest, getrecursionlimit())\nafter = 1\n';
    const reply = runFull(src);
    expect(last(reply.snapshots).stdout).toEqual(['79 maximum recursion depth exceeded 80', '49 50']);
    expect(reply.snapshots.some(s => s.line === 17)).toBe(true);
  });

  it("gives an uncaught RecursionError CPython's traceback, without a frame that never ran", () => {
    const reply = runFull('from sys import setrecursionlimit\nsetrecursionlimit(40)\ndef f(n):\n    return f(n + 1)\nf(0)\n');
    expect(reply.error?.message).toBe('RecursionError: maximum recursion depth exceeded');
    const frames = reply.error!.stderr!.split('\n').filter(l => l.startsWith('  File'));
    expect(frames[frames.length - 1]).toBe('  File "main.py", line 4, in f');
    expect(frames.filter(l => l.includes('line 3'))).toEqual([]);
  });

  it('restores the limit and sys.getrecursionlimit after the run', () => {
    run('import sys\nsys.setrecursionlimit(50)\n');
    expect(py.runPython('import sys; (sys.getrecursionlimit(), sys.getrecursionlimit.__module__)').toJs()).toEqual([1000, 'sys']);
  });
});

describe('values the tracer used to fail on', () => {
  it('draws an int past the digit limit by its size, and the run goes on', () => {
    const reply = runFull('x = 10 ** 5000\ny = x + 1\nprint(len(str(x // 10 ** 4990)))\n');
    expect(reply.error).toBeUndefined();
    expect(vars(last(reply.snapshots).callStack[0]).x).toEqual({ type: 'number', value: '<int with 5001 digits>', display: '<int with 5001 digits>' });
    expect(last(reply.snapshots).stdout).toEqual(['11']);
  });
});

describe('a program that replaces what the tracer uses', () => {
  it('replaces builtins as in CPython, and the tracer keeps its own', () => {
    const steps = run('import builtins\noriginal = builtins.len\nbuiltins.len = lambda x: 99\nnums = [1, 2, 3]\nshown = len(nums)\nbuiltins.len = original\nprint(shown, len(nums))\n');
    expect(last(steps).stdout).toEqual(['99 3']);
    expect(heapOf(last(steps), 'nums').properties).toHaveLength(3);
  });

  it('swaps sys.stdout and back through sys.__stdout__, as in CPython', () => {
    const steps = run('import sys, io\nbuf = io.StringIO()\nsys.stdout = buf\nprint("hidden")\nsys.stdout = sys.__stdout__\nprint("shown", repr(buf.getvalue()))\n');
    expect(last(steps).stdout).toEqual(["shown 'hidden\\n'"]);
  });

  it("runs in a namespace of its own: a variable named like a builtin is the program's", () => {
    const end = last(run('list = [3, 1, 2]\nmax = 10\nprint(__name__)\n'));
    expect(end.callStack[0].variables.map(v => v.name).sort()).toEqual(['list', 'max']);
    expect(end.stdout).toEqual(['__main__']);
  });
});

describe('a failure of the tracer itself', () => {
  it('keeps the steps so far and reports an internal error, the details only on the console', () => {
    py.runPython("_MAX_SEQ_PROPS = 'broken'");
    try {
      const reply = runFull('a = 1\nb = [1, 2]\nc = 3\n');
      expect(reply.error).toMatchObject({ kind: 'error', message: INTERNAL_ERROR });
      expect(reply.snapshots.length).toBeGreaterThan(0);
      expect(JSON.stringify(reply)).not.toMatch(/Traceback|_serialize/);
      expect(pyStderr.text()).toContain('PyTutor internal error');
    } finally {
      py.runPython('_MAX_SEQ_PROPS = 100');
    }
    expect(runFull('ok = 1\n').error).toBeUndefined();
  });
});
