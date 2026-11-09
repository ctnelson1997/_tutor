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
_real_settrace = sys.settrace
_refused = set()
_RECORDER_FILE = sys._getframe().f_code.co_filename

# Whether a 'return' event is a frame unwinding (an exception leaving it) or
# yielding, CPython says itself: sys.monitoring's PY_UNWIND and PY_YIELD
# events come right after the legacy 'return' event of the same frame (#80,
# #61: the reference trace doesn't share PyTutor's rule for it). Only the
# frame's id is kept, never the frame.
_mon = sys.monitoring
_MON_TOOL = _mon.OPTIMIZER_ID
_last_return = [None, None]   # the id of the frame of the last 'return' event, and the event

def _mark_last_return(flag):
    if _last_return[0] == id(_real_getframe(2)):
        _last_return[1][flag] = True
    _last_return[0] = None

def _on_unwind(code, offset, exc):
    if code.co_filename == 'main.py':
        _mark_last_return('unwinding')

def _on_yield(code, offset, value):
    if code.co_filename == 'main.py':
        _mark_last_return('yield')

def _raised_here(frame, tb):
    # Where the program first saw the exception: no other frame of main.py in its traceback.
    while tb is not None:
        if tb.tb_frame is not frame and tb.tb_frame.f_code.co_filename == 'main.py':
            return False
        tb = tb.tb_next
    return True

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
    _real_settrace(_trace)

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
    # From the logarithm: an int of millions of digits would take seconds to
    # compare with powers of ten, and the reference trace counts its digits at
    # every event; only one near a power of ten is compared with it.
    import math
    v = abs(v)
    if v < 10:
        return 1
    f = math.log10(v)
    n = int(f)
    if f - n < 1e-6 or n + 1 - f < 1e-6:
        p = round(f)
        return p + 1 if v >= 10 ** p else p
    return n + 1

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

# A trace function the program sets (sys.settrace) gets the events CPython
# gives it, after the recorder's own, so the reference trace goes on.
_program_trace = None
_program_local = {}

def _program_settrace(function):
    global _program_trace
    _program_trace = function
    if function is None:
        _program_local.clear()

def _program_gettrace():
    return _program_trace

def _forward(frame, event, arg, result):
    if frame.f_code.co_filename == _RECORDER_FILE:
        return result
    if event == 'call':
        if _program_trace is not None:
            local = _program_trace(frame, event, arg)
            if local is not None:
                _program_local[frame] = local
    elif frame in _program_local:
        local = _program_local[frame](frame, event, arg)
        if local is None or event == 'return':
            del _program_local[frame]
        else:
            _program_local[frame] = local
    return _trace if frame in _program_local else result

def _trace(frame, event, arg):
    result = _record(frame, event, arg)
    if _program_trace is not None or _program_local:
        return _forward(frame, event, arg, result)
    return result

def _record(frame, event, arg):
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
        code = frame.f_code
        if code.co_name != '<module>' and not (code.co_flags & 1):
            ev['classBody'] = True   # a class body, whose return value is Python's own
        if code.co_flags & 0x380:
            ev['awaiting'] = True    # a coroutine or async generator (a yield is an await's suspension)
        _last_return[0] = id(frame)
        _last_return[1] = ev
    elif event == 'exception':
        ev['exc'] = arg[0].__name__
        # Raised by the program's code: not a finished sub-iterator's
        # StopIteration ending a yield from or an await (SEND, END_SEND).
        if _raised_here(frame, arg[2]) and dis.opname[frame.f_code.co_code[frame.f_lasti]] not in ('SEND', 'END_SEND'):
            ev['raised'] = True
    _events.append(ev)
    return _trace

_endless = False
_exc = None
_compile_error = None
_tb = None
# The program's module as python main.py has it: __main__ in sys.modules,
# with the names CPython gives it, the builtins module as __builtins__,
# sys.argv, and the source as main.py in the working directory.
import importlib.machinery
_main = types.ModuleType('__main__')
_g = _main.__dict__
_g['__loader__'] = importlib.machinery.SourceFileLoader('__main__', 'main.py')
_g['__annotations__'] = {}
_g['__builtins__'] = builtins
_g['__file__'] = 'main.py'
_g['__cached__'] = None
sys.modules['__main__'] = _main
sys.argv = ['main.py']
# The program's module frame is the outermost, as python main.py has it: the
# recorder's and Pyodide's frames below it are neither in a stack the program
# prints (traceback.print_stack()) nor reachable through sys._getframe.
_real_walk_stack = traceback.walk_stack
_real_getframe = sys._getframe

