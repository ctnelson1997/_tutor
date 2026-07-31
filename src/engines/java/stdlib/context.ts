/**
 * Standard-library context.
 *
 * The stdlib modules (statics, collections, format) are pure functions that
 * live outside the ~2000-line interpreter. They need a small set of primitives
 * from the interpreter — heap access and allocation — which are passed in via
 * this context object. Everything else (value construction, stringification,
 * numeric/boolean coercion) comes from the already-standalone helpers in
 * `../types`.
 */

import type { JavaValue, JavaType, JavaHeapEntry } from '../types';

export interface StdlibContext {
  /** The interpreter's live heap. */
  heap: Map<string, JavaHeapEntry>;
  /** Allocate a heap array, returning its heapId. */
  allocArray(elementType: JavaType, elements: JavaValue[]): string;
  /** Allocate a heap object, returning its heapId. */
  allocObject(className: string, fields: Map<string, JavaValue>): string;
  /** A source of randomness (Math.random in the app; overridable in tests). */
  random(): number;
  /** Preset stdin buffer consumed by `new Scanner(System.in)`. */
  stdin: string;
  /** Append text to the program's console output (used by printStackTrace). */
  writeStdout(text: string): void;
  /**
   * Invoke a user-defined instance method (e.g. `toString`/`equals`/`compareTo`)
   * on a heap object, returning its result — or `undefined` if the object's
   * class doesn't define a matching method. Used to honor student overrides in
   * stringification, set/map membership, and ordering. Snapshot emission is
   * suppressed during the call so it stays atomic in the visualization.
   */
  invokeUserMethod(ref: JavaValue, name: string, args: JavaValue[]): JavaValue | undefined;
}

/**
 * Thrown by `System.exit(...)`. The interpreter catches it in `execute()` and
 * returns the snapshots gathered so far — a clean halt, not an error.
 */
export class HaltSignal {}

/**
 * Error raised by stdlib helpers for unsupported usage of an otherwise-known
 * method. The interpreter reports the message like any other runtime error.
 */
export class StdlibError extends Error {}
