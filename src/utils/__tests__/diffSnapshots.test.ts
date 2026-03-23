import { describe, it, expect } from 'vitest';
import { getChangedKeys } from '../diffSnapshots';
import type { ExecutionSnapshot } from '../../types/snapshot';

function makeSnapshot(overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot {
  return {
    step: 0,
    line: 1,
    callStack: [{ name: 'Global', variables: [] }],
    heap: [],
    stdout: [],
    ...overrides,
  };
}

describe('getChangedKeys', () => {
  it('returns empty set for identical snapshots', () => {
    const snap = makeSnapshot({
      callStack: [{
        name: 'Global',
        variables: [{ name: 'x', value: { type: 'number', value: 1 } }],
      }],
    });

    const changed = getChangedKeys(snap, snap);
    expect(changed.size).toBe(0);
  });

  it('returns empty set when curr is undefined', () => {
    const changed = getChangedKeys(makeSnapshot(), undefined);
    expect(changed.size).toBe(0);
  });

  it('returns empty set when prev is undefined (first step)', () => {
    const changed = getChangedKeys(undefined, makeSnapshot());
    expect(changed.size).toBe(0);
  });

  it('detects variable value change', () => {
    const prev = makeSnapshot({
      callStack: [{
        name: 'Global',
        variables: [{ name: 'x', value: { type: 'number', value: 1 } }],
      }],
    });
    const curr = makeSnapshot({
      callStack: [{
        name: 'Global',
        variables: [{ name: 'x', value: { type: 'number', value: 2 } }],
      }],
    });

    const changed = getChangedKeys(prev, curr);
    expect(changed.has('var:0:x')).toBe(true);
  });

  it('detects new variable added', () => {
    const prev = makeSnapshot({
      callStack: [{
        name: 'Global',
        variables: [{ name: 'x', value: { type: 'number', value: 1 } }],
      }],
    });
    const curr = makeSnapshot({
      callStack: [{
        name: 'Global',
        variables: [
          { name: 'x', value: { type: 'number', value: 1 } },
          { name: 'y', value: { type: 'number', value: 2 } },
        ],
      }],
    });

    const changed = getChangedKeys(prev, curr);
    expect(changed.has('var:0:y')).toBe(true);
    expect(changed.has('var:0:x')).toBe(false);
  });

  it('detects heap property change', () => {
    const prev = makeSnapshot({
      heap: [{
        id: '1',
        objectType: 'object',
        properties: [{ key: 'a', value: { type: 'number', value: 1 } }],
      }],
    });
    const curr = makeSnapshot({
      heap: [{
        id: '1',
        objectType: 'object',
        properties: [{ key: 'a', value: { type: 'number', value: 2 } }],
      }],
    });

    const changed = getChangedKeys(prev, curr);
    expect(changed.has('heap:1:a')).toBe(true);
  });

  it('detects new heap object property', () => {
    const prev = makeSnapshot({
      heap: [{
        id: '1',
        objectType: 'object',
        properties: [],
      }],
    });
    const curr = makeSnapshot({
      heap: [{
        id: '1',
        objectType: 'object',
        properties: [{ key: 'a', value: { type: 'number', value: 1 } }],
      }],
    });

    const changed = getChangedKeys(prev, curr);
    expect(changed.has('heap:1:a')).toBe(true);
  });

  it('detects closure variable change', () => {
    const prev = makeSnapshot({
      callStack: [{
        name: 'func',
        variables: [],
        closureVars: [{ name: 'count', value: { type: 'number', value: 0 } }],
      }],
    });
    const curr = makeSnapshot({
      callStack: [{
        name: 'func',
        variables: [],
        closureVars: [{ name: 'count', value: { type: 'number', value: 1 } }],
      }],
    });

    const changed = getChangedKeys(prev, curr);
    expect(changed.has('closure:0:count')).toBe(true);
  });

  it('detects this context change', () => {
    const prev = makeSnapshot({
      callStack: [{
        name: 'method',
        variables: [],
        thisArg: { type: 'ref', heapId: '1' },
      }],
    });
    const curr = makeSnapshot({
      callStack: [{
        name: 'method',
        variables: [],
        thisArg: { type: 'ref', heapId: '2' },
      }],
    });

    const changed = getChangedKeys(prev, curr);
    expect(changed.has('this:0')).toBe(true);
  });

  it('detects ref value change', () => {
    const prev = makeSnapshot({
      callStack: [{
        name: 'Global',
        variables: [{ name: 'obj', value: { type: 'ref', heapId: '1' } }],
      }],
    });
    const curr = makeSnapshot({
      callStack: [{
        name: 'Global',
        variables: [{ name: 'obj', value: { type: 'ref', heapId: '2' } }],
      }],
    });

    const changed = getChangedKeys(prev, curr);
    expect(changed.has('var:0:obj')).toBe(true);
  });

  it('uses frame index to disambiguate recursion', () => {
    const prev = makeSnapshot({
      callStack: [
        { name: 'Global', variables: [{ name: 'x', value: { type: 'number', value: 1 } }] },
        { name: 'f', variables: [{ name: 'x', value: { type: 'number', value: 2 } }] },
      ],
    });
    const curr = makeSnapshot({
      callStack: [
        { name: 'Global', variables: [{ name: 'x', value: { type: 'number', value: 1 } }] },
        { name: 'f', variables: [{ name: 'x', value: { type: 'number', value: 3 } }] },
      ],
    });

    const changed = getChangedKeys(prev, curr);
    expect(changed.has('var:1:x')).toBe(true);
    expect(changed.has('var:0:x')).toBe(false);
  });
});
