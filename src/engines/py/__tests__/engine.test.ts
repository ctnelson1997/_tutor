import { describe, it, expect } from 'vitest';
import { pyEngine } from '../index';
import type { HeapTypeDisplay } from '../../../types/engine';

// ── Engine identity & contract ──

describe('pyEngine', () => {
  it('has id "py"', () => {
    expect(pyEngine.id).toBe('py');
  });

  it('has displayName "Python"', () => {
    expect(pyEngine.displayName).toBe('Python');
  });

  it('has a non-empty sandboxCode', () => {
    expect(pyEngine.sandboxCode.length).toBeGreaterThan(0);
  });

  it('sandboxCode is valid Python (no JS artifacts)', () => {
    // Should not contain JS-specific syntax
    expect(pyEngine.sandboxCode).not.toContain('let ');
    expect(pyEngine.sandboxCode).not.toContain('const ');
    expect(pyEngine.sandboxCode).not.toContain('var ');
    expect(pyEngine.sandboxCode).not.toContain('console.log');
    // Should contain Python-style comments or keywords
    expect(pyEngine.sandboxCode).toContain('#');
  });

  it('sandboxCode includes a print statement', () => {
    expect(pyEngine.sandboxCode).toContain('print');
  });

  it('editorExtension returns a CodeMirror extension', () => {
    const ext = pyEngine.editorExtension();
    expect(ext).toBeDefined();
  });

  it('execute is a function', () => {
    expect(typeof pyEngine.execute).toBe('function');
  });

  it('analyzeCode is a function', () => {
    expect(typeof pyEngine.analyzeCode).toBe('function');
  });
});

// ── heapTypeConfig ──

describe('pyEngine.heapTypeConfig', () => {
  it('is defined', () => {
    expect(pyEngine.heapTypeConfig).toBeDefined();
  });

  const expectedTypes: Record<string, { label: string; variant: string }> = {
    list: { label: 'List', variant: 'info' },
    dict: { label: 'Dict', variant: 'warning' },
    tuple: { label: 'Tuple', variant: 'secondary' },
    set: { label: 'Set', variant: 'warning' },
    function: { label: 'Function', variant: 'dark' },
    object: { label: 'Object', variant: 'warning' },
  };

  for (const [type, expected] of Object.entries(expectedTypes)) {
    it(`has config for "${type}" type`, () => {
      const config = pyEngine.heapTypeConfig![type];
      expect(config).toBeDefined();
      expect(config.label).toBe(expected.label);
      expect(config.variant).toBe(expected.variant);
    });
  }

  it('every config entry has label and variant strings', () => {
    for (const [key, config] of Object.entries(pyEngine.heapTypeConfig!)) {
      const typed = config as HeapTypeDisplay;
      expect(typeof typed.label, `${key}.label`).toBe('string');
      expect(typed.label.length, `${key}.label non-empty`).toBeGreaterThan(0);
      expect(typeof typed.variant, `${key}.variant`).toBe('string');
      expect(typed.variant.length, `${key}.variant non-empty`).toBeGreaterThan(0);
    }
  });

  it('variant values are valid Bootstrap variants', () => {
    const validVariants = ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark'];
    for (const [key, config] of Object.entries(pyEngine.heapTypeConfig!)) {
      expect(validVariants, `${key}.variant "${config.variant}"`).toContain(config.variant);
    }
  });
});

// ── Examples ──

describe('pyEngine.examples', () => {
  it('has at least 5 examples', () => {
    expect(pyEngine.examples.length).toBeGreaterThanOrEqual(5);
  });

  it('every example has required fields with language "py"', () => {
    for (const ex of pyEngine.examples) {
      expect(ex.title).toBeTruthy();
      expect(ex.slug).toBeTruthy();
      expect(ex.category).toBeTruthy();
      expect(ex.code).toBeTruthy();
      expect(ex.language).toBe('py');
    }
  });

  it('example slugs are unique', () => {
    const slugs = pyEngine.examples.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('example slugs are URL-safe', () => {
    for (const ex of pyEngine.examples) {
      expect(ex.slug).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
    }
  });

  it('example titles are unique', () => {
    const titles = pyEngine.examples.map((e) => e.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('examples span multiple categories', () => {
    const categories = new Set(pyEngine.examples.map((e) => e.category));
    expect(categories.size).toBeGreaterThanOrEqual(2);
  });

  it('every example contains valid Python (no JS syntax)', () => {
    for (const ex of pyEngine.examples) {
      // Python code should not contain JS-only syntax
      expect(ex.code, `${ex.slug}`).not.toContain('console.log');
      expect(ex.code, `${ex.slug}`).not.toContain('function ');
      expect(ex.code, `${ex.slug}`).not.toMatch(/\blet\s+\w+\s*=/);
      expect(ex.code, `${ex.slug}`).not.toMatch(/\bconst\s+\w+\s*=/);
      expect(ex.code, `${ex.slug}`).not.toMatch(/\bvar\s+\w+\s*=/);
    }
  });

  it('examples include a "Basics" category', () => {
    const basics = pyEngine.examples.filter((e) => e.category === 'Basics');
    expect(basics.length).toBeGreaterThanOrEqual(1);
  });

  it('examples include a "Data Structures" category', () => {
    const ds = pyEngine.examples.filter((e) => e.category === 'Data Structures');
    expect(ds.length).toBeGreaterThanOrEqual(1);
  });

  it('examples include a "Functions" category', () => {
    const fns = pyEngine.examples.filter((e) => e.category === 'Functions');
    expect(fns.length).toBeGreaterThanOrEqual(1);
  });

  it('example code is reasonably short (under 20 lines)', () => {
    for (const ex of pyEngine.examples) {
      const lines = ex.code.split('\n').length;
      expect(lines, `${ex.slug} has ${lines} lines`).toBeLessThanOrEqual(20);
    }
  });

  it('no example starts or ends with blank lines', () => {
    for (const ex of pyEngine.examples) {
      expect(ex.code, `${ex.slug} leading blank`).not.toMatch(/^\s*\n/);
      expect(ex.code, `${ex.slug} trailing blank`).not.toMatch(/\n\s*$/);
    }
  });
});

// ── analyzeCode integration ──

describe('pyEngine.analyzeCode integration', () => {
  it('flags dangerous code in examples (none should be flagged)', () => {
    for (const ex of pyEngine.examples) {
      const flags = pyEngine.analyzeCode!(ex.code);
      expect(flags, `example "${ex.slug}" should not trigger security flags`).toEqual([]);
    }
  });

  it('flags os import', () => {
    expect(pyEngine.analyzeCode!('import os').length).toBeGreaterThan(0);
  });

  it('returns CodeFlag[] shape', () => {
    const flags = pyEngine.analyzeCode!('import os');
    for (const flag of flags) {
      expect(flag).toHaveProperty('level');
      expect(flag).toHaveProperty('message');
      expect(typeof flag.level).toBe('string');
      expect(typeof flag.message).toBe('string');
    }
  });
});

// Note: execute() tests require Pyodide in a browser/worker environment.
// They cannot run in Vitest's Node.js environment.
// Integration tests for the Python execution pipeline should be run
// manually via `npm run dev:py` or in a browser-based test runner.
