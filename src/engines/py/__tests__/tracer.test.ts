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

  it('returns JSON from run_traced: each part once, the steps referring to them by index (#39)', () => {
    expect(code).toContain(`result = '{"type":"result","parts":[' + ','.join(_parts) + '],"snapshots":' + _encode(_snapshots)`);
  });

  it("writes each part as JSON text when it is made, so the reply keeps none of the program's objects (#78)", () => {
    expect(code).toContain("_c_encoder = _json.make_encoder(None, _unencodable, _json.encode_basestring_ascii, None, ':', ',', False, False, True)");
    expect(code).toContain('_parts.append(_encode(obj))');
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
    expect(code).toContain("compile(source_code, _USER_FILE, 'exec', dont_inherit=True)");
    expect(code).not.toContain("compile(source_code, '<exec>', 'exec')");
    expect(code).toContain('_linecache.cache[_USER_FILE]');
  });

  // ── Serialization (#34: never runs the program's code; safety.test.ts runs it) ──

  it('serializes from a queue, not by recursion', () => {
    expect(code).toContain('def _serialize_value(val):');
    expect(code).toContain('def _draw_heap_object(obj, visited, pending, cache):');
    expect(code).toContain('while next_object < len(pending):');
  });

  it('draws each step from the parts of the step before that are unchanged (#39)', () => {
    expect(code).toContain('def _draw_frame(frame_info, top, return_value, has_return, visited, pending):');
    expect(code).toContain('if hit is not None and hit[0] is val:');
    expect(code).toContain('ids = list(map(id, seq))');
    expect(code).toContain('_heap_cache = cache');
  });

  it("holds none of the program's objects between steps that CPython doesn't hold (#78; program.test.ts runs it)", () => {
    // A heap object is remembered by the ids and types of what it showed, its numbers and strings held.
    expect(code).toContain('tids = list(map(id, types))');
    expect(code).toContain('held = list(_compress(seq, map(_is_primitive_type, types)))');
    // The module's variables are compared by what they show; a function frame's held until its next event.
    expect(code).toContain('key = value["heapId"] if value["type"] == "ref" else _encode(value)');
    expect(code).toContain('holds = kind == "function"');
    // Heap ids by address and type, per-type facts by weak reference.
    expect(code).toContain('_heap_map[k] = (heap_id, tid)');
    expect(code).toContain('cache[k] = (value, _weakref.ref(t))');
  });

  it('reads each frame from the frame itself, again whenever it may have changed (#80)', () => {
    expect(code).toContain('local_vars = _frame_locals(frame_info["frame"])');
    expect(code).toContain('_call_stack[-1]["stale"] = True');
    expect(code).toContain('"cells": bool(code.co_cellvars or code.co_freevars)');
  });

  it('checks the time and work budgets while drawing a step (#39)', () => {
    expect(code).toContain('def _check_budgets():');
    expect(code).toContain('if next_object % 1024 == 0:');
  });

  it('serializes None and bools before ints (bool is a subclass of int)', () => {
    expect(code).toContain('return {"type": "null", "value": None, "display": "None"}');
    const trueCheck = code.indexOf('if val is True:');
    const intCheck = code.indexOf('if t is int:');
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
    expect(code).toContain('list.__getitem__(obj, slice(0, _MAX_SEQ_PROPS))');
    expect(code).toContain('_islice(dict.keys(obj), _MAX_DICT_PROPS)');
    expect(code).toContain("object.__getattribute__(obj, '__dict__')");
    expect(code).not.toMatch(/\bhasattr\(obj/);
    expect(code).not.toMatch(/\bgetattr\(obj/);
  });

  it('draws each kind of heap object', () => {
    for (const kind of ['list', 'tuple', 'dict', 'set', 'function', 'method', 'class', 'module', 'enum']) expect(code).toContain(`("${kind}", `);
    expect(code).toContain('return "object", _type_name(t), spec');
  });

  it('draws only these types inline, a subclass of one as an object (#78)', () => {
    expect(code).toContain('_PRIMITIVE_TYPES = frozenset({int, float, str, bool, complex, _NoneType})');
    expect(code).toContain('("primitive", (int, float, str, complex))');
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
    // Real TextIOWrappers over a recording buffer (#78): reconfigure, buffer, line_buffering and write_through as CPython's.
    expect(code).toContain('class _TutorBuffer(_io.BufferedIOBase):');
    expect(code).toContain('class _TutorStdin(_io.TextIOWrapper):');
    expect(code).toContain("sys.stdout = sys.__stdout__ = _output_stream('stdout', 'strict')");
    expect(code).toContain("sys.stderr = sys.__stderr__ = _output_stream('stderr', 'backslashreplace')");
    expect(code).not.toContain("namespace['print']");
    expect(code).not.toContain('_capture_print');
  });

  it('gives the streams back after the run', () => {
    expect(code).toContain('sys.stdin, sys.stdout, sys.stderr, sys.__stdin__, sys.__stdout__, sys.__stderr__ = saved_streams');
  });

  // ── The namespace (#34; #35 decides what a program may use) ──

  it("runs the program in a __main__ module of its own, with all of CPython's builtins (#35, #77; program.test.ts runs it)", () => {
    expect(code).toContain("module = _types.ModuleType('__main__')");
    expect(code).toContain("ns['__builtins__'] = _builtins");
    expect(code).toContain("sys.modules['__main__'] = main_module");
    expect(code).not.toContain('_safe_import');
    expect(code).not.toContain('_SAFE_MODULES');
  });

  // ── What a frame shows (#38; model.test.ts runs it) ──

  it("hides only the names Python keeps itself: the module's, a class body's, a method's __class__ cell", () => {
    expect(code).toContain('_MODULE_BOOKKEEPING = frozenset(');
    expect(code).toContain('_CLASS_BOOKKEEPING = frozenset(');
    expect(code).toContain("_FUNCTION_BOOKKEEPING = frozenset({'__class__', '__classdict__'})");
    expect(code).not.toContain('_baseline_keys');
    expect(code).not.toContain("name.startswith('__') and name.endswith('__')");
  });

  it("hides what a class body's namespace started with while it holds the same object", () => {
    expect(code).toContain('frame_info["base"] = dict(_frame_locals(frame))');
    expect(code).toContain('dict.__getitem__(local_vars, k) is base[k]');
  });

  it("lists variables in their order, not sorted, the module's in the order they first appeared", () => {
    expect(code).toContain('for name in _shown_names(frame_info, local_vars):');
    expect(code).toContain('_module_order[k] = None');
    expect(code).not.toContain('sorted(k for k in dict.keys(local_vars)');
  });

  it('filters internal positional variables (e.g. .0 iterator)', () => {
    expect(code).toContain("not k.startswith('.')");
  });

  it('draws classes, modules and Enum members as themselves', () => {
    expect(code).toContain('return "class", label, spec');
    expect(code).toContain('return "module", seq[0], []');
    expect(code).toContain('("enum", _Enum)');
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
      'def _capture_snapshot(line, return_value=None, has_return=False, column_range=None, condition=None):',
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
    expect(code).toContain('snapshot["stdout"] = _output_parts[1]');
    expect(code).toContain('snapshot["console"] = _output_parts[2]');
  });

  it('includes return value in snapshots', () => {
    expect(code).toContain('return \\u21b5');
  });

  // ── Call stack management ──

  it('pushes a frame on every call event, the module frame included', () => {
    expect(code).toContain('frame_info = {"name": _COMP_DISPLAY_NAMES.get(fname, fname), "kind": _frame_kind(code), "frame": frame,');
    expect(code).toContain('_call_stack.append(frame_info)');
  });

  it("chains the program's own trace function and never lets it replace the tracer's (#78)", () => {
    expect(code).toContain('sys.settrace = _program_settrace');
    expect(code).toContain('sys.gettrace = _program_gettrace');
    expect(code).toContain('return _chain(frame, event, arg, result)');
  });

  it('pops frame on return event', () => {
    expect(code).toContain('_call_stack.pop()');
  });

  // ── Heap identity tracking ──

  it('defines heap ID assignment function', () => {
    expect(code).toContain('def _get_heap_id(obj):');
  });

  it('uses Python id() for object identity', () => {
    expect(code).toContain('obj_id = id(obj)');
  });

  it('tracks visited objects to prevent circular and duplicate serialization', () => {
    expect(code).toContain('if k not in visited:');
    expect(code).toContain('visited.add(k)');
  });

  // ── Compilation ──

});
