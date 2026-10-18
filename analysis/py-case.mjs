// One Python corpus case, in one of two modes (each in its own process, so a hang loses only that half):
//   node py-case.mjs golden <file.py> <out.json>   CPython 3.12 (Pyodide 0.27.5) runs the program plainly,
//                                                 with a reference sys.settrace trace of the user's frames.
//   node py-case.mjs traced <file.py> <out.json>   PyTutor's tracer runs it exactly as src/engines/py/worker.ts does.
import { loadPyodide } from 'pyodide';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode, file, outFile] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(file, 'utf8');
const stdinFile = file.replace(/\.py$/, '.stdin');
const stdinText = existsSync(stdinFile) ? readFileSync(stdinFile, 'utf8') : null;

const py = await loadPyodide();
let out = '';
let err = '';
const decoder = () => { const d = new TextDecoder(); return b => d.decode(b, { stream: true }); };
const o = decoder(), e = decoder();
py.setStdout({ write: b => { out += o(b); return b.length; } });
py.setStderr({ write: b => { err += e(b); return b.length; } });

function feedStdin(text) {
  const input = Buffer.from(text, 'utf8');
  let pos = 0;
  py.setStdin({ read: buf => { const n = Math.min(buf.length, input.length - pos); buf.set(input.subarray(pos, pos + n)); pos += n; return n; } });
}

const started = Date.now();
let result;
if (mode === 'golden') {
  feedStdin(stdinText ?? '');
  py.globals.set('__src', source);
  const json = py.runPython(String.raw`
import sys, traceback, json, types
_MAX_EVENTS = 8000
_events = []
_truncated = False

def _r(v):
    t = type(v)
    if v is None or t in (bool, int, float, str, complex):
        s = repr(v)
        return s if len(s) <= 300 else s[:300] + '…'
    return '<' + t.__name__ + '>'

def _user_stack(frame):
    names = []
    f = frame
    while f is not None:
        if f.f_code.co_filename == 'main.py':
            names.append(f.f_code.co_name)
        f = f.f_back
    return list(reversed(names))

def _trace(frame, event, arg):
    global _truncated
    if frame.f_code.co_filename != 'main.py':
        return None
    if len(_events) >= _MAX_EVENTS:
        _truncated = True
        return None
    stack = _user_stack(frame)
    ev = {'event': event, 'line': frame.f_lineno, 'stack': stack}
    try:
        if frame.f_code.co_name == '<module>':
            loc = {k: v for k, v in frame.f_globals.items() if not k.startswith('__') and not isinstance(v, types.ModuleType)}
        else:
            loc = dict(frame.f_locals)
        ev['locals'] = {k: _r(v) for k, v in loc.items()}
    except Exception as ex:
        ev['locals'] = {'!error': repr(ex)}
    if event == 'return':
        ev['value'] = _r(arg)
    if event == 'exception':
        ev['exc'] = arg[0].__name__
    _events.append(ev)
    return _trace

_status = 0
_exc = None
_compile_error = None
_tb = None
_g = {'__name__': '__main__'}
import linecache
linecache.cache['main.py'] = (len(__src), None, __src.splitlines(True), 'main.py')
try:
    _code = compile(__src, 'main.py', 'exec')
except SyntaxError as ex:
    _compile_error = {'class': type(ex).__name__, 'msg': ex.msg, 'line': ex.lineno, 'offset': ex.offset,
                      'text': ''.join(traceback.format_exception_only(type(ex), ex))}
    _status = 1
if _compile_error is None:
    sys.settrace(_trace)
    try:
        exec(_code, _g)
    except SystemExit as ex:
        _status = ex.code if isinstance(ex.code, int) else (0 if ex.code is None else 1)
    except BaseException as ex:
        sys.settrace(None)
        _status = 1
        _exc = {'class': type(ex).__name__, 'message': str(ex)}
        lines = traceback.format_exception(type(ex), ex, ex.__traceback__)
        _tb = ''.join(l for l in lines if 'File "<exec>"' not in l)
    finally:
        sys.settrace(None)
final_globals = {k: _r(v) for k, v in _g.items() if not k.startswith('__') and not isinstance(v, types.ModuleType)}
# lines inside a multi-line statement (not the first line of any statement): PyTutor merges them into the statement's step
_continuation = []
try:
    import ast as _ast
    _starts = set()
    _spans = []
    for _n in _ast.walk(_ast.parse(__src)):
        if isinstance(_n, _ast.stmt):
            _starts.add(_n.lineno)
            if not isinstance(_n, (_ast.FunctionDef, _ast.AsyncFunctionDef, _ast.ClassDef, _ast.If, _ast.For, _ast.While, _ast.With, _ast.Try, _ast.Match)):
                _spans.append((_n.lineno, _n.end_lineno))
    _continuation = sorted({l for a, b in _spans for l in range(a + 1, b + 1)} - _starts)
except Exception:
    pass
sys.stdout.flush(); sys.stderr.flush()
json.dumps({'status': _status, 'exception': _exc, 'traceback': _tb, 'compileError': _compile_error,
            'events': _events, 'truncated': _truncated, 'finalGlobals': final_globals, 'continuation': _continuation})
`);
  result = { mode, ...JSON.parse(json), stdout: out, stderr: err };
} else {
  // As the browser worker: Pyodide's default stdin calls prompt(), which a Web Worker doesn't have.
  py.setStdin({ stdin: () => { throw new ReferenceError('prompt is not defined'); } });
  const tracerCode = readFileSync(join(here, 'tracer.py'), 'utf8');
  let reply;
  try {
    py.runPython(tracerCode);
    const escapedSource = source.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
    const res = py.runPython(`run_traced("""${escapedSource}""")`);
    reply = JSON.parse(res);
  } catch (ex) {
    const message = ex instanceof Error ? ex.message : String(ex);
    const m = message.match(/File "<(?:exec|user_code)>", line (\d+)/);
    reply = { type: 'error', message, line: m ? parseInt(m[1], 10) : undefined };
  }
  const json = JSON.stringify(reply);
  result = { mode, reply, replyBytes: json.length, lostStdout: out, lostStderr: err };
}
result.ms = Date.now() - started;
writeFileSync(outFile, JSON.stringify(result));
process.exit(0);
