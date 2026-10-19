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
    expect(code).toContain('return _json_dumps(result)');
  });

  // ── Trace function ──

  it('defines the trace function', () => {
    expect(code).toContain('def _tracer(frame, event, arg):');
  });

  it('registers its trace function, and takes it off when the run ends', () => {
    expect(code).toContain('_settrace(_tracer)');
    expect(code).toContain('_settrace(None)');
  });

  it("calls its own builtins and library functions, which the program can't replace (#34)", () => {
    expect(code).toContain("globals().update({_k: _v for _k, _v in vars(_builtins).items() if not _k.startswith('_')})");
    expect(code).toContain('_json_dumps = json.dumps');
    expect(code).toContain('_settrace = sys.settrace');
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

  // ── Serialization (#34: never runs the program's code; safety.test.ts runs it) ──

  it('serializes from a queue, not by recursion', () => {
    expect(code).toContain('def _serialize_value(val, heap_objects, visited, pending):');
    expect(code).toContain('def _serialize_heap_object(obj, heap_id, heap_objects, visited, pending):');
    expect(code).toContain('while next_object < len(pending):');
  });

  it('serializes None and bools before ints (bool is a subclass of int)', () => {
    expect(code).toContain('return {"type": "null", "value": None}');
    const trueCheck = code.indexOf('if val is True:');
    const intCheck = code.indexOf('if issubclass(t, int):');
    expect(trueCheck).toBeGreaterThan(-1);
    expect(trueCheck).toBeLessThan(intCheck);
  });

  it('serializes inf and nan, and ints past the digit limit by their size', () => {
    expect(code).toContain('"Infinity"');
    expect(code).toContain('"-Infinity"');
    expect(code).toContain('"NaN"');
    expect(code).toContain("'<int with %d digits>'");
  });

  it("reads containers through their own methods, not the program's overrides", () => {
    expect(code).toContain('list.__getitem__(obj, i)');
    expect(code).toContain('dict.items(obj)');
    expect(code).toContain("object.__getattribute__(obj, '__dict__')");
    expect(code).not.toMatch(/\bhasattr\(obj/);
    expect(code).not.toMatch(/\bgetattr\(obj/);
  });

  it('draws each kind of heap object', () => {
    for (const kind of ['list', 'tuple', 'dict', 'set', 'function']) expect(code).toContain(`object_type = "${kind}"`);
    expect(code).toContain('label = t.__name__');
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
    expect(code).toContain("sys.stdout = sys.__stdout__ = _TutorStream('stdout', 'strict')");
    expect(code).toContain("sys.stderr = sys.__stderr__ = _TutorStream('stderr', 'backslashreplace')");
    expect(code).not.toContain("namespace['print']");
    expect(code).not.toContain('_capture_print');
  });

  it('gives the streams back after the run', () => {
    expect(code).toContain('sys.stdin, sys.stdout, sys.stderr, sys.__stdin__, sys.__stdout__, sys.__stderr__ = saved_streams');
  });

  // ── The namespace (#34; #35 decides what a program may use) ──

  it("runs the program in a namespace of its own names, with all of CPython's builtins (#35)", () => {
    expect(code).toContain("namespace = {'__name__': '__main__'}");
    expect(code).not.toContain('_safe_import');
    expect(code).not.toContain('_SAFE_MODULES');
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
    expect(code).toContain('if obj_id not in visited:');
    expect(code).toContain('visited.add(obj_id)');
  });

  // ── Compilation ──

});
