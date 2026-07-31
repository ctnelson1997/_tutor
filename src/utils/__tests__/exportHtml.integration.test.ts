/**
 * Integration test: validates buildExportHtml against the REAL built viewer
 * (`docs/viewer-js.html`) rather than a hand-written mock template.
 *
 * The earlier mock-only test suite missed a regression where the regex source
 * inside the bundled exportHtml.ts shadowed the real <script id="tutor-examples">
 * tag (because the engine bundle inlines this very file as source text). This
 * suite pins that class of bug.
 *
 * Skipped automatically when the viewer hasn't been built — run `npm run
 * test:integration` (which builds first) or `npm run build:viewer:js` followed
 * by `npm test` to opt in.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildExportHtml } from '../exportHtml';
import type { ExecutionSnapshot } from '../../types/snapshot';

const VIEWER_PATH = resolve(process.cwd(), 'docs', 'viewer-js.html');
const VIEWER_EXISTS = existsSync(VIEWER_PATH);

function evalExamples(html: string): unknown[] {
  // The bundled engine source contains `window.__EXAMPLES__` references too
  // (viewer-main.tsx reads them) — grab the LAST assignment, which is always
  // the real placeholder block at the bottom of the file.
  const matches = [...html.matchAll(/window\.__EXAMPLES__\s*=\s*(\[[\s\S]*?\]);/g)];
  if (matches.length === 0) throw new Error('No window.__EXAMPLES__ assignment found in output');
  const last = matches[matches.length - 1];
  const fn = new Function(`return ${last[1]};`);
  return fn();
}

const SAMPLE_SNAPSHOTS: ExecutionSnapshot[] = [
  { step: 0, line: 1, callStack: [], heap: [], stdout: [] },
  { step: 1, line: 2, callStack: [], heap: [], stdout: ['hello'] },
];

describe.skipIf(!VIEWER_EXISTS)('integration: buildExportHtml against the real built viewer', () => {
  const template = VIEWER_EXISTS ? readFileSync(VIEWER_PATH, 'utf-8') : '';
  const templateSize = VIEWER_EXISTS ? statSync(VIEWER_PATH).size : 0;

  it('produces output containing exactly one example with the right title', () => {
    const html = buildExportHtml(template, {
      title: 'Integration Test',
      language: 'js',
      code: 'let x = 1;',
      snapshots: SAMPLE_SNAPSHOTS,
    });
    const parsed = evalExamples(html) as Array<{ title: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Integration Test');
  });

  it('leaves the engine bundle intact — the data-tutor-engine attribute survives', () => {
    const html = buildExportHtml(template, {
      title: 't',
      language: 'js',
      code: 'x',
      snapshots: [],
    });
    expect(html).toMatch(/data-tutor-engine="\d+\.\d+\.\d+"/);
  });

  it('leaves the engine version comment block intact', () => {
    const html = buildExportHtml(template, {
      title: 't',
      language: 'js',
      code: 'x',
      snapshots: [],
    });
    expect(html).toContain('TUTOR ENGINE BUNDLE');
    expect(html).toContain('TO UPGRADE the engine');
  });

  it('leaves the __TUTOR_ENGINE_VERSION__ runtime assignment intact', () => {
    const html = buildExportHtml(template, {
      title: 't',
      language: 'js',
      code: 'x',
      snapshots: [],
    });
    expect(html).toMatch(/window\.__TUTOR_ENGINE_VERSION__\s*=\s*"\d+\.\d+\.\d+"/);
  });

  it('does not corrupt the engine — output size stays within ±200 KB of the template', () => {
    // The original bug grew the output by ~700 KB (engine bundle wiped out
    // by the splice). A clean splice adds at most a few KB of payload.
    const html = buildExportHtml(template, {
      title: 'size guard',
      language: 'js',
      code: 'let x = 1;',
      snapshots: SAMPLE_SNAPSHOTS,
    });
    const delta = Math.abs(html.length - templateSize);
    expect(delta).toBeLessThan(200_000);
  });

  it('stamps schemaVersion on the payload baked into the real viewer', () => {
    const html = buildExportHtml(template, {
      title: 'schema',
      language: 'js',
      code: 'x',
      snapshots: [],
    });
    const parsed = evalExamples(html) as Array<{ schemaVersion: number }>;
    expect(typeof parsed[0].schemaVersion).toBe('number');
    expect(parsed[0].schemaVersion).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(VIEWER_EXISTS)('integration suite (skipped)', () => {
  it('viewer-js.html not built — run `npm run test:integration` to opt in', () => {
    // Placeholder so the suite shows up as 1 skipped (not 0 tests).
  });
});
