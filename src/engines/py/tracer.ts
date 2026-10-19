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
# Values serialized so far, and how many a run may serialize before it is
# stopped as out of time: None in the app. The CPython suite sets it (and turns
# the time budget off), so a slow run stops at the same step on any machine.
_work = 0
_WORK_BUDGET = None
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
    sys.settrace(None)
    raise _TutorStop()

# Set of namespace keys present BEFORE user code runs.
# Populated in run_traced(); used to filter out builtins and tracer internals.
_baseline_keys = set()

# Lines that are continuations of multi-line simple statements.
# These produce no visible variable changes, so we skip snapshots for them.
_continuation_lines = set()

# Modules allowed for import
_SAFE_MODULES = frozenset({
    'math', 'random', 'string', 'collections', 'itertools',
    'functools', 'operator', 'typing', 'dataclasses', 'enum',
    'json', 're', 'datetime', 'copy', 'heapq', 'bisect',
    'statistics', 'fractions', 'decimal', 'abc', 'textwrap',
})

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

def _console_shown():
    # every line with its stream (and its echoed input), once stderr or stdin was used
    if not (_stderr_used or _stdin_used):
        return None
    return [
        {"text": t, "stream": st, "input": [list(r) for r in rs]} if rs else {"text": t, "stream": st}
        for st, t, rs in _console
    ]

def _with_output(snapshot):
    # The output as it is now, on a step.
    global _output_seen
    _output_seen = _output_count
    snapshot["stdout"] = _stdout_shown()
    console = _console_shown()
    if console is not None:
        snapshot["console"] = console
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
    return frame.f_locals

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

def _get_heap_id(obj):
    global _heap_counter
    obj_id = id(obj)
    if obj_id in _heap_map:
        return _heap_map[obj_id]
    _heap_counter += 1
    heap_id = str(_heap_counter)
    _heap_map[obj_id] = heap_id
    return heap_id

def _serialize_value(val, heap_objects, visited):
    """Serialize a Python value to the snapshot PrimitiveValue or HeapRef format."""
    global _work
    _work += 1
    if val is None:
        return {"type": "null", "value": None}
    if val is True:
        return {"type": "boolean", "value": True}
    if val is False:
        return {"type": "boolean", "value": False}
    if isinstance(val, bool):
        # Should not reach here, but safety check
        return {"type": "boolean", "value": val}
    if isinstance(val, int):
        return {"type": "number", "value": val}
    if isinstance(val, float):
        if math.isinf(val):
            return {"type": "number", "value": "Infinity" if val > 0 else "-Infinity"}
        if math.isnan(val):
            return {"type": "number", "value": "NaN"}
        return {"type": "number", "value": val}
    if isinstance(val, str):
        return {"type": "string", "value": val}
    if isinstance(val, complex):
        return {"type": "string", "value": str(val)}

    # Heap objects: list, dict, tuple, set, function, class instances
    obj_id = id(val)
    heap_id = _get_heap_id(val)
    if obj_id not in visited and heap_id not in visited:
        visited.add(obj_id)
        visited.add(heap_id)
        heap_obj = _serialize_heap_object(val, heap_id, heap_objects, visited)
        heap_objects.append(heap_obj)
    return {"type": "ref", "heapId": heap_id}

