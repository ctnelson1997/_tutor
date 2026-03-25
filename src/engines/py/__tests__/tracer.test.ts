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

  it('imports ast for comprehension detection', () => {
    expect(code).toContain('import ast');
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
    expect(code).toContain('_active_comp = None');
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
    expect(code).toContain("frame.f_code.co_filename != '<user_code>'");
  });

  it('compiles user code with a distinct filename from the tracer', () => {
    // User code must use a different filename than what pyodide.runPython()
    // uses for the tracer module (which defaults to '<exec>'). Otherwise
    // internal tracer frames (e.g. genexpr inside _capture_print) would be
    // traced as if they were user code.
    expect(code).toContain("compile(source_code, '<user_code>', 'exec')");
    expect(code).not.toContain("compile(source_code, '<exec>', 'exec')");
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

  it('filters internal positional variables (e.g. .0 iterator)', () => {
    expect(code).toContain("name.startswith('.')");
  });

  // ── Comprehension tracing (Python 3.12+ inlined comprehensions) ──

  it('defines _scan_comprehensions to pre-scan source with ast', () => {
    expect(code).toContain('def _scan_comprehensions(source_code):');
    expect(code).toContain('_ast.parse(source_code)');
  });

  it('calls _scan_comprehensions before execution', () => {
    // Must be called in run_traced before exec()
    const scanCall = code.indexOf('_scan_comprehensions(source_code)');
    const execCall = code.indexOf('exec(code, namespace)');
    expect(scanCall).toBeGreaterThan(-1);
    expect(execCall).toBeGreaterThan(-1);
    expect(scanCall).toBeLessThan(execCall);
  });

  it('detects all four comprehension types via ast', () => {
    expect(code).toContain("'ListComp'");
    expect(code).toContain("'SetComp'");
    expect(code).toContain("'DictComp'");
    expect(code).toContain("'GeneratorExp'");
  });

  it('maps comprehension types to friendly display names', () => {
    expect(code).toContain("'list comprehension'");
    expect(code).toContain("'set comprehension'");
    expect(code).toContain("'dict comprehension'");
    expect(code).toContain("'generator expression'");
  });

  it('extracts iteration variable names from comprehension generators', () => {
    expect(code).toContain('node.generators');
    expect(code).toContain('gen.target');
    expect(code).toContain("target_vars.add(n.id)");
  });

  it('pushes synthetic comp frame on entering a comprehension line', () => {
    expect(code).toContain("_comp_info.get(line)");
    expect(code).toContain("_active_comp = comp");
    expect(code).toContain("'_is_comp': True");
  });

  it('pops synthetic comp frame on leaving a comprehension line', () => {
    expect(code).toContain('_active_comp and not comp');
    expect(code).toContain('_active_comp = None');
  });

  it('splits variables between comp frame and enclosing frame', () => {
    // Comp frame shows only target vars; enclosing frame hides them
    expect(code).toContain("_active_comp['target_vars']");
    expect(code).toContain("is_comp_frame and not is_target");
    expect(code).toContain("not is_comp_frame and is_target");
  });

  it('compiles element expression for eval during tracing', () => {
    expect(code).toContain('elt_code');
    expect(code).toContain('elt_label');
    expect(code).toContain("compile(elt_label, '<comp>', 'eval')");
  });

  it('compiles filter conditions (if clauses) for comprehensions', () => {
    expect(code).toContain('filter_codes');
    expect(code).toContain('gen.ifs');
    expect(code).toContain("compile(_ast.unparse(if_clause), '<comp>', 'eval')");
  });

  it('evals element expression each iteration and tracks partial result', () => {
    expect(code).toContain("eval(_active_comp['elt_code'], frame.f_globals, frame.f_locals)");
    expect(code).toContain("_active_comp['partial_result'].append(elt_val)");
    expect(code).toContain("_active_comp['current_elt'] = elt_val");
  });

  it('checks filter conditions before including element in partial result', () => {
    // Must eval filters BEFORE eval-ing the element expression
    const filterCheck = code.indexOf('passes_filter');
    const eltEval = code.indexOf("eval(_active_comp['elt_code']");
    expect(filterCheck).toBeGreaterThan(-1);
    expect(eltEval).toBeGreaterThan(-1);
    expect(filterCheck).toBeLessThan(eltEval);
  });

  it('shows element value in comp frame snapshots', () => {
    // The element label (e.g. "x * x") is shown as a variable in the comp frame
    expect(code).toContain("_active_comp.get('current_elt')");
    expect(code).toContain("_active_comp.get('elt_label'");
  });

  it('finds assignment targets for comprehensions via AST', () => {
    expect(code).toContain("_comp_info[value.lineno]['result_var'] = target.id");
  });

  it('shows return value when popping comp frame', () => {
    expect(code).toContain('def _pop_comp_frame(frame):');
    expect(code).toContain('has_return=True');
    expect(code).toContain("_active_comp.get('result_var')");
  });

  it('cleans up comp frame on return events', () => {
    // If a comprehension is on the last line, the return event fires
    // while the synthetic frame is still active — must clean up
    const returnSection = code.slice(
      code.indexOf("elif event == 'return':"),
      code.indexOf("return _tracer", code.indexOf("elif event == 'return':")),
    );
    expect(returnSection).toContain('if _active_comp:');
    expect(returnSection).toContain('_pop_comp_frame');
  });

  it('resets _active_comp in run_traced', () => {
    // Must reset between executions so stale state doesn't leak
    const runTracedSection = code.slice(code.indexOf('def run_traced'));
    expect(runTracedSection).toContain('_active_comp = None');
  });

  it('handles dict comprehensions with key-value element expressions', () => {
    expect(code).toContain("'DictComp'");
    expect(code).toContain("_ast.unparse(node.key)");
    expect(code).toContain("_ast.unparse(node.value)");
  });

  it('still skips tracer-internal frames', () => {
    const skipSection = code.slice(
      code.indexOf('_SKIP_FRAME_NAMES'),
      code.indexOf(')', code.indexOf('_SKIP_FRAME_NAMES')) + 1,
    );
    expect(skipSection).toContain('_capture_print');
    expect(skipSection).toContain('_safe_import');
  });

  // ── Error handling ──

  it('catches exceptions during execution', () => {
    expect(code).toContain('except Exception as e:');
  });

  it('extracts line numbers from traceback', () => {
    expect(code).toContain("tb.tb_frame.f_code.co_filename == '<user_code>'");
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
    expect(code).toContain('_call_stack.append({"name": display_name');
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

  it('sets __name__ to __main__ in execution namespace', () => {
    expect(code).toContain("namespace['__name__'] = '__main__'");
  });
});
