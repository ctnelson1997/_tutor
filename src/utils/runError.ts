import type { RunError } from '../types/snapshot';

/** The heading of the error banner for each way a run can end early. */
export function errorTitle(kind: RunError['kind']): string {
  if (kind === 'exception') return 'Uncaught exception';
  if (kind === 'limit') return 'Stopped';
  return 'Error';
}

/** The step bar's short note that the run ended early, which links to the last step. */
export function runEndLabel(kind: RunError['kind']): string {
  if (kind === 'exception') return 'ends with an exception';
  if (kind === 'limit') return 'stopped early';
  return 'ends with an error';
}
