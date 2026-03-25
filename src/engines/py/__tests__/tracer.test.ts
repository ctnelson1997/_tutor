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
    expect(code).toContain("_active_comp = dict(comp)");
    expect(code).toContain('"_is_comp": True');
  });

  it('pops synthetic comp frame on leaving a comprehension line', () => {
    expect(code).toContain("_active_comp.get('_line') != line");
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
    expect(code).toContain("pr.append(elt_val)");
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

  it('skips continuation lines in the tracer line handler', () => {
    expect(code).toContain('line in _continuation_lines');
  });

  it('handles dict comprehensions with key-value element expressions', () => {
    expect(code).toContain("'DictComp'");
    expect(code).toContain("_ast.unparse(node.key)");
    expect(code).toContain("_ast.unparse(node.value)");
  });

  // ── Multi-type comprehension support ──

  it('stores comp_type in _comp_info for container initialization', () => {
    expect(code).toContain("'comp_type': type_name");
  });

  it('initializes partial_result with the correct container per comp type', () => {
    // ListComp -> [], SetComp -> set(), DictComp -> {}
    // The initialization must handle all three container types
    expect(code).toContain("'comp_type'");
    expect(code).toContain("comp.get('comp_type')");
    // Check that the init line uses all three types
    const initLine = code.slice(
      code.indexOf("_active_comp['partial_result']"),
      code.indexOf('\n', code.indexOf("_active_comp['partial_result']")),
    );
    expect(initLine).toContain('DictComp');
    expect(initLine).toContain('SetComp');
    expect(initLine).toContain('set()');
  });

  it('adds elements to set with .add() and dict with key assignment', () => {
    expect(code).toContain('pr.add(elt_val)');
    expect(code).toContain('pr[elt_val[0]] = elt_val[1]');
    expect(code).toContain('pr.append(elt_val)');
  });

  it('handles empty partial_result correctly in _pop_comp_frame', () => {
    // Empty containers are falsy in Python — must use "is not None" check
    const popSection = code.slice(
      code.indexOf('def _pop_comp_frame'),
      code.indexOf('_call_stack.pop()'),
    );
    expect(popSection).toContain('if partial is not None:');
    // Must NOT use "if partial:" which would skip empty sets/dicts
    expect(popSection).not.toMatch(/if partial[^_ ]/);
  });

  // ── Back-to-back comprehension handling ──

  it('pops comp frame when moving to a different line, not just non-comp lines', () => {
    // The condition must check _active_comp's stored line vs current line,
    // NOT whether the current line is a comp. This fixes back-to-back comps
    // like: squares = [...]; evens = [...]
    expect(code).toContain("_active_comp.get('_line') != line");
    // Must NOT use the old broken condition that required current line to be non-comp
    expect(code).not.toContain('_active_comp and not comp');
  });

  it('pops comp frame before entering a new one on a different line', () => {
    // The pop must happen BEFORE the push for the new comp
    const popCheck = code.indexOf("_active_comp.get('_line') != line");
    const pushCheck = code.indexOf('comp and _active_comp is None');
    expect(popCheck).toBeGreaterThan(-1);
    expect(pushCheck).toBeGreaterThan(-1);
    expect(popCheck).toBeLessThan(pushCheck);
  });

  // ── Phased comprehension snapshots ──

  it('captures column ranges for comprehension sub-expressions in AST scan', () => {
    expect(code).toContain("'iter_range'");
    expect(code).toContain("'elt_range'");
    expect(code).toContain("'filter_ranges'");
    expect(code).toContain("'filter_texts'");
  });

  it('stores iteration clause column range from target to iter end', () => {
    expect(code).toContain('gen.target.col_offset');
    expect(code).toContain("getattr(gen.iter, 'end_col_offset'");
  });

  it('stores element expression column range', () => {
    expect(code).toContain('node.elt.col_offset');
    expect(code).toContain("getattr(node.elt, 'end_col_offset'");
  });

  it('stores filter expression column ranges and text', () => {
    expect(code).toContain('if_clause.col_offset');
    expect(code).toContain("getattr(if_clause, 'end_col_offset'");
    expect(code).toContain('_ast.unparse(if_clause)');
  });

  it('emits phased snapshots: iteration, then filter, then element', () => {
    // The comprehension block must emit multiple _capture_snapshot calls
    // with column_range for each phase, then return early
    const compBlock = code.slice(
      code.indexOf("# Phase 1"),
      code.indexOf("return _tracer", code.indexOf("# Phase 1")),
    );
    expect(compBlock).toContain('column_range=iter_range');
    expect(compBlock).toContain('column_range=fr');
    expect(compBlock).toContain('column_range=elt_range');
  });

  it('emits condition result for filter evaluation', () => {
    const compBlock = code.slice(
      code.indexOf("# Phase 2"),
      code.indexOf("# Phase 3"),
    );
    expect(compBlock).toContain('"expression":');
    expect(compBlock).toContain('"result":');
    expect(compBlock).toContain('"line":');
    expect(compBlock).toContain('condition=cond');
  });

  it('only emits element snapshot when all filters pass', () => {
    const compBlock = code.slice(
      code.indexOf("# Phase 3"),
      code.indexOf("return _tracer", code.indexOf("# Phase 3")),
    );
    expect(compBlock).toContain('if passes_filter:');
    expect(compBlock).toContain('column_range=elt_range');
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

  // ── Partial result display ──

  it('shows partial result in the comp frame with a __comp_result__ marker name', () => {
    // Uses a marker name so the UI can render it distinctly (not as a variable)
    const compFrameSection = code.slice(
      code.indexOf("frame_info.get(\"_is_comp\") and not has_return"),
      code.indexOf("# Add return value display"),
    );
    expect(compFrameSection).toContain("_active_comp.get('partial_result')");
    expect(compFrameSection).toContain('"__comp_result__"');
  });

  it('does not inject synthetic partial result into the enclosing frame', () => {
    // The old pattern of showing partial in the enclosing frame caused heap ID issues.
    // The "not frame_info.get('_is_comp')" + partial_result pattern must NOT exist.
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('not frame_info.get') && lines[i].includes('_is_comp')) {
        // Check the next few lines don't reference partial_result
        const nearby = lines.slice(i, i + 5).join('\n');
        expect(nearby).not.toContain('partial_result');
      }
    }
  });

  // ── Heap ID cleanup for synthetic objects ──

  it('bridges heap ID from synthetic partial to real Python variable', () => {
    // So the UI shows the same heap object before and after assignment
    const popSection = code.slice(
      code.indexOf('def _pop_comp_frame'),
      code.indexOf('def _tracer'),
    );
    expect(popSection).toContain('_heap_map[id(real_obj)] = _heap_map[id(partial)]');
  });

  it('cleans up synthetic partial heap ID after bridging', () => {
    // Prevents id() reuse contamination after the partial list is GC'd
    const popSection = code.slice(
      code.indexOf('def _pop_comp_frame'),
      code.indexOf('def _tracer'),
    );
    expect(popSection).toContain('del _heap_map[id(partial)]');
  });

  // ── Enclosing frame locals sync ──

  it('syncs enclosing frame locals during comprehension iterations', () => {
    // The module frame needs up-to-date locals so previously-assigned
    // variables (like squares) are visible during the next comprehension
    const compBlock = code.slice(
      code.indexOf("# If in a comprehension, emit phased"),
      code.indexOf("return _tracer", code.indexOf("# Phase 1")),
    );
    expect(compBlock).toContain('_call_stack[-2]["locals"]');
  });

  it('syncs enclosing frame locals in _pop_comp_frame before return snapshot', () => {
    const popSection = code.slice(
      code.indexOf('def _pop_comp_frame'),
      code.indexOf('_call_stack.pop()'),
    );
    expect(popSection).toContain('_call_stack[-2]["locals"]');
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
