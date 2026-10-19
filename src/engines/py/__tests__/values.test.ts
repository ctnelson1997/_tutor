/**
 * Values shown as Python writes them (#37), the tracer run in a real Pyodide:
 * each value carries `display`, the text the UI shows (primitiveText), where
 * rendering the JSON value by type would show something Python never wrote.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionSnapshot, PrimitiveValue, RuntimeValue } from '../../../types/snapshot';
import { primitiveText } from '../../../utils/valueDisplay';
import { loadTracer, runProgram } from '../run';
import { getTracerCode } from '../tracer';
import { loadNodePyodide, type PyodideInterface } from './cpython/pyodideNode';

let py: PyodideInterface;

beforeAll(async () => {
  py = await loadNodePyodide();
  loadTracer(py, getTracerCode());
}, 60_000);

function finalState(source: string): ExecutionSnapshot {
  const reply = runProgram(py, source);
  if (reply.type !== 'result') throw new Error(reply.message);
  return reply.snapshots[reply.snapshots.length - 1];
}

function shown(s: ExecutionSnapshot): Record<string, string> {
  const text = (v: RuntimeValue) => (v.type === 'ref' ? `#${v.heapId}` : primitiveText(v as PrimitiveValue));
  return Object.fromEntries(s.callStack[0].variables.map(v => [v.name, text(v.value)]));
}

describe('values as Python writes them', () => {
  it('shows floats as their repr: 5.0, -0.0, 1e+16, 1e-07, inf, nan', () => {
    const s = finalState('a = 5.0\nb = -0.0\nc = 1e16\nd = 1e-7\ne = float("inf")\nf = float("-inf")\ng = float("nan")\nh = 0.1 + 0.2\n');
    expect(shown(s)).toEqual({ a: '5.0', b: '-0.0', c: '1e+16', d: '1e-07', e: 'inf', f: '-inf', g: 'nan', h: '0.30000000000000004' });
  });

  it('shows every digit of a big int, and an int JavaScript holds exactly as a plain number', () => {
    const s = finalState('big = 2 ** 100\nneg = -(2 ** 64)\nedge = 2 ** 53\nsmall = 42\n');
    expect(shown(s)).toEqual({ big: '1267650600228229401496703205376', neg: '-18446744073709551616', edge: '9007199254740992', small: '42' });
    const small = s.callStack[0].variables.find(v => v.name === 'small')!.value;
    expect(small).toEqual({ type: 'number', value: 42 });
  });

  it('shows complex numbers, True, False and None as Python does', () => {
    const s = finalState('z = 3 + 4j\nw = complex(1, -1)\nt = True\nf = False\nn = None\n');
    expect(shown(s)).toEqual({ z: '(3+4j)', w: '(1-1j)', t: 'True', f: 'False', n: 'None' });
  });

  it('shows the values inside a list as Python writes them too', () => {
    const s = finalState('xs = [1, 2.0, True, None, 2 ** 70]\n');
    const list = s.heap.find(h => h.objectType === 'list')!;
    expect(list.properties.map(p => primitiveText(p.value as PrimitiveValue))).toEqual(['1', '2.0', 'True', 'None', '1180591620717411303424']);
  });
});
