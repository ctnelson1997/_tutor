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
import re as _re
import enum as _enum

# The tracer's own builtins and library functions (#34): a program that
# replaces builtins.len, json.dumps or sys.settrace doesn't change what the
# tracer calls. (The program runs in a namespace of its own.)
globals().update({_k: _v for _k, _v in vars(_builtins).items() if not _k.startswith('_')})
_json_dumps = json.dumps
_isinf = math.isinf
_isnan = math.isnan
_now = time.time
_settrace = sys.settrace
_setprofile = sys.setprofile
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
_unwinding = set()    # frames an exception is propagating out of

# The instructions a frame returns (or yields) at. A 'return' event anywhere
# else is the frame unwinding: an exception leaving it, perhaps after a
# finally block or an inlined comprehension's cleanup ran (whose line events
# end _unwinding's mark) and re-raised it.
_RETURN_OPS = frozenset(_dis.opmap[name] for name in ('RETURN_VALUE', 'RETURN_CONST', 'YIELD_VALUE') if name in _dis.opmap)

def _returns(frame):
    return frame not in _unwinding and frame.f_code.co_code[frame.f_lasti] in _RETURN_OPS

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

# Lines that are continuations of multi-line simple statements.
# These produce no visible variable changes, so we skip snapshots for them.
_continuation_lines = set()

# The program's file name, as CPython names it in tracebacks and warnings.
_USER_FILE = 'main.py'

# ── Output: captured at the streams (#31) ──
#
# While the program runs, sys.stdout and sys.stderr are _TutorStreams, so the
# real print (end, sep, file), sys.stdout.write, input()'s prompt, warnings,
# traceback.print_exc() and contextlib.redirect_stdout all work as in CPython
# run unbuffered (python -u). Each step shows stdout's lines, and once stderr
# has been used, every line with its stream (a line belongs to the stream that
# wrote its first characters).

_out_lines = ['']       # stdout split on newlines; the last entry is the open line
_console = []           # every line as [stream, text, input ranges or None], in program order
_console_open = False   # the last line of _console has no newline yet
_stderr_used = False
_stdin_used = False
_output_count = 0       # writes and echoes so far
_output_seen = 0        # ... when the last step was taken

def _console_add(stream, s, echo):
    # Adds s to the console's lines; an echo marks its characters as input.
    global _console_open, _output_count
    _output_count += 1
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
    global _stderr_used
    if stream == 'stderr':
        _stderr_used = True
    if stream == 'stdout':
        parts = s.split('\\n')
        _out_lines[-1] += parts[0]
        _out_lines.extend(parts[1:])
    _console_add(stream, s, False)

def _echo(s):
    # What the program read from stdin shows on the console, marked as input,
    # where a terminal shows what was typed: after input()'s prompt (#32). It
    # isn't the program's output, so stdout doesn't hold it.
    global _stdin_used
    _stdin_used = True
    _console_add('stdout', s, True)

class _TutorStream(_io.TextIOBase):
    # sys.stdout or sys.stderr while the program runs: a text stream that records what is written.

    def __init__(self, stream, errors):
        self._stream = stream
        self._errors = errors

    @property
    def encoding(self):
        return 'utf-8'

    @property
    def errors(self):
        return self._errors

    @property
    def name(self):
        return '<' + self._stream + '>'

    @property
    def mode(self):
        return 'w'

    def writable(self):
        return True

    def isatty(self):
        return False

    def write(self, s):
        if not isinstance(s, str):
            raise TypeError('write() argument must be str, not ' + type(s).__name__)
        if self.closed:
            raise ValueError('I/O operation on closed file.')
        if self._errors == 'strict':
            s.encode('utf-8')  # what CPython's stdout can't encode raises here too
        _write(self._stream, s)
        return len(s)

    def __repr__(self):
        return "<_io.TextIOWrapper name='<" + self._stream + ">' mode='w' encoding='utf-8'>"

