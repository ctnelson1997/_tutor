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
    expect(labels).toEqual([['function', '@staticmethod unit'], ['function', '@classmethod make'], ['function', '@property side']]);
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
    expect(names(body.callStack.at(-1)!)).toEqual(['__slots__', '__init__', '__repr__', 'push', 'return ↵']);
  });

  it("hides what an Enum's metaclass put in its class body, and draws members by name with their value", () => {
    const all = steps('from enum import Enum\nclass Color(Enum):\n    RED = 1\n    GREEN = 2\nfav = Color.GREEN\n');
    for (const s of all.filter(x => x.callStack.at(-1)!.name === 'Color')) {
      expect(names(s.callStack.at(-1)!)).not.toContain('_generate_next_value_');
    }
    const fav = drawn(all.at(-1)!, 'Color.GREEN');
    expect(fav.objectType).toBe('object');
    expect(fav.properties).toEqual([{ key: 'value', value: { type: 'number', value: 2 } }]);
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
    expect(keys(drawn(s, 'Fraction', 'object'))).toEqual([]);
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
