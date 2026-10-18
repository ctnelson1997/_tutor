// Run a Python program in Pyodide 0.27.5 (the version PyTutor ships), as plain CPython would run it.
// Usage: node runpy.mjs <file.py> [--stdin=<file>]
// Prints the program's stdout and stderr, then a line "== exit <status>".
import { loadPyodide } from 'pyodide';
import { readFileSync, existsSync } from 'node:fs';

const file = process.argv[2];
const stdinArg = process.argv.find(a => a.startsWith('--stdin='));
const stdinFile = stdinArg ? stdinArg.slice(8) : file.replace(/\.py$/, '.stdin');
const stdin = existsSync(stdinFile) ? readFileSync(stdinFile, 'utf8') : '';

const py = await loadPyodide();
let out = '';
let err = '';
py.setStdout({ write: b => { out += Buffer.from(b).toString('utf8'); return b.length; } });
py.setStderr({ write: b => { err += Buffer.from(b).toString('utf8'); return b.length; } });
let pos = 0;
const input = Buffer.from(stdin, 'utf8');
py.setStdin({ read: buf => { const n = Math.min(buf.length, input.length - pos); buf.set(input.subarray(pos, pos + n)); pos += n; return n; } });
py.globals.set('__src', readFileSync(file, 'utf8'));
const status = py.runPython(`
import sys, traceback
_status = 0
try:
    exec(compile(__src, 'main.py', 'exec'), {'__name__': '__main__'})
except SystemExit as e:
    _status = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
except BaseException as e:
    traceback.print_exc()
    _status = 1
sys.stdout.flush(); sys.stderr.flush()
_status
`);
process.stdout.write(out);
if (err) process.stdout.write('== stderr\n' + err);
process.stdout.write(`== exit ${status}\n`);
