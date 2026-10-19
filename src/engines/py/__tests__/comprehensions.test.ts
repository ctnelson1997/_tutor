/**
 * Comprehensions in frames of their own (#33), the tracer run in a real
 * Pyodide: each list, set and dict comprehension is compiled as a function
 * called on its outermost iterable (named <listcomp>, <setcomp>, <dictcomp>),
 * so its steps show its own variables, the calls it makes and the collection
 * it returns, the tracer never runs the program's code itself, and the
 * module's variables are read from its globals (3.12's f_locals corrupts an
 * inlined comprehension's hidden locals). Also: a frame an exception leaves,
 * after a finally block or a comprehension's cleanup, gets no `return ↵`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionSnapshot, RuntimeValue, StackFrame } from '../../../types/snapshot';
import { loadTracer, runProgram } from '../run';
import { getTracerCode } from '../tracer';
import { loadNodePyodide, type PyodideInterface } from './cpython/pyodideNode';

let py: PyodideInterface;
const tracer = getTracerCode();

beforeAll(async () => {
  py = await loadNodePyodide();
  loadTracer(py, tracer);
}, 60_000);

function runFull(source: string) {
  const reply = runProgram(py, source);
  if (reply.type !== 'result') throw new Error(reply.message);
  return reply;
}
const run = (source: string): ExecutionSnapshot[] => runFull(source).snapshots;

const last = (steps: ExecutionSnapshot[]) => steps[steps.length - 1];
const names = (s: ExecutionSnapshot) => s.callStack.map(f => f.name);
const top = (s: ExecutionSnapshot): StackFrame => s.callStack[s.callStack.length - 1];
const vars = (f: StackFrame) => Object.fromEntries(f.variables.map(v => [v.name, v.value]));
const shown = (v: RuntimeValue | undefined) => (v === undefined ? undefined : v.type === 'ref' ? `#${v.heapId}` : v.value);

describe('comprehension frames', () => {
  it('gives a module-level list comprehension a frame with its variable, one step per iteration, and its list as return value', () => {
    const steps = run('x = "outer"\nsquares = [x * x for x in range(3)]\nprint(x, squares)\n');
    const comp = steps.filter(s => names(s).join('>') === '<module>>list comprehension');
    expect(comp.map(s => shown(vars(top(s)).x))).toEqual([0, 1, 2, undefined]);
    const returned = vars(top(comp[comp.length - 1]))['return ↵'];
    expect(returned?.type).toBe('ref');
    // The module frame keeps its own x, and squares is the list the comprehension returned.
    for (const s of comp) expect(shown(vars(s.callStack[0]).x)).toBe('outer');
    const after = steps.find(s => s.line === 3)!;
    expect(shown(vars(after.callStack[0]).squares)).toBe(shown(returned));
    expect(last(steps).stdout).toEqual(['outer [0, 1, 4]']);
  });

  it('names set and dict comprehensions, and a generator expression has one real frame', () => {
    const steps = run('s = {c for c in "ab"}\nd = {k: len(k) for k in ["x", "yy"]}\ntotal = sum(n * 2 for n in [1, 2])\n');
    const frames = new Set(steps.flatMap(s => names(s).slice(1)));
    expect(frames).toEqual(new Set(['set comprehension', 'dict comprehension', 'generator expression']));
    expect(steps.every(s => names(s).filter(n => n === 'generator expression').length <= 1)).toBe(true);
    // Each element the generator yields is its return value at that step; exhausted, it returns None.
    const yielded = steps.filter(s => top(s).name === 'generator expression').map(s => shown(vars(top(s))['return ↵'])).filter(v => v !== undefined);
    expect(yielded).toEqual([2, 4, null]);
  });

  it("shows a call made inside a comprehension in the callee's own frame, with its return value", () => {
    const steps = run('def sq(n):\n    return n * n\n\nvals = [sq(i) for i in range(2)]\n');
    const inside = steps.filter(s => names(s).join('>') === '<module>>list comprehension>sq');
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.map(s => shown(vars(top(s)).n))).toContain(1);
    expect(inside.map(s => shown(vars(top(s))['return ↵'])).filter(v => v !== undefined)).toEqual([0, 1]);
  });

  it("runs the program's code once: side effects and random draws happen as in CPython", () => {
    const steps = run('it = iter([1, 2, 3, 4])\npairs = [(a, next(it)) for a in it]\nimport random\nrandom.seed(42)\nrolls = [random.randint(1, 6) for _ in range(10)]\nprint(pairs, rolls)\n');
    expect(last(steps).stdout).toEqual(['[(1, 2), (3, 4)] [6, 1, 1, 6, 3, 2, 2, 2, 6, 1]']);
  });

  it('shows a module variable as it is, even with a later comprehension using its name', () => {
    const steps = run('for name in ["a", "b", "c"]:\n    if name:\n        last = name\nprint(last)\nupper = [name.upper() for name in ["x"]]\n');
    const atLine2 = steps.filter(s => s.line === 2).map(s => shown(vars(s.callStack[0]).name));
    expect(atLine2).toEqual(['a', 'b', 'c']);
    expect(last(steps).console).toBeUndefined();
  });

  it("steps through a comprehension written over several lines on its own lines", () => {
    const steps = run('data = [1, -2, 3]\nresult = [\n    x * 10\n    for x in data\n    if x > 0\n]\n');
    const lines = new Set(steps.filter(s => top(s).name === 'list comprehension').map(s => s.line));
    expect(lines.size).toBeGreaterThan(1);
  });

  it('keeps class names out of a class-body comprehension, as CPython does', () => {
    const steps = run('class C:\n    factor = 10\n    values = [v * 2 for v in range(3)]\n    try:\n        scaled = [v * factor for v in range(3)]\n    except NameError as e:\n        scaled = str(e)\nprint(C.values, C.scaled)\n');
    expect(last(steps).stdout).toEqual(["[0, 2, 4] name 'factor' is not defined"]);
  });

  it('leaves a comprehension with an assignment expression inlined, so its target is the module variable', () => {
    const reply = runFull('total = 0\nrunning = [total := total + x for x in [1, 2, 3]]\nprint(total, running)\n');
    expect(last(reply.snapshots).stdout).toEqual(['6 [1, 3, 6]']);
    expect(reply.snapshots.some(s => names(s).includes('list comprehension'))).toBe(false);
  });

  it("keeps the comprehension's frame out of a traceback, as CPython 3.12 has none, its carets in the frame around it (#40)", () => {
    const reply = runFull('xs = [1, 0]\nys = [1 / x for x in xs]\n');
    expect(reply.error?.kind).toBe('exception');
    expect(reply.error?.stderr).toBe('Traceback (most recent call last):\n  File "main.py", line 2, in <module>\n    ys = [1 / x for x in xs]\n          ~~^~~\nZeroDivisionError: division by zero');
    // The comprehension the exception leaves shows no return value.
    expect(reply.snapshots.some(s => top(s).name === 'list comprehension' && 'return ↵' in vars(top(s)))).toBe(false);
  });
});

describe('a frame an exception leaves (#33)', () => {
  it('gets no return ↵, even after its finally block ran', () => {
    const steps = run('def f():\n    try:\n        return 1 / 0\n    finally:\n        done = True\n\ntry:\n    f()\nexcept ZeroDivisionError:\n    print("caught")\n');
    expect(steps.some(s => top(s).name === 'f' && 'return ↵' in vars(top(s)))).toBe(false);
    expect(steps.some(s => top(s).name === 'f' && s.line === 5)).toBe(true);
    expect(last(steps).stdout).toEqual(['caught']);
  });

  it("still shows a generator's yields and return", () => {
    const steps = run('def gen():\n    yield 1\n    return 2\n\ng = gen()\nprint(next(g))\ntry:\n    next(g)\nexcept StopIteration as e:\n    print(e.value)\n');
    const returns = steps.filter(s => top(s).name === 'gen').map(s => shown(vars(top(s))['return ↵'])).filter(v => v !== undefined);
    expect(returns).toEqual([1, 2]);
  });
});
