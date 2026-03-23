import { describe, it, expect } from 'vitest';
import { getTracerCode } from '../tracer';

const code = getTracerCode();

describe('getTracerCode', () => {
  it('returns a non-empty string', () => {
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
  });

  // ── Required Python imports ──

  it('imports sys for settrace', () => {
    expect(code).toContain('import sys');
  });

  it('imports json for serialization', () => {
    expect(code).toContain('import json');
  });

  it('imports math for float handling', () => {
    expect(code).toContain('import math');
  });

  // ── Entry point ──

  it('defines run_traced function', () => {
    expect(code).toContain('def run_traced(source_code):');
  });

  it('run_traced resets all global state', () => {
    expect(code).toContain('_snapshots = []');
    expect(code).toContain('_stdout_lines = []');
    expect(code).toContain('_call_stack = []');
    expect(code).toContain('_heap_map = {}');
    expect(code).toContain('_heap_counter = 0');
    expect(code).toContain('_step_counter = 0');
  });

  it('returns JSON from run_traced', () => {
    expect(code).toContain('return json.dumps({"type": "result", "snapshots": _snapshots})');
    expect(code).toContain('return json.dumps(result)');
  });

  // ── Trace function ──

  it('defines the trace function', () => {
    expect(code).toContain('def _tracer(frame, event, arg):');
  });

  it('registers sys.settrace', () => {
    expect(code).toContain('sys.settrace(_tracer)');
  });

  it('unregisters sys.settrace in finally block', () => {
    expect(code).toContain('sys.settrace(None)');
  });

  it('handles call events', () => {
    expect(code).toContain("if event == 'call':");
  });

  it('handles line events', () => {
    expect(code).toContain("elif event == 'line':");
  });

  it('handles return events', () => {
    expect(code).toContain("elif event == 'return':");
  });

  it('only traces user code via filename check', () => {
    expect(code).toContain("frame.f_code.co_filename != '<exec>'");
  });

  // ── Serialization ──

  it('defines value serializer', () => {
    expect(code).toContain('def _serialize_value(val, heap_objects, visited):');
  });

  it('defines heap object serializer', () => {
    expect(code).toContain('def _serialize_heap_object(obj, heap_id, heap_objects, visited):');
  });

  it('handles None serialization', () => {
    expect(code).toContain('if val is None:');
    expect(code).toContain('return {"type": "null", "value": None}');
  });

  it('handles bool serialization before int (bool is subclass of int)', () => {
    // Must check True/False BEFORE isinstance(val, int)
    const trueCheck = code.indexOf('if val is True:');
    const intCheck = code.indexOf('if isinstance(val, int):');
    expect(trueCheck).toBeGreaterThan(-1);
    expect(intCheck).toBeGreaterThan(-1);
    expect(trueCheck).toBeLessThan(intCheck);
  });

  it('handles float edge cases (inf, nan)', () => {
    expect(code).toContain('math.isinf(val)');
    expect(code).toContain('math.isnan(val)');
    expect(code).toContain('"Infinity"');
    expect(code).toContain('"-Infinity"');
    expect(code).toContain('"NaN"');
  });

  it('handles string serialization', () => {
    expect(code).toContain('if isinstance(val, str):');
    expect(code).toContain('return {"type": "string", "value": val}');
  });

  it('handles complex number serialization as string', () => {
    expect(code).toContain('if isinstance(val, complex):');
  });

  // ── Heap object types ──

  it('serializes lists with objectType "list"', () => {
    expect(code).toContain('if isinstance(obj, list):');
    expect(code).toContain('object_type = "list"');
  });

  it('serializes tuples with objectType "tuple"', () => {
    expect(code).toContain('isinstance(obj, tuple)');
    expect(code).toContain('object_type = "tuple"');
  });

  it('serializes dicts with objectType "dict"', () => {
    expect(code).toContain('isinstance(obj, dict)');
    expect(code).toContain('object_type = "dict"');
  });

  it('serializes sets with objectType "set"', () => {
    expect(code).toContain('isinstance(obj, (set, frozenset))');
    expect(code).toContain('object_type = "set"');
  });

  it('serializes callables with objectType "function"', () => {
    expect(code).toContain('callable(obj)');
    expect(code).toContain('object_type = "function"');
  });

  it('serializes class instances with class name as label', () => {
    expect(code).toContain("label = type(obj).__name__");
  });

  // ── Limits ──

  it('enforces max snapshot limit of 5000', () => {
    expect(code).toContain('_MAX_SNAPSHOTS = 5000');
    expect(code).toContain('if _step_counter >= _MAX_SNAPSHOTS:');
  });

  it('enforces max sequence property limit of 100', () => {
    expect(code).toContain('_MAX_SEQ_PROPS = 100');
  });

  it('enforces max dict property limit of 50', () => {
    expect(code).toContain('_MAX_DICT_PROPS = 50');
  });

  // ── Stdout capture ──

  it('defines print capture function', () => {
    expect(code).toContain('def _capture_print(*args, **kwargs):');
  });

  it('overrides print in execution namespace', () => {
    expect(code).toContain("namespace['print'] = _capture_print");
  });

  it('captures print output into _stdout_lines', () => {
    expect(code).toContain('_stdout_lines.append(text)');
  });

  // ── Security: sandboxed builtins ──

  it('removes dangerous builtins from namespace', () => {
    const dangerousBuiltins = ['open', 'exec', 'eval', 'compile', 'exit', 'quit', 'breakpoint', 'input'];
    for (const name of dangerousBuiltins) {
      expect(code).toContain(`'${name}'`);
    }
  });

  it('installs safe import function', () => {
    expect(code).toContain('def _safe_import(name, *args, **kwargs):');
    expect(code).toContain("namespace['__import__'] = _safe_import");
  });

  it('defines a safe modules whitelist', () => {
    expect(code).toContain('_SAFE_MODULES = frozenset(');
    // Verify core safe modules are listed
    const safeModules = ['math', 'random', 'collections', 'itertools', 'functools', 'json', 're', 'datetime', 'copy'];
    for (const mod of safeModules) {
      expect(code, `safe module: ${mod}`).toContain(`'${mod}'`);
    }
  });

  it('safe import rejects disallowed modules', () => {
    expect(code).toContain("raise ImportError");
    expect(code).toContain("is not allowed in PyTutor");
  });

  // ── Variable filtering ──

  it('snapshots baseline namespace keys before user code runs', () => {
    expect(code).toContain('_baseline_keys = set(namespace.keys())');
  });

  it('filters baseline keys from module-level variable display', () => {
    expect(code).toContain('name in _baseline_keys');
  });

  it('filters dunder variables from snapshots', () => {
    expect(code).toContain("name.startswith('__') and name.endswith('__')");
  });

  // ── Comprehension filtering ──

  it('skips comprehension frames', () => {
    expect(code).toContain("'<listcomp>'");
    expect(code).toContain("'<dictcomp>'");
    expect(code).toContain("'<setcomp>'");
    expect(code).toContain("'<genexpr>'");
  });

  // ── Error handling ──

  it('catches exceptions during execution', () => {
    expect(code).toContain('except Exception as e:');
  });

  it('extracts line numbers from traceback', () => {
    expect(code).toContain("tb.tb_frame.f_code.co_filename == '<exec>'");
    expect(code).toContain('err_line = tb.tb_lineno');
  });

  it('returns error type with class name and message', () => {
    expect(code).toContain('type(e).__name__');
  });

  // ── Snapshot structure ──

  it('builds snapshots with required fields', () => {
    expect(code).toContain('"step": _step_counter');
    expect(code).toContain('"line": line');
    expect(code).toContain('"callStack": stack');
    expect(code).toContain('"heap": heap_objects');
    expect(code).toContain('"stdout": list(_stdout_lines)');
  });

  it('includes return value in snapshots', () => {
    expect(code).toContain('return \\u21b5');
  });

  // ── Call stack management ──

  it('pushes module frame on module call event', () => {
    expect(code).toContain('_call_stack.append({"name": "<module>"');
  });

  it('pushes named frame on function call event', () => {
    expect(code).toContain('_call_stack.append({"name": fname');
  });

  it('pops frame on return event', () => {
    expect(code).toContain('_call_stack.pop()');
  });

  // ── Heap identity tracking ──

  it('defines heap ID assignment function', () => {
    expect(code).toContain('def _get_heap_id(obj):');
  });

  it('uses Python id() for object identity', () => {
    expect(code).toContain('obj_id = id(val)');
  });

  it('tracks visited objects to prevent circular serialization', () => {
    expect(code).toContain('if obj_id not in visited:');
    expect(code).toContain('visited.add(obj_id)');
  });

  // ── Compilation ──

  it('compiles user code with exec filename marker', () => {
    expect(code).toContain("compile(source_code, '<exec>', 'exec')");
  });

  it('sets __name__ to __main__ in execution namespace', () => {
    expect(code).toContain("namespace['__name__'] = '__main__'");
  });
});