class _TutorStdin(_io.TextIOBase):
    # sys.stdin while the program runs: the input typed in the stdin panel
    # (#32). input() writes its prompt to sys.stdout and reads a line here, as
    # CPython does when stdin isn't a terminal; at the end, EOFError. What is
    # read is echoed on the console.

    def __init__(self, text):
        self._text = text
        self._pos = 0

    @property
    def encoding(self):
        return 'utf-8'

    @property
    def errors(self):
        return 'strict'

    @property
    def name(self):
        return '<stdin>'

    @property
    def mode(self):
        return 'r'

    def readable(self):
        return True

    def isatty(self):
        return False

    def _take(self, n):
        if self.closed:
            raise ValueError('I/O operation on closed file.')
        end = len(self._text) if n is None or n < 0 else min(len(self._text), self._pos + n)
        s = self._text[self._pos:end]
        self._pos = end
        if s:
            _echo(s)
        return s

    def read(self, size=-1):
        return self._take(size)

    def readline(self, size=-1):
        newline = self._text.find(chr(10), self._pos)
        n = (len(self._text) if newline < 0 else newline + 1) - self._pos
        if size is not None and size >= 0:
            n = min(n, size)
        return self._take(n)

    def __repr__(self):
        return "<_io.TextIOWrapper name='<stdin>' mode='r' encoding='utf-8'>"

def _stdout_shown():
    # stdout's lines, without the empty line after a final newline
    return _out_lines[:-1] if _out_lines[-1] == '' else list(_out_lines)

def _console_line_parts():
    # Every console line as a part (its stream, text and echoed input), once
    # stderr or stdin was used. Only the last line can have changed since the
    # last call: the ones before it are finished.
    if not (_stderr_used or _stdin_used):
        return None
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
    return [e[1] for e in _console_lines]

def _lines_part(lines, last):
    # A list of lines as a part: the previous list's first lines and the ones
    # added since, when it grew (run.ts builds the whole list).
    if last is None:
        return _part({"add": lines})
    before = last[1]
    keep = len(before)
    if keep and (keep > len(lines) or before[keep - 1] != lines[keep - 1]):
        keep -= 1
    if keep > len(lines) or before[:keep] != lines[:keep]:
        return _part({"add": lines})
    return _part({"base": last[0], "keep": keep, "add": lines[keep:]})

def _with_output(snapshot):
    # The output as it is now, on a step: the same parts as the last step's
    # while nothing was written (#39).
    global _output_seen, _output_parts, _stdout_last, _console_last
    _output_seen = _output_count
    if _output_parts is None or _output_parts[0] != _output_count:
        lines = _stdout_shown()
        stdout = _lines_part(lines, _stdout_last)
        _stdout_last = (stdout, lines)
        console = _console_line_parts()
        if console is not None:
            part = _lines_part(console, _console_last)
            _console_last = (part, console)
            console = part
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
    # The program's code with its comprehensions in frames of their own.
    # SyntaxErrors are compile()'s for the source as written.
    tree = _ast.parse(source_code, _USER_FILE)
    try:
        return _name_comprehensions(compile(_CompWrapper().visit(tree), _USER_FILE, 'exec'))
    except SyntaxError:
        return compile(source_code, _USER_FILE, 'exec')

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
    _continuation_lines = set()
    try:
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
                        _continuation_lines.add(ln)

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

def _get_heap_id(obj):
    global _heap_counter
    obj_id = id(obj)
    if obj_id in _heap_map:
        return _heap_map[obj_id]
    _heap_counter += 1
    heap_id = str(_heap_counter)
    _heap_map[obj_id] = heap_id
    return heap_id

def _digits(v):
    v = abs(v)
    n = int(v.bit_length() * 0.30102999566398) + 1
    while n > 1 and 10 ** (n - 1) > v:
        n -= 1
    return n

