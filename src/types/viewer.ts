import type { ExecutionSnapshot } from './snapshot';
import type { LanguageId } from './engine';

// Bump this when the ViewerExample / snapshot shape changes in a way the
// current engine wouldn't handle (e.g. a new required field, a renamed key).
// The viewer compares this against each example's schemaVersion at load time
// and warns when an example was produced by a newer engine than what's running.
// v2: added optional `stdin` (preset console input for Java's Scanner) so
// exported Scanner programs re-run with their original input.
export const CURRENT_EXAMPLE_SCHEMA_VERSION = 2;

export interface ViewerExample {
  schemaVersion?: number;
  title: string;
  slug?: string;
  language: LanguageId;
  code: string;
  snapshots: ExecutionSnapshot[];
  /** Preset stdin consumed by Java's Scanner when the viewer re-runs the code. */
  stdin?: string;
}

declare global {
  interface Window {
    __EXAMPLES__?: ViewerExample[];
    __TUTOR_ENGINE_VERSION__?: string;
  }
}
