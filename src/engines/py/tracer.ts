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
import json
import math
import ast as _ast

# ══════════════════════════════════════
# PyTutor Tracer
# ══════════════════════════════════════

_snapshots = []
_stdout_lines = []
_call_stack = []  # list of frame dicts
_heap_map = {}    # id(obj) -> heap_id string
_heap_counter = 0
_step_counter = 0
_MAX_SNAPSHOTS = 5000
_MAX_SEQ_PROPS = 100
_MAX_DICT_PROPS = 50

# Set of namespace keys present BEFORE user code runs.
# Populated in run_traced(); used to filter out builtins and tracer internals.
_baseline_keys = set()

# Comprehension info populated by AST scan before execution.
# Maps line number -> dict with target_vars, display_name, elt_code, etc.
_comp_info = {}

# Tracks the currently active synthetic comprehension frame (or None).
_active_comp = None

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

# ── Print capture ──

_original_print = print

def _capture_print(*args, **kwargs):
    sep = kwargs.get('sep', ' ')
    text = sep.join(str(a) for a in args)
    _stdout_lines.append(text)

# ── Comprehension detection (Python 3.12+ inlined comprehensions) ──

def _scan_comprehensions(source_code):
    """Pre-scan source with ast to find comprehension lines and their iteration variables."""
    global _comp_info
    _comp_info = {}
    try:
        tree = _ast.parse(source_code)
    except SyntaxError:
        return

    _type_names = {
        'ListComp': 'list comprehension',
        'SetComp': 'set comprehension',
        'DictComp': 'dict comprehension',
        'GeneratorExp': 'generator expression',
    }

    # First pass: collect comprehension info
    for node in _ast.walk(tree):
        type_name = type(node).__name__
        if type_name in _type_names:
            target_vars = set()
            for gen in node.generators:
                for n in _ast.walk(gen.target):
                    if isinstance(n, _ast.Name):
                        target_vars.add(n.id)

            # Compile element expression for eval during tracing
            elt_code = None
            elt_label = None
            try:
                if type_name == 'DictComp':
                    key_src = _ast.unparse(node.key)
                    val_src = _ast.unparse(node.value)
                    elt_label = key_src + ': ' + val_src
                    elt_code = compile('(' + key_src + ', ' + val_src + ')', '<comp>', 'eval')
                elif type_name != 'GeneratorExp':
                    elt_label = _ast.unparse(node.elt)
                    elt_code = compile(elt_label, '<comp>', 'eval')
            except Exception:
                pass

            # Compile filter conditions (if clauses)
            filter_codes = []
            filter_texts = []
            filter_ranges = []
            gen = node.generators[0]
            for if_clause in gen.ifs:
                try:
                    filter_codes.append(compile(_ast.unparse(if_clause), '<comp>', 'eval'))
                    filter_texts.append(_ast.unparse(if_clause))
                    filter_ranges.append((if_clause.col_offset, getattr(if_clause, 'end_col_offset', None)))
                except Exception:
                    pass

            # Column ranges for sub-line highlighting of comprehension phases
            iter_range = (gen.target.col_offset, getattr(gen.iter, 'end_col_offset', None))
            if type_name == 'DictComp':
                elt_range = (node.key.col_offset, getattr(node.value, 'end_col_offset', None))
            elif hasattr(node, 'elt'):
                elt_range = (node.elt.col_offset, getattr(node.elt, 'end_col_offset', None))
            else:
                elt_range = None

            _comp_info[node.lineno] = {
                'target_vars': target_vars,
                'display_name': _type_names[type_name],
                'comp_type': type_name,
                'result_var': None,
                'elt_code': elt_code,
                'elt_label': elt_label,
                'filter_codes': filter_codes,
                'filter_texts': filter_texts,
                'filter_ranges': filter_ranges,
                'iter_range': iter_range,
                'elt_range': elt_range,
            }

    # Second pass: find assignment targets for comprehensions
    # e.g. squares = [x*x for x in nums] -> result_var = 'squares'
    for node in _ast.walk(tree):
        if isinstance(node, _ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            value = node.value
            if isinstance(target, _ast.Name) and value.lineno in _comp_info:
                _comp_info[value.lineno]['result_var'] = target.id

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
    if obj_id not in visited:
        visited.add(obj_id)
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
    elif hasattr(obj, '__dict__'):
        # Class instance
        object_type = "object"
        label = type(obj).__name__
        count = 0
        for k, v in obj.__dict__.items():
            if count >= _MAX_DICT_PROPS:
                break
            if not k.startswith('_'):
                properties.append({
                    "key": k,
                    "value": _serialize_value(v, heap_objects, visited)
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
            # Skip CPython internal positional args (e.g. .0 iterator in comprehensions)
            if name.startswith('.'):
                continue
            # When inside a synthetic comprehension frame, split variables:
            # comp frame shows only iteration vars, enclosing frame hides them
            if _active_comp:
                is_comp_frame = frame_info.get("_is_comp", False)
                is_target = name in _active_comp['target_vars']
                if is_comp_frame and not is_target:
                    continue
                if not is_comp_frame and is_target:
                    continue
            val = local_vars[name]
            serialized = _serialize_value(val, heap_objects, visited)
            variables.append({"name": name, "value": serialized})

        # Show the partial result and current element in the comprehension frame
        if _active_comp and frame_info.get("_is_comp") and not has_return:
            # Show the collection being built (generic label — the variable
            # name like "squares" isn't assigned until the comp finishes)
            partial = _active_comp.get('partial_result')
            if partial is not None:
                partial_serialized = _serialize_value(partial, heap_objects, visited)
                variables.append({"name": "result", "value": partial_serialized})

            elt = _active_comp.get('current_elt')
            if elt is not None:
                elt_label = _active_comp.get('elt_label', 'element')
                elt_serialized = _serialize_value(elt, heap_objects, visited)
                variables.append({"name": "\\u2192 " + elt_label, "value": elt_serialized})

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
        "stdout": list(_stdout_lines),
    }
    if column_range and column_range[0] is not None and column_range[1] is not None:
        snapshot["columnRange"] = {"startCol": column_range[0], "endCol": column_range[1]}
    if condition:
        snapshot["condition"] = condition

    _snapshots.append(snapshot)
    _step_counter += 1

# ── Trace function ──

_SKIP_FRAME_NAMES = frozenset({
    '_capture_print', '_safe_import',
})

# Display name mapping for real comprehension frames (Python < 3.12).
# Python 3.12+ inlines comprehensions so these frame names no longer appear;
# synthetic frames are created instead via _comp_info from the AST scan.
_COMP_DISPLAY_NAMES = {
    '<listcomp>': 'list comprehension',
    '<dictcomp>': 'dict comprehension',
    '<setcomp>': 'set comprehension',
    '<genexpr>': 'generator expression',
}

def _pop_comp_frame(frame):
    """Pop the synthetic comprehension frame, capturing a return snapshot first."""
    global _active_comp
    comp_line = _active_comp.get('_line', frame.f_lineno)
    result_var = _active_comp.get('result_var')

    # Use our partial_result as the return value so the comp frame's
    # return snapshot shows the same collection that was building up.
    partial = _active_comp.get('partial_result')

    if partial is not None:
        _active_comp['current_elt'] = None
        # Sync enclosing frame locals so the return snapshot shows all variables
        if len(_call_stack) >= 2:
            _call_stack[-2]["locals"] = dict(frame.f_locals)
        _capture_snapshot(comp_line, frame.f_locals, return_value=partial, has_return=True)

    # Clean up our synthetic list's heap ID entry to prevent id() reuse
    # issues — once partial is GC'd, CPython can reuse its memory address
    # for a new object, which would incorrectly inherit the old heap ID.
    if partial is not None and id(partial) in _heap_map:
        del _heap_map[id(partial)]

    _call_stack.pop()
    _active_comp = None

def _tracer(frame, event, arg):
    global _active_comp

    # Only trace user code
    if frame.f_code.co_filename != '<user_code>':
        return None

    fname = frame.f_code.co_name
    if fname in _SKIP_FRAME_NAMES:
        return None

    if _step_counter >= _MAX_SNAPSHOTS:
        return None

    if event == 'call':
        if fname == '<module>':
            _call_stack.append({"name": "<module>", "locals": {}})
        else:
            display_name = _COMP_DISPLAY_NAMES.get(fname, fname)
            # Capture function parameters from f_locals at call time
            params = dict(frame.f_locals)
            _call_stack.append({"name": display_name, "locals": params})
            _capture_snapshot(frame.f_lineno, frame.f_locals)
        return _tracer

    elif event == 'line':
        line = frame.f_lineno
        comp = _comp_info.get(line)

        # Pop the synthetic comprehension frame when we leave its line
        # (whether moving to another comprehension or a regular line).
        if _active_comp and _active_comp.get('_line') != line:
            _pop_comp_frame(frame)

        if comp and _active_comp is None:
            # Entering a comprehension — push synthetic frame
            _active_comp = dict(comp)  # copy so we can add runtime state
            ct = comp.get('comp_type')
            _active_comp['partial_result'] = {} if ct == 'DictComp' else set() if ct == 'SetComp' else []
            _active_comp['current_elt'] = None
            _active_comp['_line'] = line
            _call_stack.append({
                "name": comp['display_name'],
                "locals": {},
                "_is_comp": True,
            })
            # Skip capture for the initial setup event (iteration var not set yet)
            return _tracer

        # If in a comprehension, emit phased snapshots for each iteration
        if _active_comp and _active_comp.get('elt_code'):
            iter_range = _active_comp.get('iter_range')
            elt_range = _active_comp.get('elt_range')
            filter_codes = _active_comp.get('filter_codes', [])
            filter_ranges = _active_comp.get('filter_ranges', [])
            filter_texts = _active_comp.get('filter_texts', [])

            # Clear previous element before showing new iteration
            _active_comp['current_elt'] = None

            # Update locals for both the comp frame and enclosing frame
            # (frame.f_locals is the real Python frame — the module scope —
            # since Python 3.12 inlines comprehensions)
            locals_copy = dict(frame.f_locals)
            if len(_call_stack) >= 2:
                _call_stack[-2]["locals"] = locals_copy
            if _call_stack:
                _call_stack[-1]["locals"] = locals_copy

            # Phase 1: Iteration snapshot — highlight the for clause
            _capture_snapshot(line, frame.f_locals, column_range=iter_range)

            # Phase 2: Filter evaluation (one snapshot per filter condition)
            passes_filter = True
            for i, fc in enumerate(filter_codes):
                try:
                    result = bool(eval(fc, frame.f_globals, frame.f_locals))
                except Exception:
                    result = False
                cond = {
                    "expression": filter_texts[i] if i < len(filter_texts) else "",
                    "result": result,
                    "line": line,
                }
                fr = filter_ranges[i] if i < len(filter_ranges) else None
                _capture_snapshot(line, frame.f_locals, column_range=fr, condition=cond)
                if not result:
                    passes_filter = False
                    break

            # Phase 3: Element evaluation (only if all filters passed)
            if passes_filter:
                try:
                    elt_val = eval(_active_comp['elt_code'], frame.f_globals, frame.f_locals)
                    pr = _active_comp['partial_result']
                    if isinstance(pr, dict):
                        pr[elt_val[0]] = elt_val[1]
                    elif isinstance(pr, set):
                        pr.add(elt_val)
                    else:
                        pr.append(elt_val)
                    _active_comp['current_elt'] = elt_val
                except Exception:
                    _active_comp['current_elt'] = None
                _capture_snapshot(line, frame.f_locals, column_range=elt_range)

            return _tracer

        # Skip continuation lines of multi-line statements (no visible changes)
        if line in _continuation_lines:
            return _tracer

        if _call_stack:
            # Update stored locals for the current frame
            _call_stack[-1]["locals"] = dict(frame.f_locals)
            _capture_snapshot(line, frame.f_locals)
        return _tracer

    elif event == 'return':
        # Clean up any active synthetic comprehension frame
        if _active_comp:
            _pop_comp_frame(frame)

        if _call_stack:
            if fname == '<module>':
                # Capture final state so stdout from the last line is visible
                _capture_snapshot(frame.f_lineno, frame.f_locals)
            else:
                _capture_snapshot(frame.f_lineno, frame.f_locals, return_value=arg, has_return=True)
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

def run_traced(source_code):
    global _snapshots, _stdout_lines, _call_stack, _heap_map, _heap_counter, _step_counter, _baseline_keys, _active_comp, _continuation_lines
    _snapshots = []
    _stdout_lines = []
    _call_stack = []
    _heap_map = {}
    _heap_counter = 0
    _step_counter = 0
    _active_comp = None
    _continuation_lines = set()

    # Pre-scan source for comprehensions and multi-line statements
    _scan_comprehensions(source_code)
    _scan_continuation_lines(source_code)

    namespace = dict(__builtins__.__dict__) if hasattr(__builtins__, '__dict__') else dict(__builtins__)
    # Remove dangerous builtins
    for name in ('open', 'exec', 'eval', 'compile', 'exit', 'quit',
                 'breakpoint', 'help', 'input', '__import__'):
        namespace.pop(name, None)
    namespace['__import__'] = _safe_import
    namespace['print'] = _capture_print
    namespace['__name__'] = '__main__'

    # Snapshot the namespace keys BEFORE user code runs so we can
    # filter them out of the module-level variable display later.
    _baseline_keys = set(namespace.keys())

    code = compile(source_code, '<user_code>', 'exec')

    sys.settrace(_tracer)
    try:
        exec(code, namespace)
    except Exception as e:
        sys.settrace(None)
        # Extract line number from traceback
        import traceback
        tb = e.__traceback__
        err_line = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == '<user_code>':
                err_line = tb.tb_lineno
            tb = tb.tb_next
        result = {"type": "error", "message": f"{type(e).__name__}: {str(e)}"}
        if err_line is not None:
            result["line"] = err_line
        return json.dumps(result)
    finally:
        sys.settrace(None)

    return json.dumps({"type": "result", "snapshots": _snapshots})
`;
}