def _int_value(val):
    # An int as Python writes it (#37): a JSON number while JavaScript holds it
    # exactly, else its digits as text (a JSON number would lose them).
    val = int.__int__(val)
    if -_EXACT_INT <= val <= _EXACT_INT:
        return {"type": "number", "value": val}
    try:
        text = int.__repr__(val)
    except ValueError:
        # Past Python's limit for converting an int to text: shown by its size.
        text = '<int with %d digits>' % _digits(val)
    return {"type": "number", "value": text, "display": text}

def _serialize_value(val):
    # A value as the snapshot shows it: a primitive inline, a heap object as a
    # reference to it.
    global _work
    _work += _VALUE_WORK
    # Values carry the text Python writes for them (display, #37): None, True,
    # False, a float's repr (5.0, -0.0, 1e+16, inf), an int past what JavaScript
    # holds exactly, a complex number's repr.
    if val is None:
        return {"type": "null", "value": None, "display": "None"}
    if val is True:
        return {"type": "boolean", "value": True, "display": "True"}
    if val is False:
        return {"type": "boolean", "value": False, "display": "False"}
    t = type(val)
    if issubclass(t, int):
        return _int_value(val)
    if issubclass(t, float):
        f = float.__float__(val)
        text = float.__repr__(f)
        if _isinf(f):
            return {"type": "number", "value": "Infinity" if f > 0 else "-Infinity", "display": text}
        if _isnan(f):
            return {"type": "number", "value": "NaN", "display": text}
        return {"type": "number", "value": f, "display": text}
    if issubclass(t, str):
        return {"type": "string", "value": str.__str__(val)}
    if issubclass(t, complex):
        text = complex.__repr__(val)
        return {"type": "number", "value": text, "display": text}

    # Heap objects: list, dict, tuple, set, function, class instances
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
    if issubclass(type(k), str):
        return str.__str__(k)
    return _safe_repr(k)

def _is_primitive(v):
    return v is None or issubclass(type(v), (bool, int, float, str, complex))

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

def _slot_descriptors(t):
    # (name, member descriptor, class) for the __slots__ of the Python classes
    # in t's MRO, found once per class.
    found = _slots_of.get(t)
    if found is None:
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
        _slots_of[t] = found
    return found

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
# How each type's objects are drawn, in the order they are tried.
_KIND_TYPES = (
    ("list", list), ("tuple", tuple), ("dict", dict), ("set", (set, frozenset)),
    ("function", _FUNCTION_TYPES), ("method", _METHOD_WRAPPERS), ("class", type),
    ("module", _types.ModuleType), ("enum", _Enum),
)
_kinds = {}           # type -> its kind, for this run
_slots_of = {}        # type -> its slots' descriptors, for this run

def _kind(t):
    # How a type's objects are drawn, found once per type.
    kind = _kinds.get(t)
    if kind is None:
        for kind, types in _KIND_TYPES:
            if issubclass(t, types):
                break
        else:
            kind = "instance"
        _kinds[t] = kind
    return kind

