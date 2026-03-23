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

def _capture_snapshot(line, current_locals, return_value=None, has_return=False):
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
        "stdout": list(_stdout_lines),
    }

    _snapshots.append(snapshot)
    _step_counter += 1

# ── Trace function ──

_SKIP_FRAME_NAMES = frozenset({
    '<listcomp>', '<dictcomp>', '<setcomp>', '<genexpr>',
    '_capture_print', '_safe_import',
})

def _tracer(frame, event, arg):
    # Only trace user code
    if frame.f_code.co_filename != '<exec>':
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
            # Capture function parameters from f_locals at call time
            params = dict(frame.f_locals)
            _call_stack.append({"name": fname, "locals": params})
            _capture_snapshot(frame.f_lineno, frame.f_locals)
        return _tracer

    elif event == 'line':
        if _call_stack:
            # Update stored locals for the current frame
            _call_stack[-1]["locals"] = dict(frame.f_locals)
            _capture_snapshot(frame.f_lineno, frame.f_locals)
        return _tracer

    elif event == 'return':
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
    global _snapshots, _stdout_lines, _call_stack, _heap_map, _heap_counter, _step_counter, _baseline_keys
    _snapshots = []
    _stdout_lines = []
    _call_stack = []
    _heap_map = {}
    _heap_counter = 0
    _step_counter = 0

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

    code = compile(source_code, '<exec>', 'exec')

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
            if tb.tb_frame.f_code.co_filename == '<exec>':
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
