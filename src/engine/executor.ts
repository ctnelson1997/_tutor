/**
 * Executor (dispatcher)
 *
 * Thin layer that reads the active language from the store,
 * delegates to the appropriate engine, and updates the store.
 */

import { useStore } from '../store/useStore';
import { getEngine } from '../engines/registry';

/**
 * Run user code through the active language engine and update the store.
 */
export async function runCode(source: string): Promise<void> {
  const store = useStore.getState();
  const { language, stdin } = store;

  store.reset();
  store.setIsRunning(true);

  try {
    const engine = await getEngine(language);
    const result = await engine.execute(source, { stdin });

    if (result.type === 'result') {
      // A run that stopped early (an uncaught exception, the step limit) still
      // shows its steps: set them first, since setSnapshots clears the error.
      if (result.snapshots.length > 0) store.setSnapshots(result.snapshots);
      if (result.error) {
        store.setError(result.error);
      } else if (result.snapshots.length === 0) {
        store.setError({ message: 'No execution steps were captured. The code may be empty or only contain declarations.' });
      }
    } else {
      store.setError({ message: result.message, line: result.line });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    store.setError({ message });
  } finally {
    store.setIsRunning(false);
  }
}