def _heap_contents(obj, t):
    # What a heap object shows: (object type, label, keys, values, key
    # objects), the key objects a list of a dict's keys that are drawn as
    # arrows (None in other objects and for primitive keys).
    kind = _kind(t)
    if kind == "instance":
        # An instance: its __dict__ and its __slots__, as stored.
        keys, values = [], []
        d = _object_dict(obj)
        if d is not None:
            for k, v in dict.items(d):
                if len(keys) >= _MAX_DICT_PROPS:
                    break
                if type(k) is str and _instance_attribute_shown(k):
                    keys.append(k)
                    values.append(v)
        if _slot_descriptors(t):
            for name, v in _slot_values(obj):
                if len(keys) >= _MAX_DICT_PROPS:
                    break
                if _instance_attribute_shown(name):
                    keys.append(name)
                    values.append(v)
        return "object", _type_name(t), keys, values, None
    if kind == "list":
        values = list.__getitem__(obj, slice(0, _MAX_SEQ_PROPS))
        return "list", "", _INDEX_KEYS[:len(values)], values, None
    if kind == "tuple":
        values = list(tuple.__getitem__(obj, slice(0, _MAX_SEQ_PROPS)))
        return "tuple", "", _INDEX_KEYS[:len(values)], values, None
    if kind == "dict":
        keys, values, key_objects = [], [], []
        drawn = False
        for k, v in dict.items(obj):
            if len(keys) >= _MAX_DICT_PROPS:
                break
            keys.append(_key_text(k))
            values.append(v)
            if _is_primitive(k):
                key_objects.append(None)
            else:
                # An object key is drawn as a value: an arrow to it.
                key_objects.append(k)
                drawn = True
        return "dict", "", keys, values, key_objects if drawn else None
    if kind == "set":
        items = set.__iter__(obj) if issubclass(t, set) else frozenset.__iter__(obj)
        values = []
        for item in items:
            if len(values) >= _MAX_SEQ_PROPS:
                break
            values.append(item)
        return "set", "", _INDEX_KEYS[:len(values)], values, None
    if kind == "function":
        return "function", _safe_name(obj), [], [], None
    if kind == "method":
        # A staticmethod, classmethod or property in a class: drawn as its function.
        f = _wrapped_function(obj)
        decorator = 'staticmethod' if issubclass(t, staticmethod) else 'classmethod' if issubclass(t, classmethod) else 'property'
        return "function", '@' + decorator + ' ' + (_safe_name(f) if f is not None else ''), [], [], None
    if kind == "class":
        # A class (#38): one the program defined with its bases, the methods it
        # wrote and its class attributes; a library's by its name only.
        label = _type_name(obj)
        keys, values = [], []
        if _is_program_class(obj):
            bases = [b for b in _type_bases(obj) if b is not object]
            if bases:
                label += '(' + ', '.join(_type_name(b) for b in bases) + ')'
            for k, v in _type_dict(obj).items():
                if len(keys) >= _MAX_DICT_PROPS:
                    break
                if type(k) is str and _class_attribute_shown(k, v):
                    keys.append(k)
                    values.append(v)
        return "class", label, keys, values, None
    if kind == "module":
        # A module is one object, by its name, never drawn in full (#38).
        return "module", _safe_name(obj), [], [], None
    # An Enum member, as Python names it, with its value.
    d = _object_dict(obj) or {}
    member = d.get('_name_')
    label = _type_name(t) + ('.' + member if type(member) is str else '')
    if '_value_' in d:
        return "object", label, ["value"], [d['_value_']], None
    return "object", label, [], [], None

# ── Recording steps (#39) ──
#
# A step shows every frame and every object they reach, but costs what
# changed since the step before: each frame, variable, heap object and
# property is a part (_part), made once and used again by every later step
# that shows it unchanged, which identity checks find (a variable bound to the
# same object, a list holding the same objects). The reply is the parts and
# the steps referring to them by index; run.ts rebuilds the steps with those
# parts shared, so the worker's postMessage (a structured clone) carries each
# once. What a cache entry holds stays alive (a value replaced since the last
# step), so an id in it is never another object's.

_parts = []           # every frame, variable, heap object, property and output list, by index
_heap_cache = {}      # id(obj) -> what the last step drew of it, for the objects it drew
_output_parts = None  # (_output_count, stdout part, console part) of the last step
_stdout_last = None   # (part, lines) of the last stdout list
_console_last = None  # (part, line parts) of the last console list
_console_lines = []   # (key, part) of each console line

def _part(obj):
    _parts.append(obj)
    return len(_parts) - 1

def _enqueue(v, visited, pending):
    k = id(v)
    if k not in visited:
        visited.add(k)
        pending.append(v)

