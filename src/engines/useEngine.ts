import { useState, useEffect } from 'react';
import { getEngine, getEngineSync } from './registry';
import type { LanguageEngine, LanguageId } from '../types/engine';

/**
 * React hook that returns the LanguageEngine for the given id,
 * loading it asynchronously if not yet cached.
 */
export function useEngine(id: LanguageId): LanguageEngine | undefined {
  const [engine, setEngine] = useState<LanguageEngine | undefined>(getEngineSync(id));

  useEffect(() => {
    const sync = getEngineSync(id);
    if (sync) {
      setEngine(sync);
    } else {
      getEngine(id).then(setEngine);
    }
  }, [id]);

  return engine;
}
