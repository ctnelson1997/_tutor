import type { ExecutionSnapshot } from '../types/snapshot';
import type { LanguageId } from '../types/engine';
import type { ViewerExample } from '../types/viewer';
import { CURRENT_EXAMPLE_SCHEMA_VERSION } from '../types/viewer';

const PLACEHOLDER_START = '/* EXPORT_PLACEHOLDER_START */';
const PLACEHOLDER_END = '/* EXPORT_PLACEHOLDER_END */';
// Built from char fragments so the literal string never appears verbatim in
// THIS source file. Critical: if the bundled engine contained the literal
// chars `<script id="tutor-examples">` anywhere (e.g. in an error message),
// the splice would false-match inside the engine bundle and corrupt it.
// We anchor on these fragments + lastIndexOf so the *last* occurrence wins.
const SCRIPT_OPEN = '<' + 'script id="tutor-examples">';
const SCRIPT_CLOSE = '<' + '/script>';

export class ExportTemplateError extends Error {}

/**
 * Fetch the prebuilt viewer template for a language. The viewer-<lang>.html
 * file is deployed alongside the main site and contains the entire React
 * app bundle inlined via vite-plugin-singlefile.
 */
export async function fetchViewerTemplate(language: LanguageId): Promise<string> {
  const url = `./viewer-${language}.html`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new ExportTemplateError(
      `Could not load viewer template (${url} → ${res.status}). The site may be missing its viewer build — run "npm run build:viewer:${language}".`,
    );
  }
  return res.text();
}

export interface ExportInput {
  title: string;
  slug?: string;
  language: LanguageId;
  code: string;
  snapshots: ExecutionSnapshot[];
  stdin?: string;
}

/**
 * Splice the example data into the viewer template by rewriting the contents
 * of the dedicated tutor-examples script block. The placeholder markers
 * inside that block are preserved so users can paste additional entries
 * before the END marker to merge multiple exports.
 */
export function buildExportHtml(template: string, example: ExportInput): string {
  // Use lastIndexOf so a false-positive opening tag inside the engine bundle
  // (e.g. a string literal mentioning the marker) doesn't shadow the real
  // placeholder block, which is always emitted at the bottom of viewer.html.
  const openIdx = template.lastIndexOf(SCRIPT_OPEN);
  if (openIdx === -1) {
    throw new ExportTemplateError('Viewer template is missing the tutor-examples script block.');
  }
  const bodyStart = openIdx + SCRIPT_OPEN.length;
  const closeIdx = template.indexOf(SCRIPT_CLOSE, bodyStart);
  if (closeIdx === -1) {
    throw new ExportTemplateError('Viewer template tutor-examples block is not closed.');
  }
  const body = template.slice(bodyStart, closeIdx);
  if (!body.includes(PLACEHOLDER_START) || !body.includes(PLACEHOLDER_END)) {
    throw new ExportTemplateError('Viewer template is missing the example placeholder markers.');
  }

  const payload: ViewerExample = {
    schemaVersion: CURRENT_EXAMPLE_SCHEMA_VERSION,
    title: example.title,
    slug: example.slug,
    language: example.language,
    code: example.code,
    snapshots: example.snapshots,
    ...(example.stdin ? { stdin: example.stdin } : {}),
  };

  const json = JSON.stringify(payload);
  const newBody = [
    '',
    `      ${PLACEHOLDER_START}`,
    '      window.__EXAMPLES__ = [',
    `        ${json}`,
    '        /* Paste additional example objects here, separated by commas. */',
    '      ];',
    `      ${PLACEHOLDER_END}`,
    '    ',
  ].join('\n');

  return template.slice(0, bodyStart) + newBody + template.slice(closeIdx);
}

/**
 * Trigger a browser download of the given HTML string.
 */
export function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Slugify a free-form title for use as a filename. Lowercases, replaces
 * non-alphanumerics with hyphens, collapses repeats, trims.
 */
export function slugifyFilename(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'visualization';
}
