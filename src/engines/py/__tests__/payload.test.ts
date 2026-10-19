/**
 * What a PyTutor run costs to record and send (#39), the tracer run in a real
 * Pyodide as the worker runs it (its 8.5-second budget included). Each step
 * shares what didn't change with the steps before it, so the worker's
 * postMessage (a structured clone, measured with v8.serialize) carries each
 * unchanged frame, variable, heap object and property once. Before #39, the
 * insertion sort below posted 45 MB, recursion 500 deep took 8 s and 39 MB,
 * and recursion 900 deep never finished.
 */
import { serialize } from 'node:v8';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionSnapshot, WorkerMessage } from '../../../types/snapshot';
import { loadTracer, runProgram } from '../run';
import { getTracerCode } from '../tracer';
import { loadNodePyodide, type PyodideInterface } from './cpython/pyodideNode';
import { loadCases } from './cpython/corpus';
import { HEAVY_PROGRAMS } from '../../../../scripts/py-payload';

let py: PyodideInterface;

beforeAll(async () => {
  py = await loadNodePyodide();
  loadTracer(py, getTracerCode());
}, 60_000);

const MB = 1e6;
/** The heavy programs take a second or two alone, longer while other suites run. */
const HEAVY = { timeout: 60_000 };

function steps(reply: WorkerMessage): ExecutionSnapshot[] {
  if (reply.type !== 'result') throw new Error(reply.message);
  return reply.snapshots;
}

describe('snapshot payload', () => {
  it('posts the insertion sort of 300 ints (5,000 steps) in under 5 MB', HEAVY, () => {
    const reply = runProgram(py, HEAVY_PROGRAMS['insertion sort of 300 ints']);
    expect(steps(reply)).toHaveLength(5000);
    expect(serialize(reply).length).toBeLessThan(5 * MB);
  });

  it('runs recursion 500 and 900 deep to the end, every step kept, in under 6 MB', HEAVY, () => {
    for (const depth of [500, 900]) {
      const reply = runProgram(py, HEAVY_PROGRAMS[`recursion ${depth} deep`]);
      expect(reply.type === 'result' && reply.error).toBeFalsy();
      const all = steps(reply);
      expect(all.at(-1)!.stdout).toEqual([String(depth)]);
      expect(Math.max(...all.map(s => s.callStack.length))).toBe(depth + 2);
      expect(serialize(reply).length).toBeLessThan(6 * MB);
    }
  });

  it('ends every limits/ case with its steps within the time budget', HEAVY, () => {
    for (const c of loadCases().filter(x => x.category === 'limits')) {
      const reply = runProgram(py, c.source, { stdin: c.stdin ?? '' });
      expect(steps(reply).length, c.id).toBeGreaterThan(0);
      expect(reply.type === 'result' ? reply.error?.message ?? '' : '', c.id).not.toMatch(/seconds/);
    }
  });

  it('shares an object that never changes, and a waiting frame, across every step', () => {
    const all = steps(runProgram(py, [
      'fixed = [1, 2, 3]',
      'moving = [0, 0, 0]',
      'def double(i):',
      '    moving[i] = fixed[i] * 2',
      '    return i',
      'for i in range(3):',
      '    double(i)',
    ].join('\n') + '\n'));
    const drawn = (s: ExecutionSnapshot, first: number) => s.heap.find(h => h.objectType === 'list' && h.properties[0]?.value.type === 'number' && h.properties[0].value.value === first);
    const withFixed = all.filter(s => drawn(s, 1));
    expect(new Set(withFixed.map(s => drawn(s, 1))).size).toBe(1);
    // moving: [0, 0, 0], then one version per write; its unchanged elements shared between versions.
    const versions = [...new Set(all.map(s => s.heap.find(h => h.objectType === 'list' && h !== drawn(s, 1))).filter(h => h !== undefined))];
    expect(versions.map(h => h!.properties.map(p => (p.value.type === 'number' ? p.value.value : null)))).toEqual([[0, 0, 0], [2, 0, 0], [2, 4, 0], [2, 4, 6]]);
    expect(versions[1]!.properties[2]).toBe(versions[0]!.properties[2]);
    // The module frame while double() runs: the same object until the module's next line.
    const inDouble = all.filter(s => s.callStack.length === 2 && s.callStack[1].name === 'double' && s.callStack[1].variables.some(v => v.name === 'i' && v.value.type === 'number' && v.value.value === 1));
    expect(inDouble.length).toBeGreaterThan(1);
    for (const s of inDouble) expect(s.callStack[0]).toBe(inDouble[0].callStack[0]);
  });
});