def _draw_frame(frame_info, local_vars, live, return_value, has_return, visited, pending):
    # A frame as a part. A frame below the top shows the variables it had at
    # its last line (a copy): the same part while that copy is the same.
    if not live and frame_info.get("drawn_from") is local_vars:
        for v in frame_info["heap_values"]:
            _enqueue(v, visited, pending)
        return frame_info["part"]
    old = frame_info.get("variable_parts") or {}
    cache = {}
    parts = []
    heap_values = []
    for name in _shown_names(frame_info, local_vars):
        val = dict.__getitem__(local_vars, name)
        hit = old.get(name)
        if hit is not None and hit[0] is val:
            p = hit[1]
        else:
            p = _part({"name": name, "value": _serialize_value(val)})
        cache[name] = (val, p)
        parts.append(p)
        if not _is_primitive(val):
            heap_values.append(val)
    frame_info["variable_parts"] = cache
    if has_return:
        parts.append(_part({"name": "return \\u21b5", "value": _serialize_value(return_value)}))
        if not _is_primitive(return_value):
            heap_values.append(return_value)
    if parts != frame_info.get("parts"):
        frame_info["parts"] = parts
        frame_info["part"] = _part({"name": frame_info["name"], "variables": parts})
    frame_info["drawn_from"] = None if has_return else local_vars
    frame_info["heap_values"] = heap_values
    for v in heap_values:
        _enqueue(v, visited, pending)
    return frame_info["part"]

def _draw_heap_object(obj, visited, pending, cache):
    # A heap object as a part: the last step's while it shows the same
    # objects; else its properties that did, with the ones that changed.
    t = type(obj)
    object_type, label, keys, values, key_objects = _heap_contents(obj, t)
    ids = list(map(id, values))
    key_ids = None if key_objects is None else list(map(id, key_objects))
    obj_id = id(obj)
    entry = _heap_cache.get(obj_id)
    if entry is not None and entry[0] is t and entry[1] == object_type and entry[2] == label and entry[3] == keys and entry[5] == ids and entry[7] == key_ids:
        # values and key_objects as this step read them, so they stay alive
        entry = (t, object_type, label, keys, values, ids, key_objects, key_ids, entry[8], entry[9], entry[10])
    else:
        old_props = None
        if entry is not None and entry[0] is t:
            old_props = entry
        props = []
        children = []
        for i in range(len(keys)):
            v = values[i]
            ko = None if key_objects is None else key_objects[i]
            if (old_props is not None and i < len(old_props[3]) and old_props[3][i] == keys[i] and old_props[5][i] == ids[i]
                    and (old_props[7][i] if old_props[7] is not None else None) == (None if ko is None else key_ids[i])):
                props.append(old_props[8][i])
            else:
                prop = {"key": keys[i], "value": _serialize_value(v)}
                if ko is not None:
                    prop["keyValue"] = _serialize_value(ko)
                props.append(_part(prop))
            if not _is_primitive(v):
                children.append(v)
            if ko is not None:
                children.append(ko)
        if entry is not None and entry[8] == props and entry[1] == object_type and entry[2] == label:
            part = entry[9]
        else:
            heap_object = {"id": _get_heap_id(obj), "objectType": object_type, "properties": props}
            if label:
                heap_object["label"] = label
            part = _part(heap_object)
        entry = (t, object_type, label, keys, values, ids, key_objects, key_ids, props, part, children)
    cache[obj_id] = entry
    for c in entry[10]:
        _enqueue(c, visited, pending)
    return entry[9]

def _check_budgets():
    # The run stops with its steps before the worker's kill: at the time
    # budget, or the work budget the CPython suite sets instead.
    if _WORK_BUDGET is not None and _work > _WORK_BUDGET:
        _stop("work")
    if _now() - _start_time > _TIME_BUDGET:
        _stop("time")

