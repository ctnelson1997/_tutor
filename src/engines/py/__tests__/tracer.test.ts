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
    expect(code).toContain("def run_traced(source_code, stdin_text=''):");
  });

  it('run_traced resets all global state', () => {
    expect(code).toContain('_snapshots = []');
    expect(code).toContain("_out_lines = ['']");
    expect(code).toContain('_console = []');
    expect(code).toContain('_stderr_used = False');
    expect(code).toContain('_call_stack = []');
    expect(code).toContain('_heap_map = {}');
    expect(code).toContain('_heap_counter = 0');
    expect(code).toContain('_step_counter = 0');
  });

  it('returns JSON from run_traced', () => {
    expect(code).toContain('result = {"type": "result", "snapshots": _snapshots}');
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
    expect(code).toContain('code.co_filename != _USER_FILE');
  });

  it('compiles user code as main.py, a filename distinct from the tracer', () => {
    // User code must use a different filename than what pyodide.runPython()
    // uses for the tracer module (which defaults to '<exec>'), or the
    // tracer's frames would be traced as if they were user code. main.py is
    // what CPython's tracebacks and warnings name (#31).
    expect(code).toContain("_USER_FILE = 'main.py'");
    expect(code).toContain("compile(source_code, _USER_FILE, 'exec')");
    expect(code).not.toContain("compile(source_code, '<exec>', 'exec')");
    expect(code).toContain('_linecache.cache[_USER_FILE]');
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

  // ── Output, captured at the streams (#31; output.test.ts runs it) ──

  it('captures output at sys.stdout and sys.stderr, not by replacing print', () => {
    expect(code).toContain('class _TutorStream(_io.TextIOBase):');
    expect(code).toContain("sys.stdout = _TutorStream('stdout', 'strict')");
    expect(code).toContain("sys.stderr = _TutorStream('stderr', 'backslashreplace')");
    expect(code).not.toContain("namespace['print']");
    expect(code).not.toContain('_capture_print');
  });

  it('gives the streams back after the run', () => {
    expect(code).toContain('sys.stdout, sys.stderr = saved_streams');
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

  // ── Comprehension frames (#33; comprehensions.test.ts runs them) ──

  it('compiles each comprehension into a frame of its own', () => {
    expect(code).toContain('class _CompWrapper(_ast.NodeTransformer):');
    expect(code).toContain('def _name_comprehensions(code):');
    expect(code).toContain('code = _compile_program(source_code)');
    expect(code).toContain("'<listcomp>': 'list comprehension'");
  });

  it("never evaluates the program's code itself, and reads the module's variables from its globals", () => {
    expect(code).not.toMatch(/\beval\(/);
    expect(code).not.toContain('__comp_result__');
    expect(code).not.toContain('_active_comp');
    expect(code).toContain('return frame.f_globals');
  });

  // ── Multi-line statement collapsing ──

  it('defines _scan_continuation_lines to detect multi-line statements', () => {
    expect(code).toContain('def _scan_continuation_lines(source_code):');
    expect(code).toContain('_continuation_lines');
  });

  it('calls _scan_continuation_lines before execution', () => {
    const scanCall = code.indexOf('_scan_continuation_lines(source_code)');
    const execCall = code.indexOf('exec(code, namespace)');
    expect(scanCall).toBeGreaterThan(-1);
    expect(execCall).toBeGreaterThan(-1);
    expect(scanCall).toBeLessThan(execCall);
  });

  it('resets _continuation_lines in run_traced', () => {
    const runTracedSection = code.slice(code.indexOf('def run_traced'));
    expect(runTracedSection).toContain('_continuation_lines = set()');
  });

  it('collects statement start lines to avoid skipping real statements', () => {
    expect(code).toContain('isinstance(node, _ast.stmt)');
    expect(code).toContain('_start_lines.add(node.lineno)');
  });

  it('identifies continuation lines from multi-line simple statements', () => {
    // Should handle Assign, Expr, Return, etc.
    expect(code).toContain('_ast.Assign');
    expect(code).toContain('_ast.Expr');
    expect(code).toContain('_ast.Return');
  });

  it("skips continuation lines in the tracer line handler, in the statement's own frame", () => {
    expect(code).toContain('line in _continuation_lines and fname not in _EXPRESSION_FRAMES');
  });

  // ── Snapshot columnRange and condition fields ──

  it('_capture_snapshot accepts column_range and condition parameters', () => {
    expect(code).toContain(
      'def _capture_snapshot(line, current_locals, return_value=None, has_return=False, column_range=None, condition=None):',
    );
  });

  it('adds columnRange to snapshot when column_range is provided', () => {
    expect(code).toContain('"columnRange"');
    expect(code).toContain('"startCol"');
    expect(code).toContain('"endCol"');
  });

  it('adds condition to snapshot when condition is provided', () => {
    expect(code).toContain('if condition:');
    expect(code).toContain('snapshot["condition"] = condition');
  });

  it('still skips tracer-internal frames', () => {
    const skipSection = code.slice(
      code.indexOf('_SKIP_FRAME_NAMES'),
      code.indexOf(')', code.indexOf('_SKIP_FRAME_NAMES')) + 1,
    );
    expect(skipSection).toContain('_safe_import');
  });

  // ── Error handling ──

  it("catches every exception the program raises, BaseExceptions included, as the program's own", () => {
    expect(code).toContain('except BaseException as e:');
  });

  it('extracts line numbers from traceback', () => {
    expect(code).toContain('tb.tb_frame.f_code.co_filename == _USER_FILE');
    expect(code).toContain('line = tb.tb_lineno');
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
    expect(code).toContain('snapshot["stdout"] = _stdout_shown()');
    expect(code).toContain('snapshot["console"]');
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

  it('tracks visited objects to prevent circular and duplicate serialization', () => {
    // Tracks both obj_id (Python identity) and heap_id (logical identity)
    // so bridged objects (e.g. comp partial → real variable) aren't serialized twice
    expect(code).toContain('if obj_id not in visited and heap_id not in visited:');
    expect(code).toContain('visited.add(obj_id)');
    expect(code).toContain('visited.add(heap_id)');
  });

  // ── Compilation ──

  it('sets __name__ to __main__ in execution namespace', () => {
    expect(code).toContain("namespace['__name__'] = '__main__'");
  });
});
