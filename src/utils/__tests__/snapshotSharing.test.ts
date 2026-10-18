import { describe, it, expect } from 'vitest';
import { shareSnapshots } from '../snapshotSharing';
import type { ExecutionSnapshot, HeapObject } from '../../types/snapshot';

const array = (id: string, values: number[]): HeapObject => ({
  id, objectType: 'array', label: 'int[]',
  properties: values.map((value, i) => ({ key: String(i), value: { type: 'number', value } })),
});

const snap = (step: number, x: number, heap: HeapObject[], stdout: string[] = []): ExecutionSnapshot => ({
  step, line: 1,
  callStack: [
    { name: 'main', variables: [{ name: 'a', value: { type: 'ref', heapId: '1' } }, { name: 'x', value: { type: 'number', value: x } }] },
    { name: 'for', isBlockScope: true, variables: [{ name: 'i', value: { type: 'number', value: 0 } }] },
  ],
  heap,
  stdout,
});

describe('shareSnapshots', () => {
  it("shares a NaN with a NaN, and treats a Map key's value as part of its property (#48)", () => {
    const map = (keyId: string): HeapObject => ({
      id: '1', objectType: 'map',
      properties: [{ key: '#' + keyId, keyValue: { type: 'ref', heapId: keyId }, value: { type: 'number', value: NaN, display: 'NaN' } }],
    });
    const [a, b, c] = shareSnapshots([snap(0, NaN, [map('2')]), snap(1, NaN, [map('2')]), snap(2, NaN, [map('3')])]);
    expect(b.callStack).toBe(a.callStack);
    expect(b.heap[0]).toBe(a.heap[0]);
    expect(c.heap[0]).not.toBe(b.heap[0]);
  });

  it('shares frames, variables, heap objects and stdout that are unchanged', () => {
    const [a, b] = shareSnapshots([
      snap(0, 1, [array('1', [3, 1, 2]), array('2', [9])], ['hi']),
      snap(1, 1, [array('1', [3, 1, 2]), array('2', [9])], ['hi']),
    ]);
    expect(b.callStack).toBe(a.callStack);
    expect(b.heap).toBe(a.heap);
    expect(b.stdout).toBe(a.stdout);
    expect(b).not.toBe(a); // each step is still its own snapshot
  });

  it('shares the unchanged parts next to a change', () => {
    const [a, b] = shareSnapshots([
      snap(0, 1, [array('1', [3, 1, 2]), array('2', [9])]),
      snap(1, 2, [array('1', [1, 1, 2]), array('2', [9])], ['out']),
    ]);
    expect(b.callStack[0]).not.toBe(a.callStack[0]); // x changed
    expect(b.callStack[0].variables[0]).toBe(a.callStack[0].variables[0]); // a didn't
    expect(b.callStack[1]).toBe(a.callStack[1]);
    expect(b.heap[0]).not.toBe(a.heap[0]);
    expect(b.heap[0].properties[0]).not.toBe(a.heap[0].properties[0]);
    expect(b.heap[0].properties[1]).toBe(a.heap[0].properties[1]);
    expect(b.heap[1]).toBe(a.heap[1]);
    expect(b.stdout).not.toBe(a.stdout);
  });

  it('shares an object with its last version, even after steps without it', () => {
    const [a, , c] = shareSnapshots([
      snap(0, 1, [array('1', [5]), array('2', [9])]),
      snap(1, 1, [array('1', [5])]),
      snap(2, 1, [array('2', [9]), array('1', [5])]),
    ]);
    expect(c.heap[0]).toBe(a.heap[1]);
    expect(c.heap[1]).toBe(a.heap[0]);
  });

  it('treats a different display text, label or ref as a change', () => {
    const withDisplay = (display: string): ExecutionSnapshot => ({
      ...snap(0, 1, []),
      callStack: [{ name: 'main', variables: [{ name: 'd', value: { type: 'number', value: 5, display } }] }],
    });
    const [a, b] = shareSnapshots([withDisplay('5.0'), withDisplay('5.00')]);
    expect(b.callStack[0]).not.toBe(a.callStack[0]);
    const [c, d] = shareSnapshots([
      snap(0, 1, [{ ...array('1', [1]), label: 'int[]' }]),
      snap(1, 1, [{ ...array('1', [1]), label: 'long[]' }]),
    ]);
    expect(d.heap[0]).not.toBe(c.heap[0]);
    const [e, f] = shareSnapshots([
      snap(0, 1, [{ id: '1', objectType: 'object', properties: [{ key: 'next', value: { type: 'ref', heapId: '2' } }] }]),
      snap(1, 1, [{ id: '1', objectType: 'object', properties: [{ key: 'next', value: { type: 'ref', heapId: '3' } }] }]),
    ]);
    expect(f.heap[0]).not.toBe(e.heap[0]);
  });

  it('shares console lines (stdout and stderr) between steps', () => {
    const withConsole = (step: number, lines: string[]): ExecutionSnapshot => ({
      ...snap(step, 1, []),
      console: lines.map((text, i) => ({ text, stream: i % 2 ? 'stderr' : 'stdout' })),
    });
    const [a, b, c] = shareSnapshots([withConsole(0, ['out']), withConsole(1, ['out']), withConsole(2, ['out', 'err'])]);
    expect(b.console).toBe(a.console);
    expect(c.console![0]).toBe(a.console![0]);
    expect(c.console![1]).toEqual({ text: 'err', stream: 'stderr' });
  });

  it('changes nothing but identity, and is idempotent', () => {
    const snaps = [snap(0, 1, [array('1', [3])], ['a']), snap(1, 2, [array('1', [4])], ['a', 'b'])];
    const shared = shareSnapshots(snaps);
    expect(shared).toEqual(snaps);
    const again = shareSnapshots(shared);
    again.forEach((s, i) => {
      expect(s.callStack).toBe(shared[i].callStack);
      expect(s.heap).toBe(shared[i].heap);
    });
  });
});