def _capture_snapshot(line, current_locals, return_value=None, has_return=False, column_range=None, condition=None):
    """Capture a full execution snapshot at the given line."""
    global _step_counter, _heap_cache, _work

    if _step_counter >= _MAX_SNAPSHOTS:
        return
    _check_budgets()

    visited = set()
    pending = []

    # Every frame, the innermost with its live variables (and its return value).
    top = len(_call_stack) - 1
    stack = []
    for i, frame_info in enumerate(_call_stack):
        if i == top:
            stack.append(_draw_frame(frame_info, current_locals, True, return_value, has_return, visited, pending))
        else:
            stack.append(_draw_frame(frame_info, frame_info.get("locals", {}), frame_info["kind"] == "module", None, False, visited, pending))
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

    _snapshots.append(snapshot)
    _step_counter += 1

# ── Trace function ──

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
        return _trace_event(frame, event, arg)
    except _TutorStop:
        raise
    except BaseException:
        # The tracer failed, not the program: its steps so far, and an engine error.
        _internal_failure()

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
        if fname == '<module>':
            # The module's variables are its globals, read as they are at each step.
            _call_stack.append({"name": "<module>", "locals": frame.f_globals, "kind": "module"})
        else:
            display_name = _COMP_DISPLAY_NAMES.get(fname, fname)
            # Capture function parameters from f_locals at call time
            params = dict(_frame_locals(frame))
            frame_info = {"name": display_name, "locals": params, "kind": _frame_kind(code)}
            if frame_info["kind"] == "class":
                # What the class's namespace started with, before its body ran.
                frame_info["base"] = dict(params)
            _call_stack.append(frame_info)
            # A comprehension's frame first shows with its first iteration's variables.
            if not _is_comprehension(code):
                _capture_snapshot(frame.f_lineno, params)
        return _tracer

    elif event == 'exception':
        # An exception is passing through this frame. If the frame doesn't
        # handle it, its 'return' event is the frame unwinding, not a return.
        _unwinding.add(frame)
        return _tracer

    elif event == 'line':
        _unwinding.discard(frame)  # the frame handled the exception and goes on
        line = frame.f_lineno
        if _is_comprehension(code):
            # The first line event comes before the first iteration: nothing to
            # show yet. Then one per iteration, on whichever of the
            # comprehension's lines it is (they aren't a statement's
            # continuation lines here).
            if _call_stack and not _call_stack[-1].get("started"):
                _call_stack[-1]["started"] = True
                return _tracer
        elif line in _continuation_lines and fname not in _EXPRESSION_FRAMES:
            # Skip continuation lines of multi-line statements (no visible
            # changes), in the frame the statement runs in: a lambda's or
            # generator expression's frame written inside it has only those lines.
            return _tracer

        if _call_stack:
            # Update stored locals for the current frame (the module's are its live globals)
            local_vars = _frame_locals(frame)
            _call_stack[-1]["locals"] = local_vars if fname == '<module>' else dict(local_vars)
            _capture_snapshot(line, local_vars)
        return _tracer

    elif event == 'return':
        if not _returns(frame):
            # Leaving because of an exception: no "return ↵ None" step. The
            # last step stays where the exception was raised.
            _unwinding.discard(frame)
            if _call_stack:
                _call_stack.pop()
            return _tracer

        if _call_stack:
            local_vars = _frame_locals(frame)
            if fname == '<module>':
                # Capture final state so stdout from the last line is visible
                _capture_snapshot(frame.f_lineno, local_vars)
            else:
                _capture_snapshot(frame.f_lineno, local_vars, return_value=arg, has_return=True)
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

def _traceback_text(e, source_code):
    """What Python prints for an uncaught exception, limited to the user's own code."""
    lines = source_code.splitlines()
    out = ["Traceback (most recent call last):"]
    tb = e.__traceback__
    while tb is not None:
        code = tb.tb_frame.f_code
        if code.co_filename == _USER_FILE and not _is_comprehension(code) and tb.tb_frame not in _refused:
            out.append(f'  File "main.py", line {tb.tb_lineno}, in {code.co_name}')
            if 1 <= tb.tb_lineno <= len(lines):
                out.append("    " + lines[tb.tb_lineno - 1].strip())
        tb = tb.tb_next
    out.append(_exception_text(e))
    return chr(10).join(out)