def _walk_program_stack(f):
    if f is None:
        yield from _real_walk_stack(f)
        return
    while f is not None and f.f_code.co_filename != _RECORDER_FILE:
        yield f, f.f_lineno
        f = f.f_back

def _getframe(depth=0, /):
    f = _real_getframe(1)
    for _ in range(max(depth, 0)):
        f = f.f_back
        if f is None or f.f_code.co_filename == _RECORDER_FILE:
            raise ValueError('call stack is not deep enough')
    return f

traceback.walk_stack = _walk_program_stack
sys._getframe = _getframe
# asyncio.run() as CPython runs it (Pyodide's own loop is always running,
# which asyncio.run() refuses): CPython's scheduling (BaseEventLoop), with a
# clock that moves to the next timer instead of waiting.
import asyncio.base_events, asyncio.events

class _VirtualClockLoop(asyncio.base_events.BaseEventLoop):
    def __init__(self):
        super().__init__()
        self._now = 0.0
        self._selector = self

    def time(self):
        return self._now

    def select(self, timeout):
        self._now += timeout or 0
        return []

    def _process_events(self, event_list):
        pass

    def _write_to_self(self):
        pass

class _VirtualClockPolicy(asyncio.events.BaseDefaultEventLoopPolicy):
    _loop_factory = _VirtualClockLoop

asyncio.events._set_running_loop(None)
asyncio.events.set_event_loop_policy(_VirtualClockPolicy())
with open('main.py', 'w', encoding='utf-8') as _f:
    _f.write(__src)
linecache.cache['main.py'] = (len(__src), None, __src.splitlines(True), 'main.py')
try:
    _code = compile(__src, 'main.py', 'exec')
except SyntaxError as ex:
    # An error only the compiler finds ('return' outside function) has no
    # source text when compile() is given a string; python main.py reads it
    # from the file, and shows the line and its carets.
    if ex.text is None and ex.lineno and 1 <= ex.lineno <= len(__src.splitlines()):
        ex.text = __src.splitlines(True)[ex.lineno - 1]
    _compile_error = {'class': type(ex).__name__, 'msg': ex.msg, 'line': ex.lineno, 'offset': ex.offset,
                      'text': ''.join(traceback.format_exception_only(type(ex), ex))}
if _compile_error is None:
    _base = _depth(_real_getframe())
    sys.getrecursionlimit = _getrecursionlimit
    sys.setrecursionlimit = _setrecursionlimit
    _real_setlimit(_limit + _base + (_HEADROOM if __traced else 0))
    # The recorder's own garbage isn't the program's to collect: python main.py has little.
    import gc
    gc.collect()
    if __traced:
        sys.settrace = _program_settrace
        sys.gettrace = _program_gettrace
        _mon.use_tool_id(_MON_TOOL, 'reference trace')
        _mon.register_callback(_MON_TOOL, _mon.events.PY_UNWIND, _on_unwind)
        _mon.register_callback(_MON_TOOL, _mon.events.PY_YIELD, _on_yield)
        _mon.set_events(_MON_TOOL, _mon.events.PY_UNWIND | _mon.events.PY_YIELD)
        _real_settrace(_trace)
    try:
        exec(_code, _g)
    except SystemExit as ex:
        # As CPython ends: a code that isn't None or an int is printed to stderr.
        if ex.code is not None and not isinstance(ex.code, int):
            sys.stderr.write(str(ex.code) + chr(10))
    except _Endless:
        _endless = True
    except BaseException as ex:
        _real_settrace(None)
        _exc = {'class': type(ex).__name__, 'message': str(ex)}
        _tb = ''.join(l for l in traceback.format_exception(type(ex), ex, ex.__traceback__) if 'File "<exec>"' not in l)
    finally:
        _real_settrace(None)
        sys.setprofile(None)
        if __traced:
            _mon.set_events(_MON_TOOL, 0)
            _mon.free_tool_id(_MON_TOOL)
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
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        _tree = _ast.parse(__src)
    for _n in _ast.walk(_tree):
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