def _serialize_heap_object(obj, heap_id, heap_objects, visited):
    """Serialize a Python object to a HeapObject dict."""
    properties = []
    object_type = "object"
    label = ""

    if isinstance(obj, list):
        object_type = "list"
        for i in range(min(len(obj), _MAX_SEQ_PROPS)):
            properties.append({
                "key": str(i),
                "value": _serialize_value(obj[i], heap_objects, visited)
            })
    elif isinstance(obj, tuple):
        object_type = "tuple"
        for i in range(min(len(obj), _MAX_SEQ_PROPS)):
            properties.append({
                "key": str(i),
                "value": _serialize_value(obj[i], heap_objects, visited)
            })
    elif isinstance(obj, dict):
        object_type = "dict"
        count = 0
        for k, v in obj.items():
            if count >= _MAX_DICT_PROPS:
                break
            properties.append({
                "key": str(k),
                "value": _serialize_value(v, heap_objects, visited)
            })
            count += 1
    elif isinstance(obj, (set, frozenset)):
        object_type = "set"
        count = 0
        for item in obj:
            if count >= _MAX_SEQ_PROPS:
                break
            properties.append({
                "key": str(count),
                "value": _serialize_value(item, heap_objects, visited)
            })
            count += 1
    elif callable(obj):
        object_type = "function"
        label = getattr(obj, '__name__', '') or getattr(obj, '__qualname__', '')
    elif hasattr(obj, '__dict__') or hasattr(obj, '__slots__'):
        # Class instance. We iterate __dict__ directly (not via getattr) so
        # that user-defined @property descriptors and __getattr__ hooks are
        # NOT triggered during snapshot serialization (which could recurse
        # or raise).
        object_type = "object"
        label = type(obj).__name__
        count = 0
        if hasattr(obj, '__dict__'):
            for k, v in obj.__dict__.items():
                if count >= _MAX_DICT_PROPS:
                    break
                if not k.startswith('_'):
                    properties.append({
                        "key": k,
                        "value": _serialize_value(v, heap_objects, visited)
                    })
                    count += 1
        # __slots__-backed attributes. Slots are descriptor-backed by the
        # class — reading them does NOT invoke user __getattr__ / @property.
        # Wrap in try/except so a slot raising on read doesn't corrupt the
        # whole snapshot.
        slots = getattr(type(obj), '__slots__', None) or getattr(obj, '__slots__', None)
        if slots:
            slot_names = [slots] if isinstance(slots, str) else slots
            for slot_name in slot_names:
                if count >= _MAX_DICT_PROPS:
                    break
                if not isinstance(slot_name, str) or slot_name.startswith('_'):
                    continue
                try:
                    sval = getattr(obj, slot_name)
                except AttributeError:
                    continue  # uninitialized slot
                except Exception:
                    properties.append({"key": slot_name, "value": {"type": "string", "value": "<error>"}})
                    count += 1
                    continue
                properties.append({
                    "key": slot_name,
                    "value": _serialize_value(sval, heap_objects, visited)
                })
                count += 1

    result = {"id": heap_id, "objectType": object_type, "properties": properties}
    if label:
        result["label"] = label
    return result

# ── Call stack + snapshot building ──

def _capture_snapshot(line, current_locals, return_value=None, has_return=False, column_range=None, condition=None):
    """Capture a full execution snapshot at the given line."""
    global _step_counter

    if _step_counter >= _MAX_SNAPSHOTS:
        return
    if _WORK_BUDGET is not None and _work > _WORK_BUDGET:
        _stop("work")

    heap_objects = []
    visited = set()

    # Build call stack with serialized variables
    stack = []
    for i, frame_info in enumerate(_call_stack):
        variables = []
        local_vars = current_locals if i == len(_call_stack) - 1 else frame_info.get("locals", {})

        for name in sorted(local_vars.keys()):
            # For the module frame, skip everything that was in the
            # namespace before user code started (builtins, tracer
            # internals, etc.). For function frames, f_locals only
            # contains the function's own locals so no filtering needed.
            if frame_info["name"] == "<module>" and name in _baseline_keys:
                continue
            if name.startswith('__') and name.endswith('__'):
                continue
            # Skip CPython internal positional args (a comprehension's or generator expression's iterable)
            if name.startswith('.'):
                continue
            val = local_vars[name]
            serialized = _serialize_value(val, heap_objects, visited)
            variables.append({"name": name, "value": serialized})

        # Add return value display
        if has_return and i == len(_call_stack) - 1:
            ret_serialized = _serialize_value(return_value, heap_objects, visited)
            variables.append({"name": "return \\u21b5", "value": ret_serialized})

        frame_dict = {"name": frame_info["name"], "variables": variables}
        stack.append(frame_dict)

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

_SKIP_FRAME_NAMES = frozenset({
    '_safe_import',
})

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
    global _events

    if _stop_reason is not None:
        return None

    # Only trace user code
    code = frame.f_code
    if code.co_filename != _USER_FILE:
        return None

    fname = code.co_name
    if fname in _SKIP_FRAME_NAMES:
        return None

    # Stop the program at the step cap or the time budget, instead of letting
    # it run on unrecorded until the worker is killed.
    if _step_counter >= _MAX_SNAPSHOTS:
        _stop("steps")
    _events += 1
    if _events % 1024 == 0 and time.time() - _start_time > _TIME_BUDGET:
        _stop("time")

    if event == 'call':
        if fname == '<module>':
            # The module's variables are its globals, read as they are at each step.
            _call_stack.append({"name": "<module>", "locals": frame.f_globals})
        else:
            display_name = _COMP_DISPLAY_NAMES.get(fname, fname)
            # Capture function parameters from f_locals at call time
            params = dict(_frame_locals(frame))
            _call_stack.append({"name": display_name, "locals": params})
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

# ── Safe import ──

def _safe_import(name, *args, **kwargs):
    top_level = name.split('.')[0]
    if top_level not in _SAFE_MODULES:
        raise ImportError(f"Import of '{name}' is not allowed in PyTutor")
    return __builtins__.__import__(name, *args, **kwargs)

# ── Entry point ──

def _exception_text(e):
    text = str(e)
    return f"{type(e).__name__}: {text}" if text else type(e).__name__

