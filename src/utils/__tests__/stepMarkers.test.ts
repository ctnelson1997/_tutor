import { describe, it, expect } from 'vitest';
import { stepMarkers } from '../stepMarkers';
import type { ExecutionSnapshot } from '../../types/snapshot';

const step = (line: number, columnRange?: { startCol: number; endCol: number }): ExecutionSnapshot => ({
  step: 0, line, callStack: [], heap: [], stdout: [], ...(columnRange ? { columnRange } : {}),
});

describe('step markers (#24)', () => {
  const steps = [step(1), step(2, { startCol: 4, endCol: 9 }), step(3), step(3)];

  it('mark the line about to run (▶) and the one that just ran (✓)', () => {
    expect(stepMarkers(steps, 0, null)).toEqual({ current: { line: 1, columnRange: undefined }, previous: null });
    expect(stepMarkers(steps, 1, null)).toEqual({ current: { line: 2, columnRange: { startCol: 4, endCol: 9 } }, previous: 1 });
    expect(stepMarkers(steps, 2, null)).toEqual({ current: { line: 3, columnRange: undefined }, previous: 2 });
  });

  it('show the final state of a run that ended normally as just run, with nothing about to run', () => {
    expect(stepMarkers(steps, 3, null)).toEqual({ current: null, previous: 3 });
  });

  it('keep ▶ where a run that stopped early stopped', () => {
    expect(stepMarkers(steps, 3, { kind: 'exception', message: 'boom', line: 3 })).toEqual({ current: { line: 3, columnRange: undefined }, previous: 3 });
  });

  it('mark nothing without steps', () => {
    expect(stepMarkers([], 0, null)).toEqual({ current: null, previous: null });
  });
});
