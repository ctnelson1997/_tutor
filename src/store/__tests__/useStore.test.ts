import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../useStore';
import type { ExecutionSnapshot } from '../../types/snapshot';

function makeSnapshot(step: number, line: number): ExecutionSnapshot {
  return {
    step,
    line,
    callStack: [{ name: 'Global', variables: [] }],
    heap: [],
    stdout: [],
  };
}

describe('useStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useStore.getState().reset();
    useStore.setState({ code: '// Write your code below!\nlet x = 1;' });
  });

  // ── setCode ──

  it('updates code', () => {
    useStore.getState().setCode('let y = 2;');
    expect(useStore.getState().code).toBe('let y = 2;');
  });

  // ── setSnapshots ──

  it('sets snapshots and resets currentStep to 0', () => {
    const snaps = [makeSnapshot(0, 1), makeSnapshot(1, 2), makeSnapshot(2, 3)];
    useStore.getState().setSnapshots(snaps);

    expect(useStore.getState().snapshots).toBe(snaps);
    expect(useStore.getState().currentStep).toBe(0);
    expect(useStore.getState().error).toBeNull();
  });

  // ── stepForward / stepBackward ──

  it('stepForward increments currentStep', () => {
    const snaps = [makeSnapshot(0, 1), makeSnapshot(1, 2), makeSnapshot(2, 3)];
    useStore.getState().setSnapshots(snaps);

    useStore.getState().stepForward();
    expect(useStore.getState().currentStep).toBe(1);

    useStore.getState().stepForward();
    expect(useStore.getState().currentStep).toBe(2);
  });

  it('stepForward does not exceed last snapshot', () => {
    const snaps = [makeSnapshot(0, 1), makeSnapshot(1, 2)];
    useStore.getState().setSnapshots(snaps);

    useStore.getState().stepForward();
    useStore.getState().stepForward();
    useStore.getState().stepForward(); // should not go past 1

    expect(useStore.getState().currentStep).toBe(1);
  });

  it('stepBackward decrements currentStep', () => {
    const snaps = [makeSnapshot(0, 1), makeSnapshot(1, 2), makeSnapshot(2, 3)];
    useStore.getState().setSnapshots(snaps);
    useStore.getState().setCurrentStep(2);

    useStore.getState().stepBackward();
    expect(useStore.getState().currentStep).toBe(1);
  });

  it('stepBackward does not go below 0', () => {
    const snaps = [makeSnapshot(0, 1), makeSnapshot(1, 2)];
    useStore.getState().setSnapshots(snaps);

    useStore.getState().stepBackward();
    useStore.getState().stepBackward(); // should not go below 0

    expect(useStore.getState().currentStep).toBe(0);
  });

  // ── stepFirst / stepLast ──

  it('stepFirst sets currentStep to 0', () => {
    const snaps = [makeSnapshot(0, 1), makeSnapshot(1, 2), makeSnapshot(2, 3)];
    useStore.getState().setSnapshots(snaps);
    useStore.getState().setCurrentStep(2);

    useStore.getState().stepFirst();
    expect(useStore.getState().currentStep).toBe(0);
  });

  it('stepLast sets currentStep to last index', () => {
    const snaps = [makeSnapshot(0, 1), makeSnapshot(1, 2), makeSnapshot(2, 3)];
    useStore.getState().setSnapshots(snaps);

    useStore.getState().stepLast();
    expect(useStore.getState().currentStep).toBe(2);
  });

  // ── setCurrentStep ──

  it('setCurrentStep clamps to valid range', () => {
    const snaps = [makeSnapshot(0, 1), makeSnapshot(1, 2), makeSnapshot(2, 3)];
    useStore.getState().setSnapshots(snaps);

    useStore.getState().setCurrentStep(100);
    expect(useStore.getState().currentStep).toBe(2);

    useStore.getState().setCurrentStep(-5);
    expect(useStore.getState().currentStep).toBe(0);
  });

  it('setCurrentStep does nothing with no snapshots', () => {
    useStore.getState().setCurrentStep(5);
    expect(useStore.getState().currentStep).toBe(0);
  });

  // ── setError ──

  it('stores error with message and line', () => {
    useStore.getState().setError({ message: 'Parse error', line: 5 });

    expect(useStore.getState().error).toEqual({ message: 'Parse error', line: 5 });
  });

  it('stores error without line', () => {
    useStore.getState().setError({ message: 'Unknown error' });

    expect(useStore.getState().error).toEqual({ message: 'Unknown error' });
  });

  it('clears error with null', () => {
    useStore.getState().setError({ message: 'error' });
    useStore.getState().setError(null);

    expect(useStore.getState().error).toBeNull();
  });

  // ── reset ──

  it('reset clears execution state but keeps code', () => {
    useStore.getState().setCode('let x = 42;');
    useStore.getState().setSnapshots([makeSnapshot(0, 1)]);
    useStore.getState().setError({ message: 'something' });

    useStore.getState().reset();

    expect(useStore.getState().code).toBe('let x = 42;');
    expect(useStore.getState().snapshots).toEqual([]);
    expect(useStore.getState().currentStep).toBe(0);
    expect(useStore.getState().error).toBeNull();
    expect(useStore.getState().isRunning).toBe(false);
  });

  // ── setIsRunning ──

  it('toggles isRunning', () => {
    useStore.getState().setIsRunning(true);
    expect(useStore.getState().isRunning).toBe(true);

    useStore.getState().setIsRunning(false);
    expect(useStore.getState().isRunning).toBe(false);
  });

  // ── hideFunctions ──

  it('toggles hideFunctions', () => {
    useStore.getState().setHideFunctions(true);
    expect(useStore.getState().hideFunctions).toBe(true);

    useStore.getState().setHideFunctions(false);
    expect(useStore.getState().hideFunctions).toBe(false);
  });
});