def _user_line(e):
    """The line of the innermost frame of the user's code in an exception's traceback."""
    tb = e.__traceback__
    line = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == _USER_FILE:
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
        if code.co_filename == _USER_FILE and not _is_comprehension(code):
            out.append(f'  File "main.py", line {tb.tb_lineno}, in {code.co_name}')
            if 1 <= tb.tb_lineno <= len(lines):
                out.append("    " + lines[tb.tb_lineno - 1].strip())
        tb = tb.tb_next
    out.append(_exception_text(e))
    return chr(10).join(out)

def run_traced(source_code, stdin_text=''):
    global _snapshots, _call_stack, _heap_map, _heap_counter, _step_counter, _baseline_keys, _continuation_lines
    global _stop_reason, _start_time, _events, _unwinding, _work
    global _out_lines, _console, _console_open, _stderr_used, _stdin_used, _output_count, _output_seen
    _stop_reason = None
    _start_time = time.time()
    _events = 0
    _work = 0
    _unwinding = set()
    _snapshots = []
    _out_lines = ['']
    _console = []
    _console_open = False
    _stderr_used = False
    _stdin_used = False
    _output_count = 0
    _output_seen = 0
    _call_stack = []
    _heap_map = {}
    _heap_counter = 0
    _step_counter = 0
    _continuation_lines = set()

    # Pre-scan source for multi-line statements
    _scan_continuation_lines(source_code)

    namespace = dict(__builtins__.__dict__) if hasattr(__builtins__, '__dict__') else dict(__builtins__)
    # Remove dangerous builtins
    for name in ('open', 'exec', 'eval', 'compile', 'exit', 'quit',
                 'breakpoint', 'help', 'input', '__import__'):
        namespace.pop(name, None)
    namespace['__import__'] = _safe_import
    namespace['__name__'] = '__main__'

    # Snapshot the namespace keys BEFORE user code runs so we can
    # filter them out of the module-level variable display later.
    _baseline_keys = set(namespace.keys())

    # The source, for tracebacks, warnings and traceback.print_exc(), as CPython has main.py's.
    _linecache.cache[_USER_FILE] = (len(source_code), None, source_code.splitlines(True), _USER_FILE)

    # The streams are the program's from compiling on (a SyntaxWarning is
    # output), and the tracer's again once it ends. Each line typed in the
    # stdin panel ends with Enter, the last one too.
    if stdin_text and not stdin_text.endswith(chr(10)):
        stdin_text += chr(10)
    saved_streams = (sys.stdin, sys.stdout, sys.stderr)
    sys.stdin = _TutorStdin(stdin_text)
    sys.stdout = _TutorStream('stdout', 'strict')
    sys.stderr = _TutorStream('stderr', 'backslashreplace')
    try:
        try:
            code = _compile_program(source_code)
        except (SyntaxError, ValueError) as e:
            # Nothing ran: report the syntax error and its line.
            result = {"type": "error", "message": f"{type(e).__name__}: {getattr(e, 'msg', None) or e}"}
            if getattr(e, 'lineno', None):
                result["line"] = e.lineno
            return json.dumps(result)

        # A run that ends early (an uncaught exception, the step or time limit)
        # still returns its steps, with the reason in "error".
        error = None
        sys.settrace(_tracer)
        try:
            exec(code, namespace)
        except _TutorStop:
            pass
        except SystemExit as e:
            # sys.exit() ends the program; as CPython ends, a code that isn't
            # None or an int is printed to stderr.
            sys.settrace(None)
            if e.code is not None and not isinstance(e.code, int):
                sys.stderr.write(str(e.code) + chr(10))
            _finish_output()
        except BaseException as e:
            # Any other exception the program raised is its own, KeyboardInterrupt
            # and BaseException subclasses included, as CPython reports them.
            sys.settrace(None)
            error = {"kind": "exception", "message": _exception_text(e), "stderr": _traceback_text(e, source_code)}
            line = _user_line(e)
            if line is not None:
                error["line"] = line
            _finish_output()
        finally:
            sys.settrace(None)
    finally:
        sys.stdin, sys.stdout, sys.stderr = saved_streams

    if _stop_reason == "steps":
        error = {"kind": "limit", "message": f"Stopped after {_MAX_SNAPSHOTS} steps, the most that can be shown. Your code may contain an infinite loop."}
    elif _stop_reason == "time":
        error = {"kind": "limit", "message": f"Stopped after {_TIME_BUDGET:g} seconds, the longest a program can run here."}
    elif _stop_reason == "work":
        error = {"kind": "limit", "message": f"Stopped after drawing {_WORK_BUDGET} values, the most a program can draw here."}
    result = {"type": "result", "snapshots": _snapshots}
    if error is not None:
        result["error"] = error
    return json.dumps(result)
`;
}
