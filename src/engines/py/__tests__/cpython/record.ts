/**
 * Records a golden (#29): what CPython 3.12 (a fresh Pyodide under Node) does
 * with a program, run as `python -u main.py` would run it, plus a reference
 * trace of its steps.
 *
 * The reference trace is a minimal `sys.settrace` over the user's frames
 * (filename `main.py`): each call, line, return and exception event with its
 * line, the stack of user frames and each variable's reference repr (`_r`).
 * It is the ground truth for PyTutor's steps and variables, which the output
 * can't check. It reads a module frame's variables from `f_globals` (never
 * `f_locals`, which in 3.12 merges an inlined comprehension's hidden slots
 * into the globals), so it doesn't change what the program does; `py-golden`
 * also runs each program untraced and checks that.
 *
 * Used by scripts/py-golden.ts, which runs each case in a process of its own.
 */
import { MAX_GOLDEN_EVENTS, consoleLines, type ConsoleChunk, type PyGolden } from './corpus';
import { loadNodePyodide, stdinOf, type PyodideInterface } from './pyodideNode';

/** The recorder's time budget: a program still running after it is endless. */
export const ENDLESS_AFTER_SECONDS = 5;

/** Python run in the recorder's Pyodide: unbuffered streams, so each write reaches its handler in program order (`python -u`). */
const UNBUFFERED_STREAMS = String.raw`
import sys, io
sys.stdout = io.TextIOWrapper(io.FileIO(1, 'w', closefd=False), encoding='utf-8', write_through=True)
sys.stderr = io.TextIOWrapper(io.FileIO(2, 'w', closefd=False), encoding='utf-8', errors='backslashreplace', write_through=True)
`;

/**
 * The recorder. Expects `__src` (the program) and `__traced` (whether to
 * record the reference trace) in its globals; evaluates to the result as JSON.
 */
export const REFERENCE_TRACER = String.raw`
import sys, json, types, traceback, linecache, time, builtins, dis
# The recorder's own builtins: a program that replaces builtins.str or
# builtins.len doesn't change what the recorder calls.
globals().update({_k: _v for _k, _v in vars(builtins).items() if not _k.startswith('_')})
import ast as _ast

_MAX_EVENTS = ${MAX_GOLDEN_EVENTS}
_MAX_COUNT = 100000
_BUDGET = ${ENDLESS_AFTER_SECONDS}
_events = []
_truncated = False
_count = 0
_t0 = time.time()

class _Endless(BaseException):
    pass

# The recursion limit as "python main.py" has it: the module frame is depth 1.
# Here Pyodide's and the recorder's frames lie below it (_base of them), so the
# real limit is the program's plus _base; the program sees its own limit
# (_limit, through sys.getrecursionlimit/setrecursionlimit). The trace
# function's own frames count against the limit too, so while tracing the real
# limit is _HEADROOM higher still, and a new frame deeper than _limit gets
# CPython's RecursionError from _trace.
_HEADROOM = 50
_limit = sys.getrecursionlimit()
_base = 0
_real_getlimit = sys.getrecursionlimit
_real_setlimit = sys.setrecursionlimit
_refused = set()
_unwinding = set()   # frames an exception is passing through: their 'return' event is the frame unwinding
# A 'return' event at any other instruction is the frame unwinding too, after
# a finally block or an inlined comprehension's cleanup re-raised.
_RETURN_OPS = frozenset(dis.opmap[n] for n in ('RETURN_VALUE', 'RETURN_CONST', 'YIELD_VALUE'))

def _getrecursionlimit():
    return _limit

def _setrecursionlimit(n):
    global _limit
    _real_setlimit(n + _base)
    _limit = n
    _real_setlimit(n + _base + (_HEADROOM if __traced else 0))

def _depth(frame):
    n = 0
    while frame is not None:
        n += 1
        frame = frame.f_back
    return n

def _retrace(frame, event, arg):
    # CPython turns tracing off when the trace function raises: back on at the next event.
    sys.setprofile(None)
    sys.settrace(_trace)

def _readable_locals(frame):
    # A class body whose code has fast locals (an inlined comprehension's,
    # PEP 709) can't be read through f_locals: 3.12 merges the hidden slots and
    # warns 'assigning None to unbound local' when tracing writes them back.
    code = frame.f_code
    if code.co_name == '<module>':
        return {k: v for k, v in frame.f_globals.items() if not k.startswith('__')}
    if not (code.co_flags & 1) and code.co_nlocals > 0:
        return None
    return dict(frame.f_locals)

def _digits(v):
    v = abs(v)
    n = int(v.bit_length() * 0.30102999566398) + 1
    while n > 1 and 10 ** (n - 1) > v:
        n -= 1
    return n

def _r(v):
    t = type(v)
    if v is None or t in (bool, int, float, str, complex):
        try:
            s = repr(v)
        except ValueError:
            return '<int with %d digits>' % _digits(v)
        return s if len(s) <= 300 else s[:300] + '…'
    return '<' + t.__name__ + '>'

def _user_stack(frame):
    # Outermost first, a run of frames of one name as 'name*n' (expandStack).
    names = []
    f = frame
    while f is not None:
        if f.f_code.co_filename == 'main.py':
            names.append(f.f_code.co_name)
        f = f.f_back
    runs = []
    for n in reversed(names):
        if runs and runs[-1][0] == n:
            runs[-1][1] += 1
        else:
            runs.append([n, 1])
    return [n if c == 1 else '%s*%d' % (n, c) for n, c in runs]

def _trace(frame, event, arg):
    global _truncated, _count
    if event == 'call' and _depth(frame) - _base > _limit:
        _refused.add(frame)
        sys.setprofile(_retrace)
        raise RecursionError('maximum recursion depth exceeded')
    if frame.f_code.co_filename != 'main.py' or frame in _refused:
        return None
    if event != 'exception':
        _count += 1
        if _count % 256 == 0 and time.time() - _t0 > _BUDGET:
            raise _Endless()
    if len(_events) >= _MAX_EVENTS:
        _truncated = True
        return _trace
    ev = {'event': event, 'line': frame.f_lineno, 'stack': _user_stack(frame)}
    try:
        loc = _readable_locals(frame)
        ev['locals'] = {'!unreadable': 'class body with an inlined comprehension'} if loc is None else {k: _r(v) for k, v in loc.items()}
    except Exception as ex:
        ev['locals'] = {'!error': repr(ex)}
    if event == 'return':
        ev['value'] = _r(arg)
        if frame in _unwinding or frame.f_code.co_code[frame.f_lasti] not in _RETURN_OPS:
            ev['unwinding'] = True
        _unwinding.discard(frame)
    elif event == 'exception':
        ev['exc'] = arg[0].__name__
        _unwinding.add(frame)
    elif event == 'line':
        _unwinding.discard(frame)
    _events.append(ev)
    return _trace

_endless = False
_exc = None
_compile_error = None
_tb = None
_g = {'__name__': '__main__'}
linecache.cache['main.py'] = (len(__src), None, __src.splitlines(True), 'main.py')
try:
    _code = compile(__src, 'main.py', 'exec')
except SyntaxError as ex:
    _compile_error = {'class': type(ex).__name__, 'msg': ex.msg, 'line': ex.lineno, 'offset': ex.offset,
                      'text': ''.join(traceback.format_exception_only(type(ex), ex))}
if _compile_error is None:
    _base = _depth(sys._getframe())
    sys.getrecursionlimit = _getrecursionlimit
    sys.setrecursionlimit = _setrecursionlimit
    _real_setlimit(_limit + _base + (_HEADROOM if __traced else 0))
    if __traced:
        sys.settrace(_trace)
    try:
        exec(_code, _g)
    except SystemExit as ex:
        # As CPython ends: a code that isn't None or an int is printed to stderr.
        if ex.code is not None and not isinstance(ex.code, int):
            sys.stderr.write(str(ex.code) + chr(10))
    except _Endless:
        _endless = True
    except BaseException as ex:
        sys.settrace(None)
        _exc = {'class': type(ex).__name__, 'message': str(ex)}
        _tb = ''.join(l for l in traceback.format_exception(type(ex), ex, ex.__traceback__) if 'File "<exec>"' not in l)
    finally:
        sys.settrace(None)
        sys.setprofile(None)
_final = {}
for _k, _v in list(_g.items()):
    if not _k.startswith('__'):
        try:
            _final[_k] = _r(_v)
        except Exception as ex:
            _final[_k] = '!error ' + repr(ex)
# Lines inside a multi-line statement that start no statement: PyTutor gives the statement one step.
_continuation = []
try:
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
for _s in (sys.stdout, sys.stderr):
    try:
        _s.flush()
    except Exception:
        pass
json.dumps({'exception': _exc, 'traceback': _tb, 'compileError': _compile_error, 'endless': _endless,
            'events': _events, 'truncated': _truncated, 'stepEvents': min(_count, _MAX_COUNT),
            'finalGlobals': _final, 'continuation': _continuation})
`;

