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

  it("draws an int of millions of digits by its size at once, and goes on (#84)", HEAVY, () => {
    const t0 = performance.now();
    const reply = runProgram(py, 'x = 2 ** (10 ** 7)\nfor i in range(3):\n    x = x + 1\nprint(x % 10)');
    const all = steps(reply);
    expect(reply.type === 'result' && reply.error).toBeFalsy();
    expect(all.at(-1)!.stdout).toEqual(['9']);
    const x = all.at(-1)!.callStack[0].variables.find(v => v.name === 'x')!.value;
    expect(x.type !== 'ref' && x.display).toBe('<int with 3010300 digits>');
    // It took 4.8 s to draw one such int before #84, and the loop past the worker's kill.
    expect(performance.now() - t0).toBeLessThan(4000);
  });

  it('runs a 100 x 100 grid filled cell by cell to the step cap within the time budget (#84)', HEAVY, () => {
    const reply = runProgram(py, 'grid = [[0] * 100 for _ in range(100)]\nfor r in range(100):\n    for c in range(100):\n        grid[r][c] = r * c');
    expect(steps(reply)).toHaveLength(5000);
    expect(reply.type === 'result' ? reply.error?.message : '').toMatch(/5000 steps/);
  });

  it('prints a million lines at once, and keeps every one (#84)', HEAVY, () => {
    const reply = runProgram(py, 'print(chr(10).join(map(str, range(10 ** 6))))\nprint("end")');
    const all = steps(reply);
    expect(reply.type === 'result' && reply.error).toBeFalsy();
    const out = all.at(-1)!.stdout;
    expect([out.length, out[999_999], out[1_000_000]]).toEqual([1_000_001, '999999', 'end']);
  });

  it('ends a run over 10,000 linked dicts within the time budget, with its steps (#84)', HEAVY, () => {
    const reply = runProgram(py, 'head = None\nfor i in range(10000):\n    head = {"value": i, "next": head}');
    // 58 steps before #84; how many now depends on the machine.
    expect(steps(reply).length).toBeGreaterThan(300);
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
