import type { RunError } from '../types/snapshot';

/** The heading of the error banner for each way a run can end early. */
export function errorTitle(kind: RunError['kind']): string {
  if (kind === 'exception') return 'Uncaught exception';
  if (kind === 'limit') return 'Stopped';
  if (kind === 'compile') return 'Compile error';
  return 'Error';
}

/** The lines the editor marks: every compile error's, else the one line where the run stopped. */
export function errorLines(error: RunError): number[] {
  if (error.lines && error.lines.length > 0) return [...new Set(error.lines)];
  return error.line ? [error.line] : [];
}

/** The banner's note that a program has more compile errors than the one it shows. */
export function moreErrorsNote(error: RunError): string {
  const more = (error.lines?.length ?? 0) - 1;
  if (more <= 0) return '';
  return `${more} more error${more === 1 ? '' : 's'} listed in the console`;
}

/** The step bar's short note that the run ended early, which links to the last step. */
export function runEndLabel(kind: RunError['kind']): string {
  if (kind === 'exception') return 'ends with an exception';
  if (kind === 'limit') return 'stopped early';
  if (kind === 'compile') return 'does not compile';
  return 'ends with an error';
}