/** What one run of the recorder gives, before the golden is assembled. */
export type Recording = Omit<PyGolden, 'sourceSha256'>;

/** Run a program once in a fresh Pyodide; `traced` adds the reference trace. */
export async function record(source: string, stdin: string | null, traced = true): Promise<Recording> {
  const py: PyodideInterface = await loadNodePyodide();
  const chunks: ConsoleChunk[] = [];
  const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
  const sink = (stream: 'stdout' | 'stderr') => ({
    write: (bytes: Uint8Array) => {
      const text = decoders[stream].decode(bytes, { stream: true });
      if (text) chunks.push({ stream, text });
      return bytes.length;
    },
  });
  py.setStdout(sink('stdout'));
  py.setStderr(sink('stderr'));
  py.setStdin(stdinOf(stdin ?? ''));
  py.runPython(UNBUFFERED_STREAMS);
  py.globals.set('__src', source);
  py.globals.set('__traced', traced);
  const result = JSON.parse(py.runPython(REFERENCE_TRACER) as string) as Omit<Recording, 'stdout' | 'stderr' | 'console'>;
  const text = (stream: 'stdout' | 'stderr') => chunks.filter(c => c.stream === stream).map(c => c.text).join('');
  return { stdout: text('stdout'), stderr: text('stderr'), console: consoleLines(chunks), ...result };
}

/**
 * Record a case's golden: the reference trace from a traced run, and what the
 * program prints and raises from an untraced one, which must agree (the
 * reference trace must not change what the program does). An endless program
 * has only the traced run, which the recorder stops.
 */
export async function recordGolden(source: string, stdin: string | null): Promise<{ golden: Recording; problem: string | null }> {
  const traced = await record(source, stdin, true);
  if (traced.endless || traced.compileError) return { golden: traced, problem: null };
  const plain = await record(source, stdin, false);
  const golden: Recording = {
    ...traced,
    stdout: plain.stdout,
    stderr: plain.stderr,
    console: plain.console,
    exception: plain.exception,
    traceback: plain.traceback,
  };
  const same = JSON.stringify([plain.console, plain.exception]) === JSON.stringify([traced.console, traced.exception]);
  return {
    golden,
    problem: same ? null : "the program prints or raises differently when traced: the reference trace changes it, or it isn't deterministic",
  };
}
