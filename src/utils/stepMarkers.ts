import type { ColumnRange, ExecutionSnapshot, RunError } from '../types/snapshot';

/**
 * The editor's step markers. Steps follow pythontutor.com in every engine
 * (#24): a step shows the state before its line runs.
 */
export interface StepMarkers {
  /** ▶ "About to execute": the step's line (and the part of it that runs next). */
  current: { line: number; columnRange?: ColumnRange } | null;
  /** ✓ "Just executed": the line that ran before the step. */
  previous: number | null;
}

/**
 * The markers for a step. The last step of a run that ended normally is the
 * final state: its line has just run, and nothing is about to. A run that
 * stopped early keeps ▶ at its last step, where it stopped.
 */
export function stepMarkers(snapshots: ExecutionSnapshot[], currentStep: number, error: RunError | null): StepMarkers {
  const snapshot = snapshots[currentStep];
  if (!snapshot) return { current: null, previous: null };
  if (currentStep === snapshots.length - 1 && !error) return { current: null, previous: snapshot.line };
  return {
    current: { line: snapshot.line, columnRange: snapshot.columnRange },
    previous: currentStep > 0 ? snapshots[currentStep - 1].line : null,
  };
}
