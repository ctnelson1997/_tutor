import { describe, it, expect } from 'vitest';
import { buildExportHtml, slugifyFilename, ExportTemplateError } from '../exportHtml';
import type { ExecutionSnapshot } from '../../types/snapshot';

const SAMPLE_TEMPLATE = `<!doctype html>
<html><body>
<script id="tutor-examples">
  /* EXPORT_PLACEHOLDER_START */
  window.__EXAMPLES__ = [];
  /* EXPORT_PLACEHOLDER_END */
</script>
<script type="module" src="/src/viewer-main.tsx"></script>
</body></html>`;

const SAMPLE_SNAPSHOTS: ExecutionSnapshot[] = [
  { step: 0, line: 1, callStack: [], heap: [], stdout: [] },
  { step: 1, line: 2, callStack: [], heap: [], stdout: ['hi'] },
];

function evalExamples(html: string): unknown[] {
  // Capture the `window.__EXAMPLES__ = [...]` assignment from the rendered
  // template and evaluate it in an isolated stub `window` object.
  const match = html.match(/window\.__EXAMPLES__\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error('No window.__EXAMPLES__ assignment found in output');
  const fn = new Function(`return ${match[1]};`);
  return fn();
}

describe('buildExportHtml', () => {
  it('inserts the example into the placeholder and round-trips JSON', () => {
    const html = buildExportHtml(SAMPLE_TEMPLATE, {
      title: 'My example',
      language: 'js',
      code: 'let x = 1;',
      snapshots: SAMPLE_SNAPSHOTS,
    });
    const parsed = evalExamples(html);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      title: 'My example',
      language: 'js',
      code: 'let x = 1;',
      snapshots: SAMPLE_SNAPSHOTS,
    });
  });

  it('stamps schemaVersion on every payload it writes', async () => {
    const { CURRENT_EXAMPLE_SCHEMA_VERSION } = await import('../../types/viewer');
    const html = buildExportHtml(SAMPLE_TEMPLATE, {
      title: 'schema test',
      language: 'js',
      code: 'x',
      snapshots: [],
    });
    const parsed = evalExamples(html) as Array<{ schemaVersion: number }>;
    expect(parsed[0].schemaVersion).toBe(CURRENT_EXAMPLE_SCHEMA_VERSION);
  });

  it('preserves the EXPORT_PLACEHOLDER markers so future appends remain easy', () => {
    const html = buildExportHtml(SAMPLE_TEMPLATE, {
      title: 't',
      language: 'js',
      code: 'x',
      snapshots: [],
    });
    expect(html).toContain('EXPORT_PLACEHOLDER_START');
    expect(html).toContain('EXPORT_PLACEHOLDER_END');
  });

  it('throws ExportTemplateError when the examples script block is missing', () => {
    const bad = '<html><body>no markers here</body></html>';
    expect(() =>
      buildExportHtml(bad, { title: 't', language: 'js', code: 'x', snapshots: [] }),
    ).toThrow(ExportTemplateError);
  });

  it('throws when the examples script exists but the placeholder markers are gone', () => {
    const missingMarkers = `<html><body>
<script id="tutor-examples">window.__EXAMPLES__ = [];</script>
</body></html>`;
    expect(() =>
      buildExportHtml(missingMarkers, { title: 't', language: 'js', code: 'x', snapshots: [] }),
    ).toThrow(ExportTemplateError);
  });

  it('ignores marker strings that appear inside the bundled engine source', () => {
    // The bundled engine contains the literal marker strings as constants
    // (because exportHtml.ts itself is in the bundle). The splice must only
    // touch the dedicated <script id="tutor-examples"> block, not the engine.
    const templateWithEngineCollision = `<!doctype html>
<html><body>
<!-- TUTOR ENGINE BUNDLE — version 9.9.9 -->
<script type="module" data-tutor-engine="9.9.9">
  // ...bundled engine source includes the marker strings as JS constants:
  const _g="/* EXPORT_PLACEHOLDER_START */",jf="/* EXPORT_PLACEHOLDER_END */";
  // ...rest of engine...
</script>
<script id="tutor-examples">
  /* EXPORT_PLACEHOLDER_START */
  window.__EXAMPLES__ = [];
  /* EXPORT_PLACEHOLDER_END */
</script>
</body></html>`;
    const html = buildExportHtml(templateWithEngineCollision, {
      title: 'engine collision case',
      language: 'js',
      code: 'x',
      snapshots: [],
    });
    // Engine bundle must be untouched
    expect(html).toContain('const _g="/* EXPORT_PLACEHOLDER_START */"');
    expect(html).toContain('data-tutor-engine="9.9.9"');
    // Examples block must be spliced
    const parsed = evalExamples(html) as Array<{ title: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('engine collision case');
  });

  it('safely escapes code containing </script> and special characters', () => {
    const tricky = 'const s = "</script>";\nconst t = "\\"\'`";';
    const html = buildExportHtml(SAMPLE_TEMPLATE, {
      title: 'escapes',
      language: 'js',
      code: tricky,
      snapshots: [],
    });
    const parsed = evalExamples(html) as Array<{ code: string }>;
    expect(parsed[0].code).toBe(tricky);
  });

  it('keeps the rest of the template intact around the placeholder', () => {
    const html = buildExportHtml(SAMPLE_TEMPLATE, {
      title: 't',
      language: 'js',
      code: 'x',
      snapshots: [],
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<script type="module" src="/src/viewer-main.tsx">');
  });
});

describe('multi-example merge scenario', () => {
  it('exported HTML can be hand-edited to add a second example, and both parse', () => {
    const first = buildExportHtml(SAMPLE_TEMPLATE, {
      title: 'A',
      language: 'js',
      code: 'a',
      snapshots: SAMPLE_SNAPSHOTS,
    });
    const secondPayload = JSON.stringify({
      title: 'B',
      language: 'js',
      code: 'b',
      snapshots: SAMPLE_SNAPSHOTS,
    });
    // Simulate the user pasting a second entry between the array's last item
    // and the closing bracket — what the README will instruct them to do.
    const merged = first.replace(/(\}\s*)(\/\* Paste additional)/, `$1,\n  ${secondPayload}\n  $2`);

    const parsed = evalExamples(merged);
    expect(parsed).toHaveLength(2);
    expect((parsed[0] as { title: string }).title).toBe('A');
    expect((parsed[1] as { title: string }).title).toBe('B');
  });
});

describe('slugifyFilename', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifyFilename('Hello World')).toBe('hello-world');
  });

  it('collapses repeated separators', () => {
    expect(slugifyFilename('foo --- bar')).toBe('foo-bar');
  });

  it('trims leading and trailing separators', () => {
    expect(slugifyFilename('  ?? foo bar ??  ')).toBe('foo-bar');
  });

  it('falls back to "visualization" for empty input', () => {
    expect(slugifyFilename('')).toBe('visualization');
    expect(slugifyFilename('???')).toBe('visualization');
  });
});
