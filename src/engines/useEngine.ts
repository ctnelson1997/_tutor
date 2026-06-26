import { useEffect, useState } from 'react';
import { getEngine, getEngineSync } from './registry';
import type { LanguageEngine, LanguageId } from '../types/engine';

/**
 * React hook that returns the LanguageEngine for the given id,
 * loading it asynchronously if not yet cached.
 */
export function useEngine(id: LanguageId): LanguageEngine | undefined {
  // Track the id alongside the engine so we can detect prop changes during render
  // (the React-idiomatic alternative to calling setState inside useEffect).
  const [state, setState] = useState<{ engine: LanguageEngine | undefined; id: LanguageId }>(
    () => ({ engine: getEngineSync(id), id }),
  );

  if (state.id !== id) {
    setState({ engine: getEngineSync(id), id });
  }

  useEffect(() => {
    if (getEngineSync(id)) return;
    let alive = true;
    getEngine(id).then((engine) => {
      if (alive) {
        setState((prev) => (prev.id === id ? { engine, id } : prev));
      }
    });
    return () => {
      alive = false;
    };
  }, [id]);

  return state.engine;
}
