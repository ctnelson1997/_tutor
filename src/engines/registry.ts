import type { LanguageEngine, LanguageId } from '../types/engine';

const lang = import.meta.env.VITE_LANGUAGE || 'js';

const engines: Record<string, () => Promise<LanguageEngine>> = {};

if (lang === 'js') {
  engines['js'] = async () => (await import('./js/index')).jsEngine;
}
if (lang === 'py') {
  engines['py'] = async () => (await import('./py/index')).pyEngine;
}

const loaded = new Map<LanguageId, LanguageEngine>();

export async function getEngine(id: LanguageId): Promise<LanguageEngine> {
  const cached = loaded.get(id);
  if (cached) return cached;
  const factory = engines[id];
  if (!factory) throw new Error(`Unknown language: ${id}`);
  const engine = await factory();
  loaded.set(id, engine);
  return engine;
}

export function getEngineSync(id: LanguageId): LanguageEngine | undefined {
  return loaded.get(id);
}

export const SUPPORTED_LANGUAGES: LanguageId[] = Object.keys(engines) as LanguageId[];

export function isLanguageId(value: string): value is LanguageId {
  return value in engines;
}
