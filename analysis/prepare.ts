// Generates what the harness runs, from the repo's own engine source:
//   tracer.py    PyTutor's tracer (getTracerCode)
//   jstutor.mjs  JSTutor's instrumenter and runtime, plus acorn's parser, bundled for plain Node
// Usage (from the repo root): npx tsx analysis/prepare.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { getTracerCode } from '../src/engines/py/tracer';
import { examples as pyExamples } from '../src/engines/py/examples';
import { examples as jsExamples } from '../src/engines/js/examples';
import { mkdirSync } from 'node:fs';

const here = import.meta.dirname;
writeFileSync(join(here, 'tracer.py'), getTracerCode());
await build({
  stdin: {
    contents: [
      "export { instrument } from '../src/engines/js/instrumenter';",
      "export { getRuntimeCode } from '../src/engines/js/runtime';",
      "export { parse } from 'acorn';",
    ].join('\n'),
    resolveDir: here,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(here, 'jstutor.mjs'),
  logLevel: 'warning',
});
// the shipped examples are cases too (examples/<slug>), read from examples.ts
for (const [list, ext] of [[pyExamples, 'py'], [jsExamples, 'js']] as const) {
  const dir = join(here, ext, 'cases', 'examples');
  mkdirSync(dir, { recursive: true });
  for (const ex of list) writeFileSync(join(dir, `${ex.slug}.${ext}`), ex.code);
}
console.log('wrote tracer.py, jstutor.mjs and the examples');