def run_traced(source_code, stdin_text=''):
    global _snapshots, _call_stack, _heap_map, _heap_counter, _step_counter, _continuation_lines, _module_order, _source_words
    global _stop_reason, _start_time, _events, _unwinding, _work
    global _out_lines, _console, _console_open, _stderr_used, _stdin_used, _output_count, _output_seen
    global _parts, _heap_cache, _output_parts, _stdout_last, _console_last, _console_lines, _kinds, _slots_of
    global _limit, _base, _refused
    _stop_reason = None
    _start_time = _now()
    _events = 0
    _work = 0
    _unwinding = set()
    _refused = set()
    _limit = _DEFAULT_LIMIT
    _snapshots = []
    _out_lines = ['']
    _console = []
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
    _continuation_lines = set()
    _module_order = {}
    _source_words = frozenset(_re.findall(r'[A-Za-z_][A-Za-z0-9_]*', source_code))

    # Pre-scan source for multi-line statements
    _scan_continuation_lines(source_code)

    # The program's module namespace, as CPython has main.py's: its names
    # only, the builtins found through the builtins module (exec adds
    # __builtins__), so a program that replaces builtins.len calls its own len
    # and a variable named list or max is the program's (#34).
    namespace = {'__name__': '__main__'}

    # The source, for tracebacks, warnings and traceback.print_exc(), as CPython has main.py's.
    _linecache.cache[_USER_FILE] = (len(source_code), None, source_code.splitlines(True), _USER_FILE)

    # The streams are the program's from compiling on (a SyntaxWarning is
    # output), and the tracer's again once it ends. Each line typed in the
    # stdin panel ends with Enter, the last one too.
    if stdin_text and not stdin_text.endswith(chr(10)):
        stdin_text += chr(10)
    saved_streams = (sys.stdin, sys.stdout, sys.stderr, sys.__stdin__, sys.__stdout__, sys.__stderr__)
    sys.stdin = sys.__stdin__ = _TutorStdin(stdin_text)
    sys.stdout = sys.__stdout__ = _TutorStream('stdout', 'strict')
    sys.stderr = sys.__stderr__ = _TutorStream('stderr', 'backslashreplace')
    saved_limit_functions = (sys.getrecursionlimit, sys.setrecursionlimit)
    try:
        try:
            code = _compile_program(source_code)
        except (SyntaxError, ValueError) as e:
            # Nothing ran: report the syntax error and its line.
            result = {"type": "error", "message": f"{type(e).__name__}: {getattr(e, 'msg', None) or e}"}
            if getattr(e, 'lineno', None):
                result["line"] = e.lineno
            return _json_dumps(result)

        # A run that ends early (an uncaught exception, the step or time limit)
        # still returns its steps, with the reason in "error".
        error = None
        # The program's module frame is depth 1 (see _depth).
        _base = _depth(_getframe())
        sys.getrecursionlimit = _getrecursionlimit
        sys.setrecursionlimit = _setrecursionlimit
        _real_setlimit(_limit + _base + _HEADROOM)
        _settrace(_tracer)
        try:
            exec(code, namespace)
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
            error = {"kind": "exception", "message": _exception_text(e), "stderr": _traceback_text(e, source_code)}
            line = _user_line(e)
            if line is not None:
                error["line"] = line
            _finish_output()
        finally:
            _settrace(None)
            _setprofile(None)
    finally:
        sys.stdin, sys.stdout, sys.stderr, sys.__stdin__, sys.__stdout__, sys.__stderr__ = saved_streams
        sys.getrecursionlimit, sys.setrecursionlimit = saved_limit_functions
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
    result = {"type": "result", "parts": _parts, "snapshots": _snapshots}
    if error is not None:
        result["error"] = error
    _heap_cache = {}
    return _json_dumps(result, separators=(',', ':'))
`;
}
