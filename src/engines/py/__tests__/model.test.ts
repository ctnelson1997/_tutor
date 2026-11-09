/**
 * What a step shows of the program's state (#38), the tracer run in a real
 * Pyodide: classes drawn with their attributes and methods, class bodies
 * showing the methods the program wrote, modules as one object, nothing a
 * library adds, and variables in the order pythontutor.com lists them.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionSnapshot, HeapObject, StackFrame } from '../../../types/snapshot';
import { loadTracer, runProgram } from '../run';
import { getTracerCode } from '../tracer';
import { loadNodePyodide, type PyodideInterface } from './cpython/pyodideNode';

let py: PyodideInterface;

beforeAll(async () => {
  py = await loadNodePyodide();
  loadTracer(py, getTracerCode());
}, 60_000);

function steps(source: string): ExecutionSnapshot[] {
  const reply = runProgram(py, source);
  if (reply.type !== 'result') throw new Error(reply.message);
  if (reply.error) throw new Error(reply.error.message);
  return reply.snapshots;
}

const last = (source: string) => steps(source).at(-1)!;
const names = (f: StackFrame) => f.variables.map(v => v.name);
const keys = (h: HeapObject) => h.properties.map(p => p.key);

function drawn(s: ExecutionSnapshot, label: string, objectType?: string): HeapObject {
  const h = s.heap.find(x => x.label === label && (!objectType || x.objectType === objectType));
  if (!h) throw new Error(`no heap object labeled ${label}: ${s.heap.map(x => x.label).join(', ')}`);
  return h;
}

describe('classes', () => {
  it('draws a class with its class attributes and methods at every step after its class statement (extra/class-attributes)', () => {
    const source = readFileSync(new URL('./cpython/cases/extra/class-attributes.py', import.meta.url), 'utf8');
    const after = steps(source).filter(s => s.callStack[0].variables.some(v => v.name === 'Counter'));
    expect(after.length).toBeGreaterThan(10);
    const instances = after.map(s => {
      const counter = drawn(s, 'Counter');
      expect(counter.objectType).toBe('class');
      expect(keys(counter)).toEqual(['instances', 'step', '__init__', 'bump']);
      const value = counter.properties[0].value;
      return value.type === 'number' ? value.value : null;
    });
    expect(instances[0]).toBe(0);
    expect(instances.at(-1)).toBe(2);
  });

  it('names its bases, and draws its methods as functions, decorated ones by their decorator', () => {
    const s = last([
      'class Shape:',
      '    def area(self): return 0',
      'class Square(Shape):',
      '    sides = 4',
      '    @staticmethod',
      '    def unit(): return Square()',
      '    @classmethod',
      '    def make(cls): return cls()',
      '    @property',
      '    def side(self): return 1',
      'class Both(Square, Shape): pass',
    ].join('\n') + '\n');
    const square = drawn(s, 'Square(Shape)');
    expect(keys(square)).toEqual(['sides', 'unit', 'make', 'side']);
    const labels = square.properties.slice(1).map(p => (p.value.type === 'ref' ? s.heap.find(h => h.id === (p.value as { heapId: string }).heapId)! : null)).map(h => [h?.objectType, h?.label]);
    // With their parameters (#82); a property is read, not called.
    expect(labels).toEqual([['function', '@staticmethod unit()'], ['function', '@classmethod make(cls)'], ['function', '@property side']]);
    expect(drawn(s, 'Both(Square, Shape)').properties).toEqual([]);
    expect(keys(drawn(s, 'Shape'))).toEqual(['area']);
  });

  it("leaves out what Python and libraries add: a docstring, __hash__ = None, a dataclass's generated methods, an ABC's and an Enum's internals, total_ordering's methods, a named tuple's getters", () => {
    const s = last([
      'from dataclasses import dataclass',
      'from abc import ABC, abstractmethod',
      'from enum import Enum',
      'from functools import total_ordering',
      'from collections import namedtuple',
      'class Card:',
      '    """A card."""',
      '    def __eq__(self, other): return True',
      '@dataclass',
      'class Point:',
      '    x: int',
      '    y: int = 0',
      'class Shape(ABC):',
      '    @abstractmethod',
      '    def area(self): pass',
      'class Color(Enum):',
      '    RED = 1',
      '@total_ordering',
      'class Grade:',
      '    def __eq__(self, other): return True',
      '    def __lt__(self, other): return True',
      "Pair = namedtuple('Pair', ['first', 'second'])",
    ].join('\n') + '\n');
    expect(keys(drawn(s, 'Card'))).toEqual(['__eq__']);
    expect(keys(drawn(s, 'Point'))).toEqual(['y']);
    expect(keys(drawn(s, 'Shape(ABC)'))).toEqual(['area']);
    expect(keys(drawn(s, 'Color(Enum)'))).toEqual(['RED']);
    expect(keys(drawn(s, 'Grade'))).toEqual(['__eq__', '__lt__']);
    expect(keys(drawn(s, 'Pair(tuple)'))).toEqual([]);
  });

  it("draws a library's class or function by its name only", () => {
    const s = last('kinds = [int, ValueError, len]\n');
    expect(s.heap.filter(h => h.objectType !== 'list').map(h => [h.objectType, h.label, h.properties.length])).toEqual([
      ['class', 'int', 0], ['class', 'ValueError', 0], ['function', 'len', 0],
    ]);
  });

  it('shows the methods a class body defined, dunder ones too, and hides only its bookkeeping', () => {
    const all = steps([
      'class Stack:',
      '    """A stack."""',
      "    __slots__ = ('items',)",
      '    def __init__(self): self.items = []',
      '    def __repr__(self): return "Stack"',
      '    def push(self, x): self.items.append(x)',
      's = Stack()',
    ].join('\n') + '\n');
    const body = all.filter(s => s.callStack.at(-1)!.name === 'Stack').at(-1)!;
    // (No return value: a class body's is Python's own, #80.)
    expect(names(body.callStack.at(-1)!)).toEqual(['__slots__', '__init__', '__repr__', 'push']);
  });

  it("hides what an Enum's metaclass put in its class body, and draws members by name with their value", () => {
    const all = steps('from enum import Enum\nclass Color(Enum):\n    RED = 1\n    GREEN = 2\nfav = Color.GREEN\n');
    for (const s of all.filter(x => x.callStack.at(-1)!.name === 'Color')) {
      expect(names(s.callStack.at(-1)!)).not.toContain('_generate_next_value_');
    }
    const fav = drawn(all.at(-1)!, 'Color.GREEN');
    expect(fav.objectType).toBe('object');
    expect(fav.properties).toEqual([{ key: 'value', value: { type: 'number', value: 2, objectId: expect.any(String) } }]);
  });
});

describe('objects and modules', () => {
  it("shows the private attributes the program names, as Python stores them, but not a library's", () => {
    const s = last([
      'from fractions import Fraction',
      'class Account:',
      '    def __init__(self):',
      '        self._balance = 5',
      '        self.__pin = 1234',
      '        self.owner = "ada"',
      'a = Account()',
      'half = Fraction(1, 2)',
    ].join('\n') + '\n');
    expect(keys(drawn(s, 'Account', 'object'))).toEqual(['_balance', '_Account__pin', 'owner']);
    // A library value is drawn by its own repr, none of its private attributes (#81).
    expect(keys(drawn(s, 'Fraction(1, 2)', 'value'))).toEqual([]);
  });

  it('draws a module as one object, by its name', () => {
    const all = steps('import json\nimport math as m\nfrom os import path\ndata = json.loads("[1, 2]")\n');
    const s = all.at(-1)!;
    expect(s.heap.filter(h => h.objectType === 'module').map(h => [h.label, h.properties.length])).toEqual([['json', 0], ['math', 0], ['posixpath', 0]]);
    expect(Math.max(...all.map(x => x.heap.length))).toBeLessThanOrEqual(4);
  });
});

describe('the order of variables', () => {
  it("lists the module's variables in the order they first appeared, a deleted one keeping its place", () => {
    const s = last('a = 1\nlist = [2]\nmax = 3\ndel a\nb = 4\na = 5\n');
    expect(names(s.callStack[0])).toEqual(['a', 'list', 'max', 'b']);
  });

  it("lists a function's parameters, then its locals in its code's order", () => {
    const all = steps('def f(b, a):\n    z = b\n    y = a\n    x = z + y\n    return x\nf(1, 2)\n');
    const inF = all.filter(s => s.callStack.at(-1)!.name === 'f').at(-1)!;
    expect(names(inF.callStack.at(-1)!)).toEqual(['b', 'a', 'z', 'y', 'x', 'return ↵']);
  });

  it("hides a method's __class__ cell and the warnings registry, and shows the program's own module dunders", () => {
    const all = steps([
      'import warnings',
      '__version__ = "1.0"',
      'class A:',
      '    def hi(self): return 1',
      'class B(A):',
      '    def hi(self):',
      '        n = super().hi()',
      '        return n',
      'B().hi()',
      'warnings.warn("careful")',
    ].join('\n') + '\n');
    for (const s of all.filter(x => x.callStack.at(-1)!.name === 'hi')) expect(names(s.callStack.at(-1)!)).not.toContain('__class__');
    expect(names(all.at(-1)!.callStack[0])).toEqual(['warnings', '__version__', 'A', 'B']);
  });
});

describe('frames below the top (#80)', () => {
  const valueOf = (f: StackFrame, name: string) => {
    // A closure's variable from the function around it is among its closureVars (#82).
    const v = [...f.variables, ...(f.closureVars ?? [])].find(x => x.name === name)?.value;
    return v && v.type !== 'ref' ? v.value : v;
  };

  it("shows a nonlocal variable as the closure changed it, in the frame it belongs to", () => {
    const all = steps([
      'def outer():',
      '    count = 0',
      '    def inc():',
      '        nonlocal count',
      '        count += 1',
      '    inc()',
      '    inc()',
      '    return count',
      'outer()',
    ].join('\n'));
    for (const s of all.filter(x => x.callStack.at(-1)!.name === 'inc')) {
      const [, outerFrame, incFrame] = s.callStack;
      // One variable, one value: the frame below shows what the closure sees.
      expect(valueOf(outerFrame, 'count')).toBe(valueOf(incFrame, 'count'));
    }
  });

  it('reads a caller again when it calls: a variable it set on the same line, an assignment expression', () => {
    const all = steps([
      'def f(v):',
      '    return v * 2',
      'def check(n):',
      '    return n > 3',
      'def g(data):',
      '    x = 5; y = f(x)',
      '    if (n := len(data)) > 3 and check(n):',
      '        return y',
      'g([1, 2, 3, 4])',
    ].join('\n'));
    const inF = all.find(s => s.callStack.at(-1)!.name === 'f')!;
    expect(valueOf(inF.callStack[1], 'x')).toBe(5);
    const inCheck = all.find(s => s.callStack.at(-1)!.name === 'check')!;
    expect(valueOf(inCheck.callStack[1], 'n')).toBe(4);
  });

  it('keeps a deep recursion cheap: a frame that ran nothing since its last step is the same part', () => {
    const all = steps([
      'def down(n):',
      '    if n == 0:',
      '        return 0',
      '    return down(n - 1)',
      'down(30)',
    ].join('\n'));
    const deepest = all.find(s => s.callStack.length === 32)!;
    const before = all[all.indexOf(deepest) - 1];
    // The frames below the top are the same objects in consecutive steps (decodeReply shares a part).
    expect(deepest.callStack.slice(0, 30).every((f, i) => f === before.callStack[i])).toBe(true);
  });
});

describe('steps where CPython has events (#80, extra/steps-and-labels)', () => {
  const frameNames = (s: ExecutionSnapshot) => s.callStack.map(f => f.name);
  const returnOf = (s: ExecutionSnapshot) => s.callStack.at(-1)!.variables.find(v => v.name === 'return ↵' || v.name === 'yield ↵');
  const countdown = [
    'class Countdown:',
    '    def __init__(self, n):',
    '        self.n = n',
    '    def __iter__(self):',
    '        return self',
    '    def __next__(self):',
    '        if self.n == 0:',
    '            raise StopIteration',
    '        self.n -= 1',
    '        return self.n',
  ];

  it('gives a function whose for loop ended at its iterator\'s StopIteration a return step, and the run its last step', () => {
    const all = steps([...countdown, 'def show(it):', '    for x in it:', '        pass', 'show(Countdown(1))', 'for y in Countdown(1):', '    pass'].join('\n'));
    const showReturns = all.filter(s => s.callStack.at(-1)!.name === 'show' && returnOf(s));
    expect(showReturns.map(s => returnOf(s)!.value.type)).toEqual(['null']);
    // The program's last step is the module's, not one inside __next__.
    expect(frameNames(all.at(-1)!)).toEqual(['<module>']);
  });

  it('gives a function a return step after contextlib.suppress swallowed an exception', () => {
    const all = steps(['from contextlib import suppress', 'def parse(s):', '    with suppress(ValueError):', '        return int(s)', 'parse("x")'].join('\n'));
    expect(all.some(s => s.callStack.at(-1)!.name === 'parse' && returnOf(s)?.name === 'return ↵')).toBe(true);
  });

  it('takes a step where an exception is raised, with the exception, in the frame that raised it', () => {
    const all = steps(['def parse(s):', '    return int(s)', 'try:', '    parse("abc")', 'except ValueError as e:', '    print("bad")'].join('\n'));
    const raising = all.filter(s => s.exception);
    expect(raising.map(s => [s.line, frameNames(s).join(' > '), s.exception])).toEqual([
      [2, '<module> > parse', "ValueError: invalid literal for int() with base 10: 'abc'"],
    ]);
    // The next step is the handler, in the caller.
    expect(all[all.indexOf(raising[0]) + 1].line).toBe(5);
  });

  it("ends an uncaught exception's run at the step that raises it, and takes none for sys.exit()", () => {
    const reply = runProgram(py, 'x = 1\nraise KeyError("k")');
    if (reply.type !== 'result') throw new Error(reply.message);
    expect(reply.snapshots.at(-1)!.exception).toBe("KeyError: 'k'");
    expect(steps('import sys\nsys.exit(0)').some(s => s.exception)).toBe(false);
  });

  it("names an exception without running the program's code: its own __str__, or one on its arguments", () => {
    const reply = runProgram(py, [
      'class Oops(Exception):',
      '    def __str__(self):',
      '        print("__str__ ran")',
      '        return "oops"',
      'class Loud:',
      '    def __repr__(self):',
      '        print("__repr__ ran")',
      '        return "Loud()"',
      'for e in (Oops("plain"), ValueError(Loud()), KeyError(3), StopIteration()):',
      '    try:',
      '        raise e',
      '    except BaseException:',
      '        pass',
    ].join('\n'));
    if (reply.type !== 'result') throw new Error(reply.message);
    expect(reply.snapshots.at(-1)!.stdout).toEqual([]);
    expect(reply.snapshots.filter(s => s.exception).map(s => s.exception)).toEqual(['Oops: plain', 'ValueError: <Loud object>', 'KeyError: 3', 'StopIteration']);
  });

  it('gives a multi-line comprehension one step for its statement and no step before its first iteration', () => {
    const all = steps(['data = [3, -1]', 'result = [', '    x * 2', '    for x in data', '    if x > 0', ']'].join('\n'));
    // (The program's last step, its end, is on the statement's line too.)
    expect(all.slice(0, -1).filter(s => s.line === 2 && s.callStack.length === 1).length).toBe(1);
    const comp = all.filter(s => s.callStack.at(-1)!.name === 'list comprehension');
    // Each step before its return shows the iteration's variable.
    expect(comp.filter(s => !returnOf(s)).every(s => names(s.callStack.at(-1)!).includes('x'))).toBe(true);
  });

  it("labels a generator's yields yield ↵, and shows no return value for a class body (super()'s cell)", () => {
    const all = steps([
      'def gen():',
      '    yield 1',
      'list(gen())',
      'class Base:',
      '    def hi(self):',
      '        return 1',
      'class Child(Base):',
      '    def hi(self):',
      '        return super().hi()',
    ].join('\n'));
    const genSteps = all.filter(s => s.callStack.at(-1)!.name === 'gen' && returnOf(s));
    expect(genSteps.map(s => returnOf(s)!.name)).toEqual(['yield ↵', 'return ↵']);
    for (const s of all.filter(x => ['Base', 'Child'].includes(x.callStack.at(-1)!.name))) expect(returnOf(s)).toBeUndefined();
  });
});

describe("functions' state (#82, extra/closures-and-defaults)", () => {
  const fnOf = (s: ExecutionSnapshot, name: string): HeapObject => {
    const v = s.callStack[0].variables.find(x => x.name === name)?.value;
    if (v?.type !== 'ref') throw new Error(`${name} isn't a reference`);
    return s.heap.find(h => h.id === v.heapId)!;
  };
  const shownProps = (h: HeapObject) => h.properties.map(p => `${p.key}:${p.value.type === 'ref' ? 'ref' : p.value.display ?? p.value.value}`);
  const counters = [
    'def make_counter():',
    '    count = 0',
    '    def inc():',
    '        nonlocal count',
    '        count += 1',
    '        return count',
    '    return inc',
    'c1 = make_counter(); c2 = make_counter()',
    'c1(); c1(); c2()',
  ].join('\n');

  it("shows each counter's count on its function, at every step after it is made", () => {
    const all = steps(counters);
    const s = all.at(-1)!;
    expect([fnOf(s, 'c1').label, shownProps(fnOf(s, 'c1'))]).toEqual(['inc()', ['count:2']]);
    expect(shownProps(fnOf(s, 'c2'))).toEqual(['count:1']);
    for (const step of all.filter(x => x.callStack[0].variables.some(v => v.name === 'c2'))) {
      expect(shownProps(fnOf(step, 'c1')).length).toBe(1);
    }
  });

  it("shows a running closure's variable from the function around it apart, as a closure variable", () => {
    const inInc = steps(counters).filter(s => s.callStack.at(-1)!.name === 'inc');
    expect(inInc.length).toBeGreaterThan(5);
    for (const s of inInc) {
      const f = s.callStack.at(-1)!;
      expect(f.variables.map(v => v.name).filter(n => n !== 'return ↵')).toEqual([]);
      expect(f.closureVars!.map(v => v.name)).toEqual(['count']);
    }
  });

  it('shows a mutable default on its function between calls, already holding what the last call added', () => {
    const all = steps(['def add_item(item, bucket=[]):', '    bucket.append(item)', '    return bucket', "add_item('a')", 'x = 1', "add_item('b')"].join('\n'));
    for (const s of all.filter(x => x.callStack[0].variables.some(v => v.name === 'add_item'))) {
      const f = fnOf(s, 'add_item');
      expect([f.label, f.properties.map(p => p.key)]).toEqual(['add_item(item, bucket)', ['bucket=']]);
    }
    // Between the calls: about to run x = 1.
    const between = all.find(s => s.callStack.length === 1 && s.line === 5)!;
    const bucket = fnOf(between, 'add_item').properties[0].value;
    expect(bucket.type === 'ref' && between.heap.find(h => h.id === bucket.heapId)!.properties.map(p => p.value.type === 'string' ? p.value.value : null)).toEqual(['a']);
  });

  it('labels a function with its parameters, keyword-only and starred ones too', () => {
    const s = last('def f(a, b=2, /, c=3, *args, d, e=5, **kw):\n    pass\nlam = lambda x: x');
    expect([fnOf(s, 'f').label, fnOf(s, 'f').properties.map(p => p.key), fnOf(s, 'lam').label]).toEqual([
      'f(a, b, /, c, *args, d, e, **kw)', ['b=', 'c=', 'e='], '<lambda>(x)',
    ]);
  });

  it("shows no comprehension's variables from the frame around it: they are that frame's", () => {
    const all = steps('def scale(xs, k):\n    return [x * k for x in xs]\nscale([1, 2], 3)');
    for (const s of all.filter(x => x.callStack.at(-1)!.name === 'list comprehension')) {
      expect(s.callStack.at(-1)!.closureVars).toBeUndefined();
      expect(s.callStack.at(-1)!.variables.map(v => v.name)).not.toContain('k');
    }
  });
});

describe('heap objects drawn as what they hold (#81, extra/heap-objects)', () => {
  const at = (s: ExecutionSnapshot, name: string): HeapObject => {
    const v = s.callStack[0].variables.find(x => x.name === name)?.value;
    if (v?.type !== 'ref') throw new Error(`${name} isn't a reference`);
    return s.heap.find(h => h.id === v.heapId)!;
  };
  const text = (h: HeapObject) => h.properties.map(p => {
    const v = p.value;
    return `${p.key}=${v.type === 'ref' ? 'ref' : v.display ?? JSON.stringify(v.value)}`;
  });

  it('marks what a container holds past what is drawn, with its length in its label', () => {
    const s = last('nums = list(range(150))\nwords = {str(i): i for i in range(60)}\n');
    const nums = at(s, 'nums');
    expect([nums.label, nums.properties.length]).toEqual(['len 150', 101]);
    expect(text(nums).at(-1)).toBe('…=… 50 more (150 in all)');
    expect(text(at(s, 'words')).at(-1)).toBe('…=… 10 more (60 in all)');
  });

  it('draws library containers and values by what they hold: a deque, a range, a Fraction, a date, bytes', () => {
    const s = last([
      'from collections import deque',
      'from datetime import date',
      'from decimal import Decimal',
      'from fractions import Fraction',
      'q = deque([1, 2])',
      'r = range(0, 10, 2)',
      'f = Fraction(3, 4)',
      'd = Decimal("1.10")',
      'day = date(2024, 1, 2)',
      'b = b"abc"',
    ].join('\n'));
    expect([at(s, 'q').objectType, text(at(s, 'q'))]).toEqual(['deque', ['0=1', '1=2']]);
    expect(['r', 'f', 'd', 'day', 'b'].map(n => [at(s, n).objectType, at(s, n).label])).toEqual([
      ['value', 'range(0, 10, 2)'], ['value', 'Fraction(3, 4)'], ['value', "Decimal('1.10')"], ['value', 'datetime.date(2024, 1, 2)'], ['value', "b'abc'"],
    ]);
  });

  it('keeps a subclass\'s class and attributes, and a library dict\'s: Counter, defaultdict, OrderedDict in its order, a named tuple', () => {
    const s = last([
      'from collections import Counter, OrderedDict, defaultdict, namedtuple',
      'class Stack(list):',
      '    def __init__(self, name):',
      '        super().__init__()',
      '        self.name = name',
      's = Stack("plates")',
      's.append(1)',
      'c = Counter("aab")',
      'dd = defaultdict(list)',
      'od = OrderedDict(a=1, b=2)',
      'od.move_to_end("a")',
      'Point = namedtuple("Point", "x y")',
      'p = Point(1, 2)',
    ].join('\n'));
    expect([at(s, 's').objectType, at(s, 's').label, text(at(s, 's'))]).toEqual(['list', 'Stack', ['0=1', '.name="plates"']]);
    expect([at(s, 'c').label, text(at(s, 'c'))]).toEqual(['Counter', ['a=2', 'b=1']]);
    expect(at(s, 'dd').label).toBe('defaultdict(list)');
    expect(text(at(s, 'od'))).toEqual(['b=2', 'a=1']);
    expect([at(s, 'p').label, text(at(s, 'p'))]).toEqual(['Point', ['x=1', 'y=2']]);
  });

  it('draws a set\'s elements by what they are, not a position, and labels a frozenset', () => {
    const s = last('s = {3, 1}\nf = frozenset({"x"})\n');
    expect(at(s, 's').properties.map(p => p.key).sort()).toEqual(['1', '3']);
    expect([at(s, 'f').label, at(s, 'f').properties.map(p => p.key)]).toEqual(['frozenset', ["'x'"]]);
  });

  it("draws an exception's args, a generator's variables, an iterator's position, a dict view's keys", () => {
    const s = last([
      'err = ValueError("bad", 3)',
      'def gen():',
      '    total = 5',
      '    yield total',
      'g = gen()',
      'next(g)',
      'it = iter([10, 20])',
      'next(it)',
      'z = zip([1], [2])',
      'ks = {"a": 1}.keys()',
    ].join('\n'));
    expect([at(s, 'err').label, text(at(s, 'err'))]).toEqual(['ValueError', ['args=ref']]);
    expect([at(s, 'g').objectType, at(s, 'g').label, text(at(s, 'g'))]).toEqual(['generator', 'gen', ['total=5']]);
    expect([at(s, 'it').label, text(at(s, 'it'))]).toEqual(['list_iterator', ['over=ref', 'next index=1']]);
    expect([at(s, 'z').objectType, at(s, 'z').label]).toEqual(['iterator', 'zip']);
    expect([at(s, 'ks').label, text(at(s, 'ks'))]).toEqual(['dict_keys', ['0="a"']]);
  });

  it('names bound methods and @lru_cache functions, a bound method with its object', () => {
    const s = last([
      'import functools',
      'from random import randint',
      'class P:',
      '    def move(self): pass',
      'p = P()',
      'm = p.move',
      'ri = randint',
      '@functools.lru_cache',
      'def fib(n):',
      '    return n if n < 2 else fib(n - 1) + fib(n - 2)',
      'fib(4)',
    ].join('\n'));
    // A bound method without its self parameter (#82).
    expect([at(s, 'm').label, text(at(s, 'm'))]).toEqual(['P.move()', ['__self__=ref']]);
    // A library's hidden instance (random.randint's) isn't drawn.
    expect([at(s, 'ri').label, text(at(s, 'ri'))]).toEqual(['Random.randint(a, b)', []]);
    expect([at(s, 'fib').label, text(at(s, 'fib'))]).toEqual(['@lru_cache fib(n)', ['cached results=5']]);
  });

  it("draws a subclass of int or str as an object with its value, and runs none of the program's code doing it", () => {
    const reply = runProgram(py, [
      'class Celsius(float):',
      '    def __repr__(self):',
      '        print("repr ran")',
      '        return "C"',
      'class Loud(list):',
      '    def __iter__(self):',
      '        print("iter ran")',
      '        return iter([])',
      't = Celsius(21.5)',
      'l = Loud([1])',
    ].join('\n'));
    if (reply.type !== 'result') throw new Error(reply.message);
    const s = reply.snapshots.at(-1)!;
    expect(s.stdout).toEqual([]);
    expect([at(s, 't').label, text(at(s, 't'))]).toEqual(['Celsius', ['value=21.5']]);
    expect(text(at(s, 'l'))).toEqual(['0=1']);
  });
});
