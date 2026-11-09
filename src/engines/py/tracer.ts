/**
 * Python Tracer Script
 *
 * Returns a Python script (as a string) that uses sys.settrace() to
 * intercept execution events and build ExecutionSnapshot[] matching
 * the app's data model. This is the Python equivalent of the JS
 * engine's runtime.ts + instrumenter.ts combined.
 */

export function getTracerCode(): string {
  return `
import sys
import io as _io
import json
import math
import time
import linecache as _linecache
import types as _types
import dis as _dis
import ast as _ast
import traceback as _traceback
import builtins as _builtins
import warnings as _warnings
import re as _re
import codecs as _codecs
import itertools as _itertools
import operator as _operator
import weakref as _weakref
import enum as _enum
import collections as _collections
from importlib.machinery import SourceFileLoader as _SourceFileLoader

# The tracer's own builtins and library functions (#34): a program that
# replaces builtins.len, json.dumps or sys.settrace doesn't change what the
# tracer calls. (The program runs in a namespace of its own.)
globals().update({_k: _v for _k, _v in vars(_builtins).items() if not _k.startswith('_')})
_json_dumps = json.dumps
# Every part is JSON text from the moment it is made (#78): the tracer keeps
# none of the program's objects in the reply it builds. The encoder is json's
# own C one, called directly: JSONEncoder.encode looks isinstance and str up
# in the builtins, which a program may replace.
import _json

def _unencodable(o):
    raise TypeError('not JSON serializable: ' + _type_name(type(o)))

_c_encoder = _json.make_encoder(None, _unencodable, _json.encode_basestring_ascii, None, ':', ',', False, False, True)

def _encode(obj):
    return ''.join(_c_encoder(obj, 0))
_isinf = math.isinf
_isnan = math.isnan
_log10 = math.log10
_now = time.time
_settrace = sys.settrace
_setprofile = sys.setprofile
_gc_collect = __import__('gc').collect
_getframe = sys._getframe
_real_getlimit = sys.getrecursionlimit
_real_setlimit = sys.setrecursionlimit
_real_stderr = sys.__stderr__
_DEFAULT_LIMIT = sys.getrecursionlimit()
_MemberDescriptor = _types.MemberDescriptorType
_Enum = _enum.Enum
_type_dict = type.__dict__['__dict__'].__get__
_type_name = type.__dict__['__name__'].__get__
_type_bases = type.__dict__['__bases__'].__get__
_type_mro = type.__dict__['__mro__'].__get__
_function_code = _types.FunctionType.__dict__['__code__'].__get__
_function_defaults = _types.FunctionType.__dict__['__defaults__'].__get__
_function_kwdefaults = _types.FunctionType.__dict__['__kwdefaults__'].__get__
_function_closure = _types.FunctionType.__dict__['__closure__'].__get__
_cell_contents = _types.CellType.__dict__['cell_contents'].__get__

# ══════════════════════════════════════
# PyTutor Tracer
# ══════════════════════════════════════

_snapshots = []
_call_stack = []  # list of frame dicts
_heap_map = {}    # id(obj) -> heap_id string
_heap_counter = 0
_step_counter = 0
_MAX_SNAPSHOTS = 5000
_MAX_SEQ_PROPS = 100
_MAX_DICT_PROPS = 50

# A run that is too long to show is stopped, keeping its steps: at the step
# cap, or shortly before the worker is killed at 10 seconds.
_TIME_BUDGET = 8.5
_stop_reason = None   # "steps", "time" or "work" once the tracer has stopped the run
_start_time = 0.0
_events = 0
# The work done so far, in units of about a microsecond under Node (#39: a
# step 10, a frame drawn 1, a heap object drawn 5, a value serialized 2), and
# how much a run may do before it is stopped as out of time: None in the app.
# The CPython suite sets it (and turns the time budget off), so a slow run
# stops at the same step on any machine.
_work = 0
_WORK_BUDGET = None
_STEP_WORK = 10
_OBJECT_WORK = 5
_VALUE_WORK = 2
_raised_at = {}       # frame -> the instruction an exception last passed through it at (#80)

# The instructions a frame returns (or yields) at. A 'return' event anywhere
# else is the frame unwinding: an exception leaving it, perhaps after a
# finally block or an inlined comprehension's cleanup ran and re-raised it.
# So is one at the very instruction an exception passed through the frame
# at: nothing ran since. A frame that handled the exception and went on
# (a for loop ending at a StopIteration, contextlib.suppress) returns from
# another instruction, a real return (#80).
_RETURN_OPS = frozenset(_dis.opmap[name] for name in ('RETURN_VALUE', 'RETURN_CONST', 'YIELD_VALUE') if name in _dis.opmap)
_YIELD_VALUE = _dis.opmap['YIELD_VALUE']
# A coroutine's or async generator's frame suspends at its awaits with a YIELD_VALUE too.
_CO_AWAITING = 0x80 | 0x100 | 0x200   # CO_COROUTINE, CO_ITERABLE_COROUTINE, CO_ASYNC_GENERATOR

def _returns(frame):
    return _raised_at.get(frame) != frame.f_lasti and frame.f_code.co_code[frame.f_lasti] in _RETURN_OPS

class _TutorStop(BaseException):
    """Ends a run from the tracer. A BaseException, so the program's own 'except Exception' doesn't catch it."""

def _stop(reason):
    global _stop_reason
    _stop_reason = reason
    _settrace(None)
    raise _TutorStop()

# What students see when the tracer itself fails (#30, #34): the steps so far,
# and this. The details go to the browser's console.
_INTERNAL_ERROR = 'Internal PyTutor error (please report it)'

def _internal_failure():
    try:
        _real_stderr.write('PyTutor internal error:' + chr(10) + _traceback.format_exc())
    except Exception:
        pass
    _stop("internal")

# ── The recursion limit (#34) ──
#
# As "python main.py" has it: the program's module frame is depth 1, so the
# tracer's and Pyodide's frames below it (_base of them) don't count, nor do
# PyTutor's comprehension frames, and the program sees its own limit through
# sys.getrecursionlimit/setrecursionlimit (_limit). The trace function's own
# frames would count against the real limit, so it is _HEADROOM higher, and a
# new frame deeper than _limit gets CPython's RecursionError from the tracer.
# CPython turns tracing off when a trace function raises: a one-shot profile
# hook (_retrace) turns it back on.
_HEADROOM = 50
_limit = _DEFAULT_LIMIT
_base = 0
_refused = set()      # frames refused for the recursion limit: they never ran

def _getrecursionlimit():
    return _limit

def _setrecursionlimit(n):
    global _limit
    _real_setlimit(n + _base)  # CPython's own checks of n
    _limit = n
    _real_setlimit(n + _base + _HEADROOM)

_getrecursionlimit.__name__ = _getrecursionlimit.__qualname__ = 'getrecursionlimit'
_setrecursionlimit.__name__ = _setrecursionlimit.__qualname__ = 'setrecursionlimit'

def _depth(frame):
    n = 0
    while frame is not None:
        code = frame.f_code
        if not (code.co_name in _COMP_FRAMES and code.co_filename == _USER_FILE):
            n += 1
        frame = frame.f_back
    return n

def _retrace(frame, event, arg):
    _setprofile(None)
    _settrace(_tracer)

# ── The program's own trace function (#78) ──
#
# sys.settrace and sys.gettrace are the program's while it runs: a trace
# function it sets gets the events CPython would give it, after the tracer has
# taken its step (a tracing demo, the trace module, doctest restoring what it
# found), and sys.settrace(None) ends only the program's tracing, never the
# tracer's.
_program_trace = None   # the program's global trace function
_program_local = {}     # frame -> the program's local trace function for it

def _program_settrace(function):
    global _program_trace
    _program_trace = function
    if function is None:
        _program_local.clear()

def _program_gettrace():
    return _program_trace

_program_settrace.__name__ = _program_settrace.__qualname__ = 'settrace'
_program_gettrace.__name__ = _program_gettrace.__qualname__ = 'gettrace'

def _chain(frame, event, arg, result):
    # Gives an event to the program's trace function, as CPython would, and
    # returns the tracer's local trace function for the frame if either needs
    # its events.
    if frame.f_code.co_filename == _TRACER_FILE:
        return result
    try:
        if event == 'call':
            local = _program_trace(frame, event, arg) if _program_trace is not None else None
            if local is not None:
                _program_local[frame] = local
        else:
            local = _program_local.get(frame)
            if local is not None:
                local = local(frame, event, arg)
                if local is None or event == 'return':
                    _program_local.pop(frame, None)
                else:
                    _program_local[frame] = local
    except BaseException:
        # As CPython does when a trace function raises: the program's tracing
        # ends and the exception reaches the program. Raising turns the
        # tracer off too; _retrace turns it back on.
        _program_settrace(None)
        _setprofile(_retrace)
        raise
    return _tracer if frame in _program_local else result

# ── What a frame shows (#38) ──
#
# Every variable the program has, in the order pythontutor.com shows them:
# a function's in its code's order (f_locals: the parameters, then the other
# locals as compiled), the module's in the order they first appeared (a
# variable deleted and defined again keeps its place), a class body's in the
# order it defined them. Hidden are only the names Python keeps itself.

# The module's own: CPython's __main__ has them, or Python sets them (from a
# docstring or annotations; the warnings module's registry).
_MODULE_BOOKKEEPING = frozenset({'__name__', '__builtins__', '__doc__', '__annotations__', '__package__', '__spec__', '__loader__', '__file__', '__cached__', '__warningregistry__'})
# A class body's and a class's own (pythontutor.com hides these too).
_CLASS_BOOKKEEPING = frozenset({'__module__', '__qualname__', '__dict__', '__weakref__', '__doc__', '__annotations__', '__classcell__', '__firstlineno__', '__static_attributes__'})
# A method's implicit cell for super() (and 3.12's for type parameters).
_FUNCTION_BOOKKEEPING = frozenset({'__class__', '__classdict__'})

_module_order = {}    # the module's variables in the order they first appeared (a dict as an ordered set)

def _shown_names(frame_info, local_vars):
    names = [k for k in dict.keys(local_vars) if type(k) is str and not k.startswith('.')]
    kind = frame_info["kind"]
    if kind == "module":
        for k in names:
            if k not in _module_order:
                _module_order[k] = None
        present = set(names)
        return [k for k in _module_order if k in present and k not in _MODULE_BOOKKEEPING]
    if kind == "class":
        # A name the class's namespace started with (an Enum's
        # _generate_next_value_, from its metaclass's __prepare__) is hidden
        # while it holds the same object.
        base = frame_info["base"]
        return [k for k in names if k not in _CLASS_BOOKKEEPING and not (k in base and dict.__getitem__(local_vars, k) is base[k])]
    return [k for k in names if k not in _FUNCTION_BOOKKEEPING]

def _frame_kind(code):
    if code.co_name == '<module>':
        return "module"
    return "function" if code.co_flags & _CO_OPTIMIZED else "class"

# The words of the program's source: an attribute a library adds (an Enum's
# _member_map_, a dataclass's __match_args__) isn't one, an attribute the
# program sets is (#38).
_source_words = frozenset()

def _is_source_word(name):
    if name in _source_words:
        return True
    # A private name as Python mangles it: _Account__secret for __secret.
    i = name.find('__', 1)
    return name.startswith('_') and i > 1 and name[i:] in _source_words

# Lines that are continuations of multi-line simple statements, each with the
# line its statement starts on: they take no step of their own, nor does the
# statement's first line when the statement comes back to it (a call on a
# line of its own after its arguments' lines, #80).
_continuation_lines = {}

# The program's file name, as CPython names it in tracebacks and warnings.
_USER_FILE = 'main.py'

def _main_module():
    # A fresh __main__ module with the names python main.py gives it, in its
    # order (#77): __name__, __doc__, __package__, __loader__ and __spec__
    # from ModuleType, then __annotations__ and __builtins__ (the builtins
    # module), then __file__ and __cached__.
    module = _types.ModuleType('__main__')
    ns = module.__dict__
    ns['__loader__'] = _SourceFileLoader('__main__', _USER_FILE)
    ns['__annotations__'] = {}
    ns['__builtins__'] = _builtins
    ns['__file__'] = _USER_FILE
    ns['__cached__'] = None
    return module

# ── Output: captured at the streams (#31) ──
#
# While the program runs, sys.stdout and sys.stderr are TextIOWrappers over
# _TutorBuffers (#78), so the real print (end, sep, file), sys.stdout.write, input()'s prompt, warnings,
# traceback.print_exc() and contextlib.redirect_stdout all work as in CPython
# run unbuffered (python -u). Each step shows stdout's lines, and once stderr
# has been used, every line with its stream (a line belongs to the stream that
# wrote its first characters).

_out_lines = ['']       # stdout split on newlines; the last entry is the open line
# Every line as [stream, text, input ranges or None], in program order: kept
# from the first write to stderr or read from stdin on (#84), started then
# from stdout's lines; until then the console is stdout.
_console = []
_console_live = False
_console_open = False   # the last line of _console has no newline yet
_stderr_used = False
_stdin_used = False
_output_count = 0       # writes and echoes so far
_output_seen = 0        # ... when the last step was taken

def _start_console():
    # The console from stdout's lines, at the first write to stderr or read from stdin.
    global _console_live, _console_open
    _console_live = True
    _console.extend([['stdout', t, None] for t in _out_lines[:-1]])
    if _out_lines[-1]:
        _console.append(['stdout', _out_lines[-1], None])
    _console_open = bool(_out_lines[-1])

def _console_add(stream, s, echo):
    # Adds s to the console's lines; an echo marks its characters as input.
    global _console_open
    if not echo:
        # Many lines at once (one print of a long text, #84): the lines in between are whole.
        parts = s.split('\\n')
        first = parts[0]
        if first:
            if _console_open:
                _console[-1][1] += first
            else:
                _console.append([stream, first, None])
                _console_open = True
        if len(parts) > 1:
            if not _console_open:
                _console.append([stream, '', None])
            _console.extend([[stream, t, None] for t in parts[1:-1]])
            if parts[-1]:
                _console.append([stream, parts[-1], None])
                _console_open = True
            else:
                _console_open = False
        return
    for i, part in enumerate(s.split('\\n')):
        if i > 0:
            if not _console_open:
                _console.append([stream, '', None])
            if echo:
                # The line ends with the input's newline: an empty range at its end.
                line = _console[-1]
                line[2] = (line[2] or []) + [[len(line[1]), len(line[1])]]
            _console_open = False
        if part:
            if not _console_open:
                _console.append([stream, '', None])
                _console_open = True
            line = _console[-1]
            start = len(line[1])
            line[1] += part
            if echo:
                ranges = line[2] or []
                if ranges and ranges[-1][1] == start:
                    ranges[-1][1] = len(line[1])
                else:
                    ranges.append([start, len(line[1])])
                line[2] = ranges

def _write(stream, s):
    global _stderr_used, _output_count
    _output_count += 1
    if stream == 'stderr':
        _stderr_used = True
        if not _console_live:
            _start_console()
    if stream == 'stdout':
        parts = s.split('\\n')
        _out_lines[-1] += parts[0]
        _out_lines.extend(parts[1:])
    if _console_live:
        _console_add(stream, s, False)

def _echo(s):
    # What the program read from stdin shows on the console, marked as input,
    # where a terminal shows what was typed: after input()'s prompt (#32). It
    # isn't the program's output, so stdout doesn't hold it.
    global _stdin_used, _output_count
    _stdin_used = True
    _output_count += 1
    if not _console_live:
        _start_console()
    _console_add('stdout', s, True)

class _TutorBuffer(_io.BufferedIOBase):
    # The bytes under sys.stdout or sys.stderr while the program runs (#78):
    # what is written reaches the console at once, as with python -u.

    def __init__(self, stream):
        self._stream = stream
        self._decode = _codecs.getincrementaldecoder('utf-8')('replace').decode

    @property
    def name(self):
        return '<' + self._stream + '>'

    @property
    def mode(self):
        return 'wb'

    def writable(self):
        return True

    def isatty(self):
        return False

    def write(self, b):
        if isinstance(b, str):
            raise TypeError("a bytes-like object is required, not 'str'")
        if self.closed:
            raise ValueError('write to closed file')
        data = bytes(memoryview(b))
        text = self._decode(data)
        if text:
            _write(self._stream, text)
        return len(data)

    def __repr__(self):
        return "<_io.BufferedWriter name='<" + self._stream + ">'>"

def _output_stream(stream, errors):
    # sys.stdout or sys.stderr while the program runs: a real TextIOWrapper,
    # as CPython's (reconfigure, buffer, line_buffering, write_through), whose
    # bytes are recorded. stdout is strict, stderr backslashreplace, as CPython's.
    # (newline: a line ends with chr(10) wherever the tracer runs.)
    text = _io.TextIOWrapper(_TutorBuffer(stream), encoding='utf-8', errors=errors, newline=chr(10), write_through=True)
    text.mode = 'w'
    return text

class _TutorStdinBuffer(_io.BufferedIOBase):
    # What the stdin panel holds (#32), read by sys.stdin and, as bytes, by
    # sys.stdin.buffer (#78), from one position. What is read is echoed on the
    # console.

    def __init__(self, text):
        self._text = text
        self._pos = 0

    @property
    def name(self):
        return '<stdin>'

    @property
    def mode(self):
        return 'rb'

    def readable(self):
        return True

    def isatty(self):
        return False

    def _take(self, n):
        # The next n characters (all of them for None or a negative n), echoed.
        if self.closed:
            raise ValueError('I/O operation on closed file.')
        end = len(self._text) if n is None or n < 0 else min(len(self._text), self._pos + n)
        s = self._text[self._pos:end]
        self._pos = end
        if s:
            _echo(s)
        return s

    def _line_length(self, size):
        newline = self._text.find(chr(10), self._pos)
        n = (len(self._text) if newline < 0 else newline + 1) - self._pos
        return n if size is None or size < 0 else min(n, size)

    def _chars_in(self, size):
        # How many characters fit in size bytes (at least one, if any are left).
        if size is None or size < 0:
            return -1
        rest = self._text[self._pos:self._pos + size].encode('utf-8', 'surrogatepass')[:size]
        n = len(rest.decode('utf-8', 'ignore'))
        return n if n or not size else 1

    def read(self, size=-1):
        return self._take(self._chars_in(size)).encode('utf-8', 'surrogatepass')

    def read1(self, size=-1):
        return self.read(size)

    def readline(self, size=-1):
        n = self._line_length(-1)
        if size is not None and size >= 0:
            n = min(n, self._chars_in(size) if size else 0)
        return self._take(n).encode('utf-8', 'surrogatepass')

    def readinto(self, b):
        data = self.read(len(b))
        b[:len(data)] = data
        return len(data)

    def __repr__(self):
        return "<_io.BufferedReader name='<stdin>'>"

class _TutorStdin(_io.TextIOWrapper):
    # sys.stdin while the program runs: the input typed in the stdin panel
    # (#32). input() writes its prompt to sys.stdout and reads a line here, as
    # CPython does when stdin isn't a terminal; at the end, EOFError. A
    # TextIOWrapper (#78), whose reads take what they need and no more, so the
    # console echoes what each read consumed.

    def __init__(self, text):
        super().__init__(_TutorStdinBuffer(text), encoding='utf-8', errors='strict', newline=chr(10))
        self.mode = 'r'

    def _check(self):
        if self.closed:
            raise ValueError('I/O operation on closed file.')

    def read(self, size=-1):
        self._check()
        return self.buffer._take(size)

    def readline(self, size=-1):
        self._check()
        return self.buffer._take(self.buffer._line_length(size))

    def readlines(self, hint=-1):
        lines = []
        total = 0
        while hint is None or hint <= 0 or total < hint:
            line = self.readline()
            if not line:
                break
            lines.append(line)
            total += len(line)
        return lines

    def __next__(self):
        line = self.readline()
        if not line:
            raise StopIteration
        return line

    def __repr__(self):
        return "<_io.TextIOWrapper name='<stdin>' mode='r' encoding='utf-8'>"

# Named as CPython's (type(sys.stdin).__name__ is 'TextIOWrapper'), and
# never taken for the program's classes, which are __main__'s.
_TutorStdin.__name__ = _TutorStdin.__qualname__ = 'TextIOWrapper'
_TutorBuffer.__name__ = _TutorBuffer.__qualname__ = 'BufferedWriter'
_TutorStdinBuffer.__name__ = _TutorStdinBuffer.__qualname__ = 'BufferedReader'
for _stream_class in (_TutorStdin, _TutorBuffer, _TutorStdinBuffer):
    _stream_class.__module__ = '_io'
del _stream_class

def _stdout_shown():
    # stdout's lines, without the empty line after a final newline
    return _out_lines[:-1] if _out_lines[-1] == '' else list(_out_lines)

def _console_line_parts():
    # Every console line as a part (its stream, text and echoed input), once
    # stderr or stdin was used. Only the last line can have changed since the
    # last call: the ones before it are finished.
    if not (_stderr_used or _stdin_used):
        return False
    n = len(_console_lines)
    for i in range(n - 1 if n else 0, len(_console)):
        st, t, rs = _console[i]
        key = (st, t, tuple(map(tuple, rs)) if rs else None)
        if i < n and _console_lines[i][0] == key:
            continue
        line = {"text": t, "stream": st, "input": [list(r) for r in rs]} if rs else {"text": t, "stream": st}
        entry = (key, _part(line))
        if i < n:
            _console_lines[i] = entry
        else:
            _console_lines.append(entry)
    return True

def _with_output(snapshot):
    # The output as it is now, on a step: the same parts as the last step's
    # while nothing was written (#39). A list of lines grows at its end, and
    # only its last line can change, so a new one is the last one's lines
    # but that one and the lines added since, never compared (#84).
    global _output_seen, _output_parts, _stdout_last, _console_last
    _output_seen = _output_count
    if _output_parts is None or _output_parts[0] != _output_count:
        n = len(_out_lines) - (1 if _out_lines[-1] == '' else 0)
        if _stdout_last is None:
            stdout = _part({"add": _out_lines[:n]})
        else:
            part, shown, was_open = _stdout_last
            keep = shown - 1 if was_open else shown
            stdout = _part({"base": part, "keep": keep, "add": _out_lines[keep:n]})
        _stdout_last = (stdout, n, _out_lines[-1] != '')
        console = None
        if _console_line_parts():
            count = len(_console_lines)
            if _console_last is None:
                console = _part({"add": [e[1] for e in _console_lines]})
            else:
                part, shown = _console_last
                keep = max(shown - 1, 0)
                console = _part({"base": part, "keep": keep, "add": [e[1] for e in _console_lines[keep:count]]})
            _console_last = (console, count)
        _output_parts = (_output_count, stdout, console)
    snapshot["stdout"] = _output_parts[1]
    if _output_parts[2] is not None:
        snapshot["console"] = _output_parts[2]
    return snapshot

def _finish_output():
    # Output written after the last step (input()'s prompt before an EOFError,
    # a print on the line that raised, sys.exit()'s message) gets a step of its
    # own, the last step's state with the output now.
    global _step_counter
    if not _snapshots or _output_count == _output_seen:
        return
    _snapshots.append(_with_output(dict(_snapshots[-1], step=_step_counter)))
    _step_counter += 1

# ── Comprehension frames (#33) ──
#
# Python 3.12 inlines list, set and dict comprehensions into the code around
# them (PEP 709): no frame of their own, their variables hidden fast locals of
# the enclosing frame, which 3.12's frame.f_locals can't read without
# corrupting them. So each comprehension is compiled as a function called on
# its outermost iterable, named <listcomp>, <setcomp> or <dictcomp> as before
# 3.12: it gets a real frame, as pythontutor.com showed one, with its own
# variables, the frames of the calls it makes on top of it, and the collection
# it builds as its return value. The tracer never evaluates the program's code
# itself. A comprehension whose meaning depends on the scope it runs in
# (an assignment expression, super(), locals(), ...) stays inlined.
# Generator expressions have real frames already.

_COMP_ARGS = {'.listcomp': '<listcomp>', '.setcomp': '<setcomp>', '.dictcomp': '<dictcomp>'}
_COMP_FRAMES = frozenset(_COMP_ARGS.values())
_SCOPE_NAMES = frozenset({'super', '__class__', 'locals', 'vars', 'dir', 'eval', 'exec'})

class _CompWrapper(_ast.NodeTransformer):
    def _wrap(self, node, arg):
        self.generic_visit(node)
        if any(g.is_async for g in node.generators):
            return node
        for sub in _ast.walk(node):
            if isinstance(sub, (_ast.NamedExpr, _ast.Await, _ast.Yield, _ast.YieldFrom)):
                return node
            if isinstance(sub, _ast.Name) and sub.id in _SCOPE_NAMES:
                return node
        outer = node.generators[0].iter
        node.generators[0].iter = _ast.copy_location(_ast.Name(arg, _ast.Load()), outer)
        params = _ast.arguments(posonlyargs=[], args=[_ast.arg(arg)], kwonlyargs=[], kw_defaults=[], defaults=[])
        func = _ast.copy_location(_ast.Lambda(params, node), node)
        return _ast.fix_missing_locations(_ast.copy_location(_ast.Call(func, [outer], []), node))

    def visit_ListComp(self, node):
        return self._wrap(node, '.listcomp')

    def visit_SetComp(self, node):
        return self._wrap(node, '.setcomp')

    def visit_DictComp(self, node):
        return self._wrap(node, '.dictcomp')

def _name_comprehensions(code):
    # The wrapping lambdas, named as their comprehension.
    consts = tuple(_name_comprehensions(c) if isinstance(c, _types.CodeType) else c for c in code.co_consts)
    if code.co_name == '<lambda>' and code.co_argcount == 1 and code.co_varnames[0] in _COMP_ARGS:
        name = _COMP_ARGS[code.co_varnames[0]]
        return code.replace(co_consts=consts, co_name=name, co_qualname=code.co_qualname[:-len('<lambda>')] + name)
    return code.replace(co_consts=consts)

def _compile_program(source_code):
    # The program's code with its comprehensions in frames of their own. The
    # source is compiled as written first, so its warnings and SyntaxError are
    # CPython's own, each once (#40); the transformed tree is compiled quietly.
    plain = compile(source_code, _USER_FILE, 'exec', dont_inherit=True)
    try:
        with _warnings.catch_warnings():
            _warnings.simplefilter('ignore')
            tree = _ast.parse(source_code, _USER_FILE)
            return _name_comprehensions(compile(_CompWrapper().visit(tree), _USER_FILE, 'exec', dont_inherit=True))
    except SyntaxError:
        return plain

def _is_comprehension(code):
    return code.co_name in _COMP_FRAMES

_CO_OPTIMIZED = 1

def _frame_locals(frame):
    # A frame's variables. The module's are its globals: 3.12's f_locals would
    # merge an inlined comprehension's hidden locals into them and write them
    # back corrupted. A class body that holds an inlined comprehension (one
    # left inlined) can't be read safely either.
    code = frame.f_code
    if code.co_name == '<module>':
        return frame.f_globals
    if not (code.co_flags & _CO_OPTIMIZED) and code.co_nlocals > 0:
        return {}
    loc = frame.f_locals
    # A metaclass's __prepare__ may give a class body a mapping that isn't a dict: not read.
    return loc if issubclass(type(loc), dict) else {}

# ── Multi-line statement detection ──

def _scan_continuation_lines(source_code):
    """Find continuation lines of multi-line simple statements (no visible effect)."""
    global _continuation_lines
    _continuation_lines = {}
    try:
        with _warnings.catch_warnings():
            _warnings.simplefilter('ignore')
            tree = _ast.parse(source_code)
    except SyntaxError:
        return

    # Collect all lines that start a statement
    _start_lines = set()
    for node in _ast.walk(tree):
        if isinstance(node, _ast.stmt):
            _start_lines.add(node.lineno)

    # Lines inside a multi-line simple statement that aren't themselves
    # statement starts are continuation lines — skip their snapshots.
    _SIMPLE = (_ast.Assign, _ast.AugAssign, _ast.AnnAssign,
               _ast.Expr, _ast.Return, _ast.Assert,
               _ast.Delete, _ast.Raise)
    for node in _ast.walk(tree):
        if isinstance(node, _SIMPLE):
            end = getattr(node, 'end_lineno', None) or node.lineno
            if end > node.lineno:
                for ln in range(node.lineno + 1, end + 1):
                    if ln not in _start_lines:
                        _continuation_lines.setdefault(ln, node.lineno)

# ── Heap serialization ──
#
# Serializing reads the program's objects without running its code (#34): no
# hasattr or getattr (a class's __getattr__ or __getattribute__), no len() or
# iteration through a subclass's __len__ or __iter__, no str() or repr() of
# its objects. The containers' own methods (list.__getitem__, dict.items, ...),
# object.__getattribute__ for an instance's __dict__ and the member
# descriptors of __slots__ read what is stored. Heap objects are serialized
# from a queue, not by recursion, so a long linked list doesn't take the tracer
# near the recursion limit.

_FUNCTION_TYPES = (_types.FunctionType, _types.BuiltinFunctionType, _types.MethodType, _types.BuiltinMethodType)
_METHOD_WRAPPERS = (staticmethod, classmethod, property)
# Ints JavaScript holds exactly: their text is the same in both languages.
_EXACT_INT = 2 ** 53
_NoneType = type(None)
# The values drawn inline, as the snapshot's primitives: exactly these types
# (#78). An instance of a subclass (an IntEnum member, a str subclass) is an
# object of its own, as the reference trace has it.
_PRIMITIVE_TYPES = frozenset({int, float, str, bool, complex, _NoneType})
_is_primitive_type = _PRIMITIVE_TYPES.__contains__
_compress = _itertools.compress
_islice = _itertools.islice
_MISSING = object()

def _is_primitive(v):
    return type(v) in _PRIMITIVE_TYPES

def _get_heap_id(obj):
    # A heap object's id, by its address and type. The tracer holds no object
    # between steps (#78), so an address can be another object's later: one
    # of another type gets a new id, one of the same type keeps it, as
    # CPython's id() does.
    global _heap_counter
    k = id(obj)
    tid = id(type(obj))
    entry = _heap_map.get(k)
    if entry is not None and entry[1] == tid:
        return entry[0]
    _heap_counter += 1
    heap_id = str(_heap_counter)
    _heap_map[k] = (heap_id, tid)
    return heap_id

def _digits(v):
    # How many digits an int has, from its logarithm (#84: 10 ** (n - 1) for
    # an int of millions of digits took seconds); only an int within a
    # millionth of a power of ten is compared with that power.
    v = abs(v)
    if v < 10:
        return 1
    f = _log10(v)
    n = int(f)
    if f - n < 1e-6 or n + 1 - f < 1e-6:
        p = round(f)
        return p + 1 if v >= 10 ** p else p
    return n + 1

def _int_value(val):
    # An int as Python writes it (#37): a JSON number while JavaScript holds it
    # exactly, else its digits as text (a JSON number would lose them).
    if -_EXACT_INT <= val <= _EXACT_INT:
        return {"type": "number", "value": val}
    try:
        text = int.__repr__(val)
    except ValueError:
        # Past Python's limit for converting an int to text: shown by its size.
        text = '<int with %d digits>' % _digits(val)
    return {"type": "number", "value": text, "display": text}

def _primitive_value(val):
    # A value of exactly int, float, str, bool, complex or None as the
    # snapshot shows it, with the text Python writes for it (display, #37):
    # None, True, False, a float's repr (5.0, -0.0, 1e+16, inf), an int past
    # what JavaScript holds exactly, a complex number's repr.
    if val is None:
        return {"type": "null", "value": None, "display": "None"}
    if val is True:
        return {"type": "boolean", "value": True, "display": "True"}
    if val is False:
        return {"type": "boolean", "value": False, "display": "False"}
    t = type(val)
    if t is int:
        return _int_value(val)
    if t is float:
        text = float.__repr__(val)
        if _isinf(val):
            return {"type": "number", "value": "Infinity" if val > 0 else "-Infinity", "display": text}
        if _isnan(val):
            return {"type": "number", "value": "NaN", "display": text}
        return {"type": "number", "value": val, "display": text}
    if t is str:
        return {"type": "string", "value": val}
    text = complex.__repr__(val)
    return {"type": "number", "value": text, "display": text}

def _serialize_value(val):
    # A value as the snapshot shows it: a primitive inline, with the object it
    # is (objectId, #83: its heap id, for reference mode), a heap object as a
    # reference to it.
    global _work
    _work += _VALUE_WORK
    if type(val) in _PRIMITIVE_TYPES:
        value = _primitive_value(val)
        value["objectId"] = _get_heap_id(val)
        return value
    # Heap objects: lists, dicts, tuples, sets, functions, instances, ...
    return {"type": "ref", "heapId": _get_heap_id(val)}

def _safe_repr(v, depth=2):
    # A dict key's text, without running the program's code.
    t = type(v)
    if v is None or t is bool:
        return repr(v)
    if issubclass(t, int):
        try:
            return int.__repr__(v)
        except ValueError:
            return '<int with %d digits>' % _digits(v)
    if issubclass(t, float):
        return float.__repr__(v)
    if issubclass(t, complex):
        return complex.__repr__(v)
    if issubclass(t, str):
        return str.__repr__(v)
    if issubclass(t, tuple) and depth > 0:
        items = [_safe_repr(x, depth - 1) for x in tuple.__iter__(v)]
        return '(' + ', '.join(items) + (',' if len(items) == 1 else '') + ')'
    if issubclass(t, frozenset) and depth > 0:
        return 'frozenset({' + ', '.join(_safe_repr(x, depth - 1) for x in frozenset.__iter__(v)) + '})'
    return '<' + _type_name(t) + ' object>'

def _key_text(k):
    if type(k) is str:
        return k
    return _safe_repr(k)

def _safe_name(obj):
    # A function's or class's name, read through the data descriptor of its type.
    for attr in ('__name__', '__qualname__'):
        try:
            name = object.__getattribute__(obj, attr)
        except Exception:
            continue
        if type(name) is str and name:
            return name
    return ''

def _object_dict(obj):
    try:
        d = object.__getattribute__(obj, '__dict__')
    except Exception:
        return None
    return d if type(d) is dict else None

def _per_type(cache, t, compute):
    # What compute(t) gives, found once per type for this run. The cache holds
    # the type only weakly (#78): a class the program drops can die.
    k = id(t)
    found = cache.get(k)
    if found is not None and found[1]() is t:
        return found[0]
    value = compute(t)
    cache[k] = (value, _weakref.ref(t))
    return value

def _find_slot_descriptors(t):
    found = []
    for cls in _type_mro(t):
        cls_dict = _type_dict(cls)
        slots = cls_dict.get('__slots__')
        if slots is None:
            continue
        if type(slots) is str:
            slots = (slots,)
        for name in slots:
            if type(name) is not str or name in ('__dict__', '__weakref__'):
                continue
            stored = name
            if name.startswith('__') and not name.endswith('__'):
                stored = '_' + _type_name(cls).lstrip('_') + name
            descr = cls_dict.get(stored)
            if type(descr) is _MemberDescriptor:
                found.append((name, descr, cls))
    return found

def _slot_descriptors(t):
    # (name, member descriptor, class) for the __slots__ of the Python classes in t's MRO.
    return _per_type(_slots_of, t, _find_slot_descriptors)

def _slot_values(obj):
    # (name, value) for obj's slots, read through their member descriptors
    # (an unset slot is skipped).
    out = []
    for name, descr, cls in _slot_descriptors(type(obj)):
        try:
            out.append((name, descr.__get__(obj, cls)))
        except AttributeError:
            continue
    return out

def _wrapped_function(v):
    # The function a method's value runs: itself, a staticmethod's or
    # classmethod's __func__, a property's getter. None for anything else.
    t = type(v)
    if t is _types.FunctionType:
        return v
    if issubclass(t, staticmethod):
        return staticmethod.__dict__['__func__'].__get__(v)
    if issubclass(t, classmethod):
        return classmethod.__dict__['__func__'].__get__(v)
    if issubclass(t, property):
        return property.__dict__['fget'].__get__(v)
    return None

def _is_program_function(f):
    return type(f) is _types.FunctionType and _function_code(f).co_filename == _USER_FILE

def _is_program_class(cls):
    # A class the program defined (its namespace is __main__'s, as in CPython).
    module = _type_dict(cls).get('__module__')
    return type(module) is str and module == '__main__'

def _is_library_descriptor(v):
    # A library's descriptor stored in a class: a __slots__ member, a named
    # tuple's field getter. The program reads values through it.
    t = type(v)
    if _is_program_class(t):
        return False
    return any('__get__' in _type_dict(c) for c in _type_mro(t))

def _class_attribute_shown(name, v):
    # What a class drawing shows: the methods the program wrote and the
    # attributes it named, not what Python or a library added (a dataclass's
    # generated __init__, an Enum's _member_map_, an ABC's _abc_impl).
    if name in _CLASS_BOOKKEEPING:
        return False
    f = _wrapped_function(v)
    if f is not None:
        return _is_program_function(f)
    if _is_library_descriptor(v):
        return False
    return _is_source_word(name)

def _instance_attribute_shown(name):
    # An object's attributes, but a library's private ones (an Enum
    # member's _value_, a Thread's _target): a private name is shown when the
    # program names it (self._balance).
    return not name.startswith('_') or _is_source_word(name)

_INDEX_KEYS = [str(i) for i in range(max(_MAX_SEQ_PROPS, _MAX_DICT_PROPS))]

# Library types drawn by what they hold (#81).
_deque = _collections.deque
_OrderedDict = _collections.OrderedDict
_defaultdict = _collections.defaultdict
_GENERATOR_TYPES = (_types.GeneratorType, _types.CoroutineType, _types.AsyncGeneratorType)
_GENERATOR_FRAME = {
    _types.GeneratorType: _types.GeneratorType.__dict__['gi_frame'].__get__,
    _types.CoroutineType: _types.CoroutineType.__dict__['cr_frame'].__get__,
    _types.AsyncGeneratorType: _types.AsyncGeneratorType.__dict__['ag_frame'].__get__,
}
_GENERATOR_CODE = {
    _types.GeneratorType: _types.GeneratorType.__dict__['gi_code'].__get__,
    _types.CoroutineType: _types.CoroutineType.__dict__['cr_code'].__get__,
    _types.AsyncGeneratorType: _types.AsyncGeneratorType.__dict__['ag_code'].__get__,
}
_DICT_VIEWS = {}
for _view_dict in ({}, _OrderedDict()):
    _DICT_VIEWS[type(_view_dict.keys())] = 'keys'
    _DICT_VIEWS[type(_view_dict.values())] = 'values'
    _DICT_VIEWS[type(_view_dict.items())] = 'items'
del _view_dict
# Iterators over a sequence, whose __reduce__ (theirs, in C) says what they
# iterate over and where they are, without moving them.
_SEQUENCE_ITERATORS = frozenset(type(i) for i in (
    iter([]), iter(()), iter(range(1)), iter(range(2 ** 70)), iter('a'), iter('\u00e9'), reversed([]), reversed(range(1)),
))
_exception_args = BaseException.__dict__['args'].__get__
_method_function = _types.MethodType.__dict__['__func__'].__get__
_method_self = _types.MethodType.__dict__['__self__'].__get__
_builtin_self = _types.BuiltinMethodType.__dict__['__self__'].__get__
_type_module = type.__dict__['__module__'].__get__
_type_qualname = type.__dict__['__qualname__'].__get__
_function_qualname = _types.FunctionType.__dict__['__qualname__'].__get__
# Library values drawn by their own type's repr, which reads only what they
# hold: an exact instance of one of these (a subclass could change what the
# repr reads).
_VALUE_TYPES = frozenset({
    ('builtins', 'range'), ('builtins', 'bytes'), ('builtins', 'bytearray'),
    ('fractions', 'Fraction'), ('decimal', 'Decimal'),
    ('datetime', 'date'), ('datetime', 'datetime'), ('datetime', 'time'), ('datetime', 'timedelta'), ('datetime', 'timezone'),
    ('re', 'Pattern'), ('re', 'Match'),
    ('_io', 'TextIOWrapper'), ('_io', 'BufferedReader'), ('_io', 'BufferedWriter'), ('_io', 'FileIO'),
})
_CONTAINER_TYPES = (list, tuple, dict, set, frozenset, _deque)

# How each type's objects are drawn, in the order they are tried.
_KIND_TYPES = (
    ("list", list), ("deque", _deque), ("tuple", tuple), ("dict", dict), ("set", (set, frozenset)),
    ("function", _FUNCTION_TYPES), ("method", _METHOD_WRAPPERS), ("class", type),
    ("module", _types.ModuleType), ("enum", _Enum), ("exception", BaseException),
    ("generator", _GENERATOR_TYPES),
    ("primitive", (int, float, str, complex)),
)
_kinds = {}           # id(type) -> (its kind, a weak reference to it), for this run
# The kinds of the types most objects have, without a lookup through _kinds.
_BUILTIN_KINDS = {list: "list", tuple: "tuple", dict: "dict", set: "set", frozenset: "set", _types.FunctionType: "function"}
_is = _operator.is_
_slots_of = {}        # id(type) -> (its slots' descriptors, a weak reference to it), for this run

def _find_kind(t):
    if t in _DICT_VIEWS:
        return "dictview"
    if t in _SEQUENCE_ITERATORS:
        return "seqiter"
    if (_type_module(t), _type_qualname(t)) in _VALUE_TYPES:
        return "value"
    if _type_module(t) == 'functools' and _type_qualname(t) == '_lru_cache_wrapper':
        return "cached"
    for kind, types in _KIND_TYPES:
        if issubclass(t, types):
            return kind
    if not _is_program_class(t) and not _slot_descriptors(t) and any('__next__' in _type_dict(c) for c in _type_mro(t)):
        # A library's iterator (zip, map, enumerate, ...): it can't be read without moving it.
        return "iterator"
    return "instance"

def _kind(t):
    # How a type's objects are drawn, found once per type.
    return _per_type(_kinds, t, _find_kind)

def _primitive_base(obj):
    # The value a subclass of int, float, str or complex holds, as its base type's own.
    t = type(obj)
    if issubclass(t, int):
        return int.__int__(obj)
    if issubclass(t, float):
        return float.__float__(obj)
    if issubclass(t, str):
        return str.__str__(obj)
    return complex.__complex__(obj)

def _attributes(obj, seq):
    # Appends an object's __dict__ keys, then values, to seq; how many.
    d = _object_dict(obj)
    if d is None:
        return 0
    seq += list(dict.keys(d))
    seq += list(dict.values(d))
    return dict.__len__(d)

def _function_label(f, skip=0):
    # A function by the name it was defined with, a method by its class too
    # (its qualified name, without the functions it was defined in), and its
    # parameters, as pythontutor.com shows them (#82): fee(self, amount=…)
    # as fee(self, amount). A bound method's first (self) is left out (skip).
    try:
        name = _function_qualname(f)
    except Exception:
        return _safe_name(f)
    if type(name) is not str:
        return _safe_name(f)
    return name.rsplit('<locals>.', 1)[-1] + _signature(_function_code(f), skip)

_CO_VARARGS = 0x04
_CO_VARKEYWORDS = 0x08

def _signature(code, skip=0):
    n = code.co_argcount
    k = code.co_kwonlyargcount
    names = list(code.co_varnames[:n])
    if code.co_posonlyargcount:
        names.insert(code.co_posonlyargcount, '/')
    i = n + k
    if code.co_flags & _CO_VARARGS:
        names.append('*' + code.co_varnames[i])
        i += 1
    elif k:
        names.append('*')
    names += code.co_varnames[n:n + k]
    if code.co_flags & _CO_VARKEYWORDS:
        names.append('**' + code.co_varnames[i])
    return '(' + ', '.join(names[skip:]) + ')'

def _function_state(f, seq):
    # What a program's function holds besides its code (#82): its default
    # values, keyed name= (a mutable default lives on, between calls, here),
    # and the variables it closes over (its cells, keyed by name: each
    # counter's count). Appends the values to seq; returns their keys.
    code = _function_code(f)
    keys = []
    if code.co_filename != _USER_FILE:
        return keys
    defaults = _function_defaults(f)
    if type(defaults) is tuple and defaults:
        params = code.co_varnames[:code.co_argcount]
        for name, v in zip(params[len(params) - len(defaults):], defaults):
            keys.append(name + '=')
            seq.append(v)
    kwdefaults = _function_kwdefaults(f)
    if type(kwdefaults) is dict:
        for name in code.co_varnames[code.co_argcount:code.co_argcount + code.co_kwonlyargcount]:
            if name in kwdefaults:
                keys.append(name + '=')
                seq.append(dict.__getitem__(kwdefaults, name))
    closure = _function_closure(f)
    if type(closure) is tuple:
        for name, cell in zip(code.co_freevars, closure):
            if name in _FUNCTION_BOOKKEEPING:
                continue
            try:
                v = _cell_contents(cell)
            except ValueError:
                continue  # an empty cell: a variable not assigned yet
            keys.append(name)
            seq.append(v)
    return keys

def _heap_read(obj, t, kind):
    # What a heap object's drawing depends on, read through the types' own
    # methods: the values it may show (seq), in a layout its kind fixes, and
    # anything else (meta). Another step that reads the same objects (by id
    # and type) and meta draws it as before, without building it again (#78).
    # (The exact built-in types first, the most common, with the fewest calls, #84.)
    if t is dict:
        n = dict.__len__(obj)
        if n <= _MAX_DICT_PROPS:
            return [*obj, *obj.values(), None], (n, n, 0)
    elif t is list:
        seq = obj[:_MAX_SEQ_PROPS]
        return seq, (list.__len__(obj), len(seq), 0)
    elif t is tuple:
        seq = list(obj[:_MAX_SEQ_PROPS])
        return seq, (tuple.__len__(obj), len(seq), 0)
    if kind == "list" or kind == "tuple" or kind == "deque":
        if kind == "list":
            seq = list.__getitem__(obj, slice(0, _MAX_SEQ_PROPS))
            n = list.__len__(obj)
        elif kind == "tuple":
            seq = list(tuple.__getitem__(obj, slice(0, _MAX_SEQ_PROPS)))
            n = tuple.__len__(obj)
        else:
            seq = list(_islice(_deque.__iter__(obj), _MAX_SEQ_PROPS))
            n = _deque.__len__(obj)
        # A subclass's attributes after the items (#81).
        shown = len(seq)
        return seq, (n, shown, _attributes(obj, seq) if t not in _CONTAINER_TYPES else 0)
    if kind == "dict":
        # An OrderedDict in its own order (move_to_end), read by its own C views.
        source = _OrderedDict if issubclass(t, _OrderedDict) else dict
        seq = list(_islice(source.keys(obj), _MAX_DICT_PROPS))
        shown = len(seq)
        seq += list(_islice(source.values(obj), _MAX_DICT_PROPS))
        factory = _defaultdict.__dict__['default_factory'].__get__(obj) if issubclass(t, _defaultdict) else None
        seq.append(factory)
        return seq, (dict.__len__(obj), shown, _attributes(obj, seq) if t not in _CONTAINER_TYPES else 0)
    if kind == "set":
        if issubclass(t, set):
            seq = list(_islice(set.__iter__(obj), _MAX_SEQ_PROPS))
            n = set.__len__(obj)
        else:
            seq = list(_islice(frozenset.__iter__(obj), _MAX_SEQ_PROPS))
            n = frozenset.__len__(obj)
        shown = len(seq)
        return seq, (n, shown, _attributes(obj, seq) if t not in _CONTAINER_TYPES else 0)
    if kind == "instance" or kind == "enum" or kind == "primitive" or kind == "exception":
        # Its __dict__'s keys, then values, then its slots' names and values;
        # first a subclass of a primitive type's value, an exception's args.
        seq = [_primitive_base(obj)] if kind == "primitive" else [_exception_args(obj)] if kind == "exception" else []
        n = _attributes(obj, seq)
        if _slot_descriptors(t):
            for name, v in _slot_values(obj):
                seq.append(name)
                seq.append(v)
        return seq, n
    if kind == "class":
        ns = _type_dict(obj)
        keys = list(ns.keys())
        bases = list(_type_bases(obj))
        return keys + list(ns.values()) + bases + [_type_name(obj)], (len(keys), len(bases))
    if kind == "function":
        if t is _types.MethodType:
            # A bound method: its function and the object it is bound to.
            f = _method_function(obj)
            return [_function_label(f, 1) if type(f) is _types.FunctionType else _safe_name(f), _method_self(obj)], "bound"
        if t is _types.BuiltinMethodType:
            return [_safe_name(obj), _builtin_self(obj)], "bound"
        if t is _types.FunctionType:
            seq = [_function_label(obj)]
            return seq, tuple(_function_state(obj, seq))
        return [_safe_name(obj)], None
    if kind == "method":
        f = _wrapped_function(obj)
        signature = _signature(_function_code(f)) if type(f) is _types.FunctionType and not issubclass(t, property) else ''
        return [f, (_safe_name(f) if f is not None else '') + signature], None
    if kind == "generator":
        # A generator (coroutine, async generator): its function, and while it
        # is suspended, its variables (a program's; a library's aren't shown).
        code = _GENERATOR_CODE[t](obj)
        frame = _GENERATOR_FRAME[t](obj)
        seq = [code.co_name]
        n = 0
        if frame is not None and code.co_filename == _USER_FILE:
            local_vars = _frame_locals(frame)
            names = [k for k in dict.keys(local_vars) if type(k) is str and not k.startswith('.') and k not in _FUNCTION_BOOKKEEPING]
            n = len(names)
            seq += names
            seq += [dict.__getitem__(local_vars, k) for k in names]
        return seq, (frame is None, n)
    if kind == "dictview":
        # A dict's keys(), values() or items(), read through the view's own iterator.
        which = _DICT_VIEWS[t]
        items = list(_islice(t.__iter__(obj), _MAX_DICT_PROPS))
        n = t.__len__(obj)
        if which == 'items':
            return [kv[0] for kv in items] + [kv[1] for kv in items], (which, n, len(items))
        return items, (which, n, len(items))
    if kind == "seqiter":
        # What a list (tuple, range, str) iterator iterates over, and the next index.
        reduced = t.__reduce__(obj)
        if type(reduced) is tuple and len(reduced) == 3 and type(reduced[1]) is tuple and len(reduced[1]) == 1:
            return [_type_name(t), reduced[1][0], reduced[2]], True
        return [_type_name(t)], False
    if kind == "value":
        text = next(_type_dict(c)['__repr__'] for c in _type_mro(t) if '__repr__' in _type_dict(c))(obj)
        return [text if type(text) is str else _type_name(t)], None
    if kind == "cached":
        # An @lru_cache (@cache) function: the function it caches, and how many results it holds.
        d = _object_dict(obj) or {}
        wrapped = d.get('__wrapped__')
        info = t.__dict__['cache_info'](obj)
        return [_function_label(wrapped) if type(wrapped) is _types.FunctionType else _safe_name(obj), tuple.__getitem__(info, 3), tuple.__getitem__(info, 2)], None
    # A module or a library's iterator: its name.
    return [_safe_name(obj) if kind == "module" else _type_name(t)], None

def _more(key, count, n):
    # The last property of an object drawn in part: how many more it holds (#81).
    return (key, None, {"type": "empty", "value": None, "display": '\u2026 %d more (%d in all)' % (count, n)})

def _length_label(label, n, shown):
    # The length in an object's label, when not every item is drawn.
    if n <= shown:
        return label
    return (label + ', ' if label else '') + 'len %d' % n

def _subclass_label(t, base):
    # A subclass of a container drawn as its base, by its own name (#81).
    return '' if t is base else _type_name(t)

def _attribute_spec(seq, start, n, spec, prefix=''):
    for i in range(start, start + n):
        if len(spec) >= _MAX_DICT_PROPS:
            break
        k = seq[i]
        if type(k) is str and _instance_attribute_shown(k):
            spec.append((prefix + k, n + i, None))

def _element_key(v):
    # A set element's key: what tells it from the others, not a position (#81).
    if _is_primitive(v):
        return _safe_repr(v)
    return '#' + _get_heap_id(v)

def _heap_build(obj, t, kind, seq, meta):
    # How a heap object is drawn, from what _heap_read read: its object type,
    # label and properties, each property (key text, index of its value in
    # seq, index of its key in seq when the key is drawn as a value), or for a
    # "more" marker (key text, None, its value).
    if kind == "list" or kind == "tuple" or kind == "deque":
        n, shown, attrs = meta
        spec = []
        label = _subclass_label(t, list if kind == "list" else tuple if kind == "tuple" else _deque)
        fields = next((_type_dict(c)['_fields'] for c in _type_mro(t) if '_fields' in _type_dict(c)), None) if kind == "tuple" and t is not tuple else None
        if type(fields) is tuple and len(fields) == n and all(type(f) is str for f in fields):
            # A named tuple: its fields' names.
            spec = [(fields[i], i, None) for i in range(shown)]
        else:
            spec = [(_INDEX_KEYS[i], i, None) for i in range(shown)]
        if n > shown:
            spec.append(_more('\u2026', n - shown, n))
        # A subclass's own attributes, after its items, as .name.
        _attribute_spec(seq, shown, attrs, spec, '.')
        return ("list" if kind == "list" else kind), _length_label(label, n, shown), spec
    if kind == "dict":
        n, shown, attrs = meta
        spec = []
        for i in range(shown):
            k = seq[i]
            # An object key is drawn as a value: an arrow to it.
            spec.append((_key_text(k), shown + i, None if _is_primitive(k) else i))
        if n > shown:
            spec.append(_more('\u2026', n - shown, n))
        label = _subclass_label(t, dict)
        factory = seq[2 * shown]
        if issubclass(t, _defaultdict):
            label += '(' + (_safe_name(factory) or _type_name(type(factory))) + ')' if factory is not None else '(None)'
        _attribute_spec(seq, 2 * shown + 1, attrs, spec, '.')
        return "dict", _length_label(label, n, shown), spec
    if kind == "set":
        n, shown, attrs = meta
        spec = [(_element_key(seq[i]), i, None) for i in range(shown)]
        if n > shown:
            spec.append(_more('\u2026', n - shown, n))
        _attribute_spec(seq, shown, attrs, spec, '.')
        return "set", _length_label(_subclass_label(t, set), n, shown), spec
    if kind == "instance" or kind == "primitive" or kind == "exception":
        # An instance: its __dict__ and its __slots__, as stored; a subclass of
        # a primitive type with its value, an exception with its args.
        start = 0 if kind == "instance" else 1
        spec = [] if kind == "instance" else [("value" if kind == "primitive" else "args", 0, None)]
        n = meta
        _attribute_spec(seq, start, n, spec)
        for j in range(start + 2 * n, len(seq), 2):
            if len(spec) >= _MAX_DICT_PROPS:
                break
            if _instance_attribute_shown(seq[j]):
                spec.append((seq[j], j + 1, None))
        return "object", _type_name(t), spec
    if kind == "class":
        # A class (#38): one the program defined with its bases, the methods it
        # wrote and its class attributes; a library's by its name only.
        nk, nb = meta
        label = seq[-1]
        spec = []
        if _is_program_class(obj):
            bases = [b for b in seq[2 * nk:2 * nk + nb] if b is not object]
            if bases:
                label += '(' + ', '.join(_type_name(b) for b in bases) + ')'
            for i in range(nk):
                if len(spec) >= _MAX_DICT_PROPS:
                    break
                k = seq[i]
                if type(k) is str and _class_attribute_shown(k, seq[nk + i]):
                    spec.append((k, nk + i, None))
        return "class", label, spec
    if kind == "function":
        if meta == "bound":
            # A bound method, named through its function, and the object it is
            # bound to when that is the program's (#81): not a module, nor a
            # library's hidden instance (random.randint's).
            bound = seq[1]
            bt = type(bound)
            shown = bound is not None and not issubclass(bt, _types.ModuleType) and (_is_program_class(bt) or bt in _CONTAINER_TYPES)
            return "function", seq[0], [("__self__", 1, None)] if shown else []
        # A program's function with its defaults and closure variables (#82).
        return "function", seq[0], [(meta[i], 1 + i, None) for i in range(len(meta))] if meta else []
    if kind == "method":
        # A staticmethod, classmethod or property in a class: drawn as its function.
        decorator = 'staticmethod' if issubclass(t, staticmethod) else 'classmethod' if issubclass(t, classmethod) else 'property'
        return "function", '@' + decorator + ' ' + seq[1], []
    if kind == "module":
        # A module is one object, by its name, never drawn in full (#38).
        return "module", seq[0], []
    if kind == "generator":
        finished, n = meta
        name = _COMP_DISPLAY_NAMES.get(seq[0], seq[0])
        if finished:
            name += ' (finished)'
        return "generator", name, [(seq[1 + i], 1 + n + i, None) for i in range(n)]
    if kind == "dictview":
        which, n, shown = meta
        if which == 'items':
            spec = [(_key_text(seq[i]), shown + i, None if _is_primitive(seq[i]) else i) for i in range(shown)]
            object_type = "dict"
        else:
            spec = [(_INDEX_KEYS[i], i, None) for i in range(shown)]
            object_type = "list"
        if n > shown:
            spec.append(_more('\u2026', n - shown, n))
        return object_type, 'dict_' + which, spec
    if kind == "seqiter":
        if meta:
            return "iterator", seq[0], [("over", 1, None), ("next index", 2, None)]
        return "iterator", seq[0] + ' (exhausted)', []
    if kind == "iterator":
        return "iterator", seq[0], []
    if kind == "value":
        return "value", seq[0][:_LABEL_LIMIT], []
    if kind == "cached":
        return "function", ('@cache ' if seq[2] is None else '@lru_cache ') + seq[0], [("cached results", 1, None)]
    # An Enum member, as Python names it, with its value.
    n = meta
    label = _type_name(t)
    spec = []
    for i in range(n):
        k = seq[i]
        if type(k) is str and k == '_name_' and type(seq[n + i]) is str:
            label += '.' + seq[n + i]
        elif type(k) is str and k == '_value_':
            spec.append(("value", n + i, None))
    return "object", label, spec

# ── Recording steps (#39, #78) ──
#
# A step shows every frame and every object they reach, but costs what
# changed since the step before: each frame, variable, heap object and
# property is a part (_part), made once and used again by every later step
# that shows it unchanged. The reply is the parts and the steps referring to
# them by index; run.ts rebuilds the steps with those parts shared, so the
# worker's postMessage (a structured clone) carries each once.
#
# The tracer holds none of the program's objects between steps that CPython
# doesn't hold anyway (#78), so objects die where the program releases them
# (a __del__ runs, with its steps; a weak reference empties; an abandoned
# generator's finally runs) and sys.getrefcount counts what python main.py
# counts. Parts are JSON text. A function frame's variables are held until
# the frame's next event, as long as CPython's own tracing holds them (each
# event refreshes the frame's f_locals); a heap object is remembered by the
# ids and types of what it showed, and only the numbers and strings among
# them are held, so an id is never another number's.

_parts = []           # every frame, variable, heap object, property and output list, by index, as JSON text
_heap_cache = {}      # id(obj) -> what the last step drew of it, for the objects it drew
_output_parts = None  # (_output_count, stdout part, console part) of the last step
_stdout_last = None   # (part, how many lines, whether the last was open) of the last stdout list
_console_last = None  # (part, how many lines) of the last console list
_console_lines = []   # (key, part) of each console line

def _part(obj):
    _parts.append(_encode(obj))
    return len(_parts) - 1

def _enqueue(v, visited, pending):
    k = id(v)
    if k not in visited:
        visited.add(k)
        pending.append(v)

def _draw_frame(frame_info, top, return_value, has_return, visited, pending, return_name=None):
    # A frame as a part, its variables read from the frame as it is (#80).
    kind = frame_info["kind"]
    if kind == "function" and not top and not frame_info["stale"] and not frame_info["cells"] and "part" in frame_info:
        # A function frame below the top that hasn't run since it was drawn
        # shows the same variables: only a closure, through a cell, could
        # change them.
        for v in frame_info["heap_values"]:
            _enqueue(v, visited, pending)
        return frame_info["part"]
    frame_info["stale"] = False
    local_vars = _frame_locals(frame_info["frame"])
    old = frame_info.get("variable_parts") or {}
    # A function frame's values are held until the frame's next event, as
    # CPython's tracing holds them; the module's and a class body's aren't:
    # their variables are compared by what they show.
    holds = kind == "function"
    cache = {}
    parts = []
    closure_parts = []
    heap_values = []
    # The variables a closure reads from the function around it are its
    # closure variables (#82), apart from its own; a comprehension's (a frame
    # PyTutor gives it) aren't shown, they are the frame below's.
    free = frame_info["free"]
    for name in _shown_names(frame_info, local_vars):
        is_free = name in free
        if is_free and frame_info["comprehension"]:
            continue
        val = dict.__getitem__(local_vars, name)
        hit = old.get(name)
        if holds:
            if hit is not None and hit[0] is val:
                p = hit[1]
            else:
                p = _part({"name": name, "value": _serialize_value(val)})
            cache[name] = (val, p)
        else:
            value = _serialize_value(val)
            # (A string by its object, length and hash, not its text encoded again each step, #84.)
            key = value["heapId"] if value["type"] == "ref" else (id(val), str.__len__(val), str.__hash__(val)) if type(val) is str else _encode(value)
            if hit is not None and hit[0] == key:
                p = hit[1]
            else:
                p = _part({"name": name, "value": value})
            cache[name] = (key, p)
        (closure_parts if is_free else parts).append(p)
        if not _is_primitive(val):
            heap_values.append(val)
    if has_return:
        parts.append(_part({"name": return_name, "value": _serialize_value(return_value)}))
        if not _is_primitive(return_value):
            heap_values.append(return_value)
    frame_info["variable_parts"] = cache
    frame_info["heap_values"] = heap_values if holds else None
    if parts != frame_info.get("parts") or closure_parts != frame_info.get("closure_parts"):
        frame_info["parts"] = parts
        frame_info["closure_parts"] = closure_parts
        frame = {"name": frame_info["name"], "variables": parts}
        if closure_parts:
            frame["closureVars"] = closure_parts
        frame_info["part"] = _part(frame)
    for v in heap_values:
        _enqueue(v, visited, pending)
    return frame_info["part"]

def _drop_stale(frame_info):
    # CPython's tracing read the frame's variables again for an event the
    # tracer takes no step at (an exception passing through): the tracer stops
    # holding what the frame has dropped since its last step.
    old = frame_info.get("variable_parts")
    if old and frame_info["kind"] == "function":
        local_vars = _frame_locals(frame_info["frame"])
        frame_info["variable_parts"] = {n: e for n, e in old.items() if local_vars.get(n, _MISSING) is e[0]}
        frame_info["heap_values"] = None
        frame_info["stale"] = True

def _new_entry(obj, t, kind, seq, meta, ids, tids, types, old):
    # A heap object drawn again: the properties that show the same objects as
    # the last step's are its parts, the others new.
    object_type, label, spec = _heap_build(obj, t, kind, seq, meta)
    old_props = old[7] if old is not None and old[0] == id(t) else {}
    props = []
    sigs = {}
    children = []
    for key_text, vi, ki in spec:
        if vi is None:
            # A "more" marker (#81): ki is its value.
            sig = (key_text, ki["display"])
            p = old_props.get(sig)
            if p is None:
                p = _part({"key": key_text, "value": ki})
            sigs[sig] = p
            props.append(p)
            continue
        sig = (key_text, ids[vi], tids[vi]) if ki is None else (key_text, ids[vi], tids[vi], ids[ki], tids[ki])
        p = old_props.get(sig)
        if p is None:
            prop = {"key": key_text, "value": _serialize_value(seq[vi])}
            if ki is not None:
                prop["keyValue"] = _serialize_value(seq[ki])
            p = _part(prop)
        sigs[sig] = p
        props.append(p)
        if not _is_primitive_type(types[vi]):
            children.append(vi)
        if ki is not None:
            children.append(ki)
    if old is not None and old[8] == props and old[9] == object_type and old[10] == label:
        part = old[5]
    else:
        heap_object = {"id": _get_heap_id(obj), "objectType": object_type, "properties": props}
        if label:
            heap_object["label"] = label
        part = _part(heap_object)
    # The numbers and strings it shows are held until the next step, so their
    # ids stay theirs: an entry that shows the same ids shows the same values.
    # One that shows nothing else holds them all and is compared by identity
    # (its ids None).
    if _PRIMITIVE_TYPES.issuperset(types):
        return (id(t), meta, None, tids, seq, part, children, sigs, props, object_type, label)
    held = list(_compress(seq, map(_is_primitive_type, types)))
    return (id(t), meta, ids, tids, held, part, children, sigs, props, object_type, label)

def _draw_heap_object(obj, visited, pending, cache):
    # A heap object as a part: the last step's while it shows the same objects
    # (by id and type, its numbers and strings held) and the same meta. One
    # that shows only numbers and strings (a grid's row, a dict of counts) is
    # compared by identity with what it held, in one pass (#84).
    t = type(obj)
    kind = _BUILTIN_KINDS.get(t) or _kind(t)
    seq, meta = _heap_read(obj, t, kind)
    obj_id = id(obj)
    entry = _heap_cache.get(obj_id)
    if entry is not None and entry[0] == id(t) and entry[1] == meta:
        if entry[2] is None:
            held = entry[4]
            if len(held) == len(seq) and all(map(_is, seq, held)):
                cache[obj_id] = entry
                return entry[5]
            types = list(map(type, seq))
        else:
            types = list(map(type, seq))
            ids = list(map(id, seq))
            tids = list(map(id, types))
            if entry[2] == ids and entry[3] == tids:
                cache[obj_id] = entry
                for i in entry[6]:
                    _enqueue(seq[i], visited, pending)
                return entry[5]
    else:
        types = list(map(type, seq))
    entry = _new_entry(obj, t, kind, seq, meta, list(map(id, seq)), list(map(id, types)), types, entry)
    cache[obj_id] = entry
    for i in entry[6]:
        _enqueue(seq[i], visited, pending)
    return entry[5]

def _check_budgets():
    # The run stops with its steps before the worker's kill: at the time
    # budget, or the work budget the CPython suite sets instead.
    if _WORK_BUDGET is not None and _work > _WORK_BUDGET:
        _stop("work")
    if _now() - _start_time > _TIME_BUDGET:
        _stop("time")

def _capture_snapshot(line, return_value=None, has_return=False, column_range=None, condition=None, return_name=None, exception=None):
    """Capture a full execution snapshot at the given line."""
    global _step_counter, _heap_cache, _work

    if _step_counter >= _MAX_SNAPSHOTS:
        return
    _check_budgets()

    visited = set()
    pending = []

    # Every frame, the innermost with its return value when it returns.
    top = len(_call_stack) - 1
    stack = []
    for i, frame_info in enumerate(_call_stack):
        if i == top:
            stack.append(_draw_frame(frame_info, True, return_value, has_return, visited, pending, return_name or _RETURN_NAME))
        else:
            stack.append(_draw_frame(frame_info, False, None, False, visited, pending))
    _work += _STEP_WORK + len(stack)

    # The heap objects the frames reach, each once, from the queue.
    cache = {}
    heap_objects = []
    next_object = 0
    while next_object < len(pending):
        obj = pending[next_object]
        next_object += 1
        heap_objects.append(_draw_heap_object(obj, visited, pending, cache))
        if next_object % 1024 == 0:
            _work += 1024 * _OBJECT_WORK
            _check_budgets()
    _work += (next_object % 1024) * _OBJECT_WORK
    _heap_cache = cache

    snapshot = {
        "step": _step_counter,
        "line": line,
        "callStack": stack,
        "heap": heap_objects,
    }
    _with_output(snapshot)
    if column_range and column_range[0] is not None and column_range[1] is not None:
        snapshot["columnRange"] = {"startCol": column_range[0], "endCol": column_range[1]}
    if condition:
        snapshot["condition"] = condition
    if exception is not None:
        snapshot["exception"] = exception

    _snapshots.append(snapshot)
    _step_counter += 1

# ── Trace function ──

# The value a frame hands back as it leaves: what it returns, or yields (#80).
_RETURN_NAME = 'return \\u21b5'
_YIELD_NAME = 'yield \\u21b5'

def _raised_here(frame, tb):
    # Whether an exception event's frame is where the program's code first
    # saw the exception: no other frame of the program's in its traceback
    # (it was raised here, or in a library function called from here). A for
    # loop ending at an iterator's StopIteration gets the iterator's
    # traceback, without the loop's own frame.
    while tb is not None:
        if tb.tb_frame is not frame and tb.tb_frame.f_code.co_filename == _USER_FILE:
            return False
        tb = tb.tb_next
    return True

_LABEL_LIMIT = 200

def _exception_label(e):
    # An exception as a traceback's last line names it ('ValueError: bad
    # value'), without running the program's code: its own __str__ isn't
    # called, nor a library's on arguments that aren't plain values.
    t = type(e)
    name = _type_name(t)
    try:
        args = BaseException.__dict__['args'].__get__(e)
    except Exception:
        args = ()
    str_owner = next((c for c in _type_mro(t) if '__str__' in _type_dict(c)), BaseException)
    text = None
    if all(_is_primitive(a) for a in args) and not _is_program_class(str_owner):
        try:
            text = str(e)
        except Exception:
            text = None
    if text is None:
        if len(args) == 1:
            text = args[0] if type(args[0]) is str else _safe_repr(args[0])
        else:
            text = _safe_repr(tuple(args)) if args else ''
    if len(text) > _LABEL_LIMIT:
        text = text[:_LABEL_LIMIT] + '\u2026'
    return name + ': ' + text if text else name

# Display names of the comprehensions' frames: theirs (see _CompWrapper), and
# a generator expression's, which CPython calls <genexpr>.
_COMP_DISPLAY_NAMES = {
    '<listcomp>': 'list comprehension',
    '<dictcomp>': 'dict comprehension',
    '<setcomp>': 'set comprehension',
    '<genexpr>': 'generator expression',
}

# Frames whose code is an expression, not statements: they run on whatever
# lines the expression spans.
_EXPRESSION_FRAMES = frozenset({'<lambda>', '<genexpr>'})

def _tracer(frame, event, arg):
    if _stop_reason is not None:
        return None
    # A new frame past the program's recursion limit: CPython's RecursionError.
    if event == 'call' and _depth(frame) - _base > _limit:
        _refused.add(frame)
        _setprofile(_retrace)
        raise RecursionError('maximum recursion depth exceeded')
    if frame in _refused:
        return None
    try:
        result = _trace_event(frame, event, arg)
    except _TutorStop:
        raise
    except BaseException:
        # The tracer failed, not the program: its steps so far, and an engine error.
        _internal_failure()
    if _program_trace is not None or _program_local:
        return _chain(frame, event, arg, result)
    return result

def _trace_event(frame, event, arg):
    global _events

    # Only trace user code
    code = frame.f_code
    if code.co_filename != _USER_FILE:
        return None

    fname = code.co_name

    # Stop the program at the step cap or the time budget, instead of letting
    # it run on unrecorded until the worker is killed.
    if _step_counter >= _MAX_SNAPSHOTS:
        _stop("steps")
    _events += 1
    if _events % 1024 == 0 and _now() - _start_time > _TIME_BUDGET:
        _stop("time")

    if event == 'call':
        if _call_stack:
            # The caller ran since its last step (x = 5; y = f(x) on one line):
            # its variables are read again (#80).
            _call_stack[-1]["stale"] = True
        # Each frame is drawn from the frame itself, its variables read as they
        # are at each step (#78, #80): the module's are its globals.
        frame_info = {"name": _COMP_DISPLAY_NAMES.get(fname, fname), "kind": _frame_kind(code), "frame": frame,
                      "cells": bool(code.co_cellvars or code.co_freevars), "stale": False,
                      "free": frozenset(code.co_freevars), "comprehension": _is_comprehension(code)}
        if frame_info["kind"] == "class":
            # What the class's namespace started with, before its body ran.
            frame_info["base"] = dict(_frame_locals(frame))
        _call_stack.append(frame_info)
        # A function's entry is a step, with its parameters; a comprehension's
        # frame first shows with its first iteration's variables.
        if fname != '<module>' and not _is_comprehension(code):
            _capture_snapshot(frame.f_lineno)
        return _tracer

    elif event == 'exception':
        # An exception is passing through this frame. If the frame doesn't
        # handle it, its 'return' event is the frame unwinding, not a return.
        _raised_at[frame] = frame.f_lasti
        if _call_stack and _call_stack[-1]["frame"] is frame:
            exc = arg[1]
            if _raised_here(frame, arg[2]) and not issubclass(type(exc), SystemExit):
                # Where the program's code raised it (or called what did): a
                # step, with the exception (#80), as pythontutor.com takes one.
                _capture_snapshot(frame.f_lineno, exception=_exception_label(exc))
            else:
                _drop_stale(_call_stack[-1])
        return _tracer

    elif event == 'line':
        _raised_at.pop(frame, None)  # the frame handled the exception and goes on
        line = frame.f_lineno
        frame_info = _call_stack[-1] if _call_stack and _call_stack[-1]["frame"] is frame else None
        if _is_comprehension(code):
            # Nothing to show before the first iteration binds a variable (a
            # comprehension's lines before it, #80); then one step per
            # iteration, on whichever of its lines it is (they aren't a
            # statement's continuation lines here).
            if frame_info is not None and not frame_info.get("started"):
                # Its own variables, not the ones it reads from the frame around it.
                local_vars = _frame_locals(frame)
                if not any(name in local_vars for name in code.co_varnames[code.co_argcount:] + code.co_cellvars):
                    return _tracer
                frame_info["started"] = True
        elif line in _continuation_lines and fname not in _EXPRESSION_FRAMES:
            # Skip continuation lines of multi-line statements (no visible
            # changes), in the frame the statement runs in: a lambda's or
            # generator expression's frame written inside it has only those lines.
            if frame_info is not None:
                frame_info["continued"] = _continuation_lines[line]
            return _tracer
        elif frame_info is not None and frame_info.get("continued") is not None:
            # Back at its statement's first line from the statement's other
            # lines (the call after its arguments' lines): the same step.
            back = frame_info["continued"] == line
            frame_info["continued"] = None
            if back:
                return _tracer

        if _call_stack:
            _capture_snapshot(line)
        return _tracer

    elif event == 'return':
        if not _returns(frame):
            # Leaving because of an exception: no "return ↵ None" step. The
            # last step stays where the exception was raised.
            _raised_at.pop(frame, None)
            if _call_stack:
                _call_stack.pop()
            return _tracer
        _raised_at.pop(frame, None)

        if _call_stack:
            if fname == '<module>':
                # Capture final state so stdout from the last line is visible
                _capture_snapshot(frame.f_lineno)
            elif _call_stack[-1]["kind"] == "class":
                # A class body's return value is Python's own (None, or the
                # cell super() uses): the step shows the body done (#80).
                _capture_snapshot(frame.f_lineno)
            elif code.co_code[frame.f_lasti] == _YIELD_VALUE:
                if code.co_flags & _CO_AWAITING:
                    # A coroutine pausing at an await: what it hands its event loop isn't a value of the program's.
                    _capture_snapshot(frame.f_lineno)
                else:
                    _capture_snapshot(frame.f_lineno, return_value=arg, has_return=True, return_name=_YIELD_NAME)
            else:
                _capture_snapshot(frame.f_lineno, return_value=arg, has_return=True)
            _call_stack.pop()
        return _tracer

    return _tracer

# ── Entry point ──

def _exception_text(e):
    text = str(e)
    return f"{type(e).__name__}: {text}" if text else type(e).__name__

def _user_line(e):
    """The line of the innermost frame of the user's code in an exception's traceback."""
    tb = e.__traceback__
    line = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == _USER_FILE and tb.tb_frame not in _refused:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line

# ── Tracebacks and syntax errors as CPython prints them (#40) ──

# The file the tracer's own code runs from (Pyodide's <exec>): its frames are
# never the program's.
_TRACER_FILE = _getframe().f_code.co_filename

def _program_stack(te, e, seen):
    # A TracebackException's frames as python main.py has them, for e and the
    # exceptions chained to it: without the tracer's frames or a frame refused
    # for the recursion limit (it never ran), and with PyTutor's comprehension
    # frames folded into the frame around them, where CPython 3.12 runs a
    # comprehension inlined (that frame's line and carets are the
    # comprehension's).
    if te is None or e is None or id(e) in seen:
        return
    seen.add(id(e))
    frames = [f for f, _ in _traceback.walk_tb(e.__traceback__)]
    if len(frames) == len(te.stack):
        kept = []
        for summary, f in zip(te.stack, frames):
            code = f.f_code
            if code.co_filename == _TRACER_FILE or f in _refused:
                continue
            if code.co_filename == _USER_FILE and _is_comprehension(code):
                if kept and kept[-1].filename == _USER_FILE:
                    outer = kept[-1]
                    kept[-1] = _traceback.FrameSummary(
                        outer.filename, summary.lineno, outer.name, lookup_line=False,
                        end_lineno=summary.end_lineno, colno=summary.colno, end_colno=summary.end_colno)
                continue
            kept.append(summary)
        te.stack = _traceback.StackSummary.from_list(kept)
    _program_stack(te.__cause__, e.__cause__, seen)
    _program_stack(te.__context__, e.__context__, seen)
    for sub_te, sub_e in zip(te.exceptions or (), getattr(e, 'exceptions', None) or ()):
        _program_stack(sub_te, sub_e, seen)

def _traceback_text(e):
    """What python main.py prints for an uncaught exception: CPython's own
    traceback (chained exceptions, carets, repeated lines folded), of the
    program's frames."""
    te = _traceback.TracebackException(type(e), e, e.__traceback__, compact=True)
    _program_stack(te, e, set())
    return ''.join(te.format()).rstrip(chr(10))

def _compile_error(e, source_code):
    # A program CPython rejects: nothing ran, and the console shows what
    # python main.py prints (warnings first), the editor marks the line.
    error = {"kind": "compile", "message": f"{type(e).__name__}: {getattr(e, 'msg', None) or e}"}
    if isinstance(e, SyntaxError) and e.text is None and e.lineno:
        # An error only the compiler finds ('return' outside function) has no
        # source text from compile(); python main.py reads it from the file.
        source_lines = source_code.splitlines(True)
        if 1 <= e.lineno <= len(source_lines):
            e.text = source_lines[e.lineno - 1]
    shown = ''.join(_traceback.format_exception_only(type(e), e))
    if _console:
        shown = chr(10).join(t for st, t, rs in _console) + chr(10) + shown
    error["stderr"] = shown.rstrip(chr(10))
    line = getattr(e, 'lineno', None)
    if line:
        error["line"] = line
        error["lines"] = [line]
    return error

def run_traced(source_code, stdin_text=''):
    global _snapshots, _call_stack, _heap_map, _heap_counter, _step_counter, _continuation_lines, _module_order, _source_words
    global _stop_reason, _start_time, _events, _raised_at, _work
    global _out_lines, _console, _console_live, _console_open, _stderr_used, _stdin_used, _output_count, _output_seen
    global _parts, _heap_cache, _output_parts, _stdout_last, _console_last, _console_lines, _kinds, _slots_of
    global _limit, _base, _refused, _program_trace, _program_local
    _stop_reason = None
    _start_time = _now()
    _events = 0
    _work = 0
    _raised_at = {}
    _refused = set()
    _limit = _DEFAULT_LIMIT
    _program_trace = None
    _program_local = {}
    _snapshots = []
    _out_lines = ['']
    _console = []
    _console_live = False
    _console_open = False
    _stderr_used = False
    _stdin_used = False
    _output_count = 0
    _output_seen = 0
    _parts = []
    _heap_cache = {}
    _kinds = {}
    _slots_of = {}
    _output_parts = None
    _stdout_last = None
    _console_last = None
    _console_lines = []
    _call_stack = []
    _heap_map = {}
    _heap_counter = 0
    _step_counter = 0
    _continuation_lines = {}
    _module_order = {}
    _source_words = frozenset(_re.findall(r'[A-Za-z_][A-Za-z0-9_]*', source_code))

    # Pre-scan source for multi-line statements
    _scan_continuation_lines(source_code)

    # The program's module, as python main.py has it (#77): a module named
    # __main__ in sys.modules (where unittest.main(), doctest.testmod() and
    # pickle look), its names only, the builtins module as __builtins__ (so a
    # program that replaces builtins.len calls its own len, and a variable
    # named list or max is the program's, #34), __file__, sys.argv, and the
    # source as main.py in the working directory.
    main_module = _main_module()
    namespace = main_module.__dict__
    if sys.platform == 'emscripten':
        # In Pyodide's file system, a fresh one each run (#35); never a real
        # one (the behavior-comparison tests run the tracer in CPython).
        try:
            with open(_USER_FILE, 'w', encoding='utf-8') as f:
                f.write(source_code)
        except OSError:
            pass

    # The source, for tracebacks, warnings and traceback.print_exc(), as CPython has main.py's.
    _linecache.cache[_USER_FILE] = (len(source_code), None, source_code.splitlines(True), _USER_FILE)

    # The streams are the program's from compiling on (a SyntaxWarning is
    # output), and the tracer's again once it ends. Each line typed in the
    # stdin panel ends with Enter, the last one too.
    if stdin_text and not stdin_text.endswith(chr(10)):
        stdin_text += chr(10)
    saved_streams = (sys.stdin, sys.stdout, sys.stderr, sys.__stdin__, sys.__stdout__, sys.__stderr__)
    sys.stdin = sys.__stdin__ = _TutorStdin(stdin_text)
    sys.stdout = sys.__stdout__ = _output_stream('stdout', 'strict')
    sys.stderr = sys.__stderr__ = _output_stream('stderr', 'backslashreplace')
    saved_sys_functions = (sys.getrecursionlimit, sys.setrecursionlimit, sys.settrace, sys.gettrace)
    saved_main = (sys.modules.get('__main__'), sys.argv, sys.path)
    sys.modules['__main__'] = main_module
    sys.argv = [_USER_FILE]
    # The working directory (main.py's) first, once: a restored interpreter lists it twice.
    sys.path = list(dict.fromkeys(sys.path))
    try:
        try:
            code = _compile_program(source_code)
        except (SyntaxError, ValueError) as e:
            # Nothing ran: no steps, and a compile error (#40).
            return _json_dumps({"type": "result", "parts": [], "snapshots": [], "error": _compile_error(e, source_code)}, separators=(',', ':'))

        # A run that ends early (an uncaught exception, the step or time limit)
        # still returns its steps, with the reason in "error".
        error = None
        # The program's module frame is depth 1 (see _depth).
        _base = _depth(_getframe())
        sys.getrecursionlimit = _getrecursionlimit
        sys.setrecursionlimit = _setrecursionlimit
        sys.settrace = _program_settrace
        sys.gettrace = _program_gettrace
        _real_setlimit(_limit + _base + _HEADROOM)
        # The tracer's own garbage (its setup's) isn't the program's to collect.
        _gc_collect()
        _settrace(_tracer)
        try:
            exec(code, namespace)
            _settrace(None)
            _finish_output()
        except _TutorStop:
            pass
        except SystemExit as e:
            # sys.exit() ends the program; as CPython ends, a code that isn't
            # None or an int is printed to stderr.
            _settrace(None)
            if e.code is not None and not isinstance(e.code, int):
                sys.stderr.write(str(e.code) + chr(10))
            _finish_output()
        except BaseException as e:
            # Any other exception the program raised is its own, KeyboardInterrupt
            # and BaseException subclasses included, as CPython reports them.
            _settrace(None)
            error = {"kind": "exception", "message": _exception_text(e), "stderr": _traceback_text(e)}
            line = _user_line(e)
            if line is not None:
                error["line"] = line
            _finish_output()
        finally:
            _settrace(None)
            _setprofile(None)
    finally:
        sys.stdin, sys.stdout, sys.stderr, sys.__stdin__, sys.__stdout__, sys.__stderr__ = saved_streams
        sys.getrecursionlimit, sys.setrecursionlimit, sys.settrace, sys.gettrace = saved_sys_functions
        sys.modules['__main__'], sys.argv, sys.path = saved_main
        _real_setlimit(_DEFAULT_LIMIT)

    if _stop_reason == "steps":
        error = {"kind": "limit", "message": f"Stopped after {_MAX_SNAPSHOTS} steps, the most that can be shown. Your code may contain an infinite loop."}
    elif _stop_reason == "time":
        error = {"kind": "limit", "message": f"Stopped after {_TIME_BUDGET:g} seconds, the longest a program can run here."}
    elif _stop_reason == "work":
        error = {"kind": "limit", "message": f"Stopped after {_WORK_BUDGET} units of work, the most a program can do here."}
    elif _stop_reason == "internal":
        error = {"kind": "error", "message": _INTERNAL_ERROR}
        if _snapshots:
            error["line"] = _snapshots[-1]["line"]
    # Each part once, the steps referring to them by index (run.ts decodes it).
    result = '{"type":"result","parts":[' + ','.join(_parts) + '],"snapshots":' + _encode(_snapshots)
    if error is not None:
        result += ',"error":' + _encode(error)
    # Nothing of the program's is kept after the run.
    _heap_cache = {}
    _call_stack = []
    _program_local = {}
    _parts = []
    return result + '}'
`;
}
