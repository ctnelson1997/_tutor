import { describe, expect, it } from 'vitest';
import type { ExecutionSnapshot, PrimitiveValue, RuntimeValue } from '../../types/snapshot';
import { promoteToHeap } from '../promoteToHeap';

const num = (value: number | string, display?: string): PrimitiveValue => (display === undefined ? { type: 'number', value } : { type: 'number', value, display });

function snapshotOf(vars: Record<string, RuntimeValue>): ExecutionSnapshot {
  return {
    step: 0,
    line: 1,
    callStack: [{ name: '<module>', variables: Object.entries(vars).map(([name, value]) => ({ name, value })) }],
    heap: [{ id: '1', objectType: 'list', properties: [{ key: '0', value: num(5) }] }],
    stdout: [],
  };
}

function promoted(vars: Record<string, RuntimeValue>) {
  const s = promoteToHeap(snapshotOf(vars));
  const byName = Object.fromEntries(s.callStack[0].variables.map(v => [v.name, v.value]));
  const object = (name: string) => {
    const v = byName[name];
    if (v.type !== 'ref') throw new Error(`${name} wasn't promoted`);
    return s.heap.find(h => h.id === v.heapId)!;
  };
  return { s, byName, object };
}

describe('promoteToHeap (Python reference mode)', () => {
  it("names each value's Python type from the text Python writes for it (#37)", () => {
    const { object } = promoted({
      i: num(5),
      f: num(5, '5.0'),
      e: num(1e16, '1e+16'),
      inf: num('Infinity', 'inf'),
      big: num('1267650600228229401496703205376', '1267650600228229401496703205376'),
      huge: num('<int with 5001 digits>', '<int with 5001 digits>'),
      c: num('(3+4j)', '(3+4j)'),
      b: { type: 'boolean', value: true, display: 'True' },
      n: { type: 'null', value: null, display: 'None' },
      s: { type: 'string', value: 'hi' },
    });
    expect(Object.fromEntries(['i', 'f', 'e', 'inf', 'big', 'huge', 'c', 'b', 'n', 's'].map(k => [k, object(k).objectType]))).toEqual({
      i: 'int', f: 'float', e: 'float', inf: 'float', big: 'int', huge: 'int', c: 'complex', b: 'bool', n: 'NoneType', s: 'str',
    });
    expect(object('f').label).toBe('5.0');
    expect(object('big').label).toBe('1267650600228229401496703205376');
    expect(object('b').label).toBe('True');
    expect(object('s').label).toBe('"hi"');
  });

  it('shares one object between equal values, but not between 5 and 5.0', () => {
    const { byName } = promoted({ a: num(5), b: num(5), c: num(5, '5.0') });
    expect(byName.a).toEqual(byName.b);
    expect(byName.c).not.toEqual(byName.a);
  });

  it('promotes the primitives inside heap objects too, and leaves references alone', () => {
    const { s, byName } = promoted({ xs: { type: 'ref', heapId: '1' }, five: num(5) });
    expect(byName.xs).toEqual({ type: 'ref', heapId: '1' });
    const list = s.heap.find(h => h.id === '1')!;
    expect(list.properties[0].value).toEqual(byName.five);
  });
});
