import { describe, it, expect, beforeEach } from 'vitest';
import {
  getEngine,
  getEngineSync,
  SUPPORTED_LANGUAGES,
  isLanguageId,
} from '../registry';
import type { LanguageEngine, LanguageId } from '../../types/engine';
import { useStore } from '../../store/useStore';
import { branding } from '../../config/branding';

// ── Registry basics ──

describe('engine registry', () => {
  it('SUPPORTED_LANGUAGES is non-empty', () => {
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(1);
  });

  it('SUPPORTED_LANGUAGES includes the branding target language', () => {
    expect(SUPPORTED_LANGUAGES).toContain(branding.languageId);
  });

  it('isLanguageId accepts every supported language', () => {
    for (const id of SUPPORTED_LANGUAGES) {
      expect(isLanguageId(id)).toBe(true);
    }
  });

  it('isLanguageId rejects unknown strings', () => {
    expect(isLanguageId('cobol')).toBe(false);
    expect(isLanguageId('')).toBe(false);
  });

  it('getEngine resolves for every supported language', async () => {
    for (const id of SUPPORTED_LANGUAGES) {
      const engine = await getEngine(id);
      expect(engine).toBeDefined();
      expect(engine.id).toBe(id);
    }
  });

  it('getEngine rejects unknown language', async () => {
    await expect(getEngine('cobol' as LanguageId)).rejects.toThrow();
  });

  it('getEngineSync returns engine after getEngine resolves', async () => {
    for (const id of SUPPORTED_LANGUAGES) {
      await getEngine(id);
      const sync = getEngineSync(id);
      expect(sync).toBeDefined();
      expect(sync!.id).toBe(id);
    }
  });
});

// ── LanguageEngine contract ──
// Every engine must satisfy the full LanguageEngine interface
// so that UI components can rely on these fields without null checks.

describe('LanguageEngine contract', () => {
  const engines: [LanguageId, LanguageEngine][] = [];

  beforeEach(async () => {
    if (engines.length === 0) {
      for (const id of SUPPORTED_LANGUAGES) {
        engines.push([id, await getEngine(id)]);
      }
    }
  });

  it('every engine has a non-empty displayName', () => {
    for (const [id, engine] of engines) {
      expect(engine.displayName, `${id} displayName`).toBeTruthy();
    }
  });

  it('every engine has a sandboxCode string', () => {
    for (const [id, engine] of engines) {
      expect(typeof engine.sandboxCode, `${id} sandboxCode`).toBe('string');
      expect(engine.sandboxCode.length, `${id} sandboxCode non-empty`).toBeGreaterThan(0);
    }
  });

  it('every engine has an editorExtension function', () => {
    for (const [id, engine] of engines) {
      expect(typeof engine.editorExtension, `${id} editorExtension`).toBe('function');
    }
  });

  it('every engine has an execute function', () => {
    for (const [id, engine] of engines) {
      expect(typeof engine.execute, `${id} execute`).toBe('function');
    }
  });

  it('every engine has at least one example', () => {
    for (const [id, engine] of engines) {
      expect(engine.examples.length, `${id} examples`).toBeGreaterThanOrEqual(1);
    }
  });

  it('every example has required fields', () => {
    for (const [id, engine] of engines) {
      for (const ex of engine.examples) {
        expect(ex.title, `${id}/${ex.slug} title`).toBeTruthy();
        expect(ex.slug, `${id} example slug`).toBeTruthy();
        expect(ex.category, `${id}/${ex.slug} category`).toBeTruthy();
        expect(ex.code, `${id}/${ex.slug} code`).toBeTruthy();
        expect(ex.language, `${id}/${ex.slug} language`).toBe(id);
      }
    }
  });

  it('every example slug is unique within its engine', () => {
    for (const [id, engine] of engines) {
      const slugs = engine.examples.map((e) => e.slug);
      expect(new Set(slugs).size, `${id} duplicate slugs`).toBe(slugs.length);
    }
  });

  it('example slugs are URL-safe', () => {
    for (const [, engine] of engines) {
      for (const ex of engine.examples) {
        expect(ex.slug).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
      }
    }
  });
});

// ── Store–registry integration ──

describe('store-registry integration', () => {
  it('store default language is a valid LanguageId', () => {
    useStore.getState().reset();
    const { language } = useStore.getState();
    expect(isLanguageId(language)).toBe(true);
  });

  it('getEngine resolves for the store default language', async () => {
    const { language } = useStore.getState();
    const engine = await getEngine(language);
    expect(engine).toBeDefined();
    expect(engine.id).toBe(language);
  });

  it('store setLanguage accepts all supported languages', () => {
    for (const id of SUPPORTED_LANGUAGES) {
      useStore.getState().setLanguage(id);
      expect(useStore.getState().language).toBe(id);
    }
    // Reset to branding default
    useStore.getState().setLanguage(branding.languageId);
  });

  it('store default language matches branding target', () => {
    useStore.getState().reset();
    // After reset, language should be whatever was set; fresh store should match branding
    expect(branding.languageId).toBe(useStore.getState().language);
  });
});
