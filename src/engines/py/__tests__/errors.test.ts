/**
 * Syntax errors and tracebacks as CPython prints them (#40), the tracer run in
 * a real Pyodide: a program CPython rejects is a compile error with no steps,
 * its display (`File "main.py", line N`, the line, the carets) on the
 * console; an uncaught exception's traceback is python main.py's, chained
 * exceptions, carets and folded repeats included, with none of PyTutor's own
 * frames.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { RunError, WorkerMessage } from '../../../types/snapshot';
import { loadTracer, runProgram } from '../run';
import { getTracerCode } from '../tracer';
import { loadNodePyodide, type PyodideInterface } from './cpython/pyodideNode';

let py: PyodideInterface;

beforeAll(async () => {
  py = await loadNodePyodide();
  loadTracer(py, getTracerCode());
}, 60_000);

function ended(source: string): { reply: WorkerMessage; error: RunError } {
  const reply = runProgram(py, source);
  if (reply.type !== 'result' || !reply.error) throw new Error(`no error: ${JSON.stringify(reply).slice(0, 200)}`);
  return { reply, error: reply.error };
}

const lines = (...l: string[]) => l.join('\n') + '\n';

describe('syntax errors', () => {
  it('is a compile error with no steps: the message, its line marked, and CPython\'s display on the console', () => {
    const { reply, error } = ended(lines('x = 1', 'if x = 1:', '    print(x)'));
    expect(reply.type === 'result' && reply.snapshots).toEqual([]);
    expect(error).toEqual({
      kind: 'compile',
      message: "SyntaxError: invalid syntax. Maybe you meant '==' or ':=' instead of '='?",
      line: 2,
      lines: [2],
      stderr: lines('  File "main.py", line 2', '    if x = 1:', '       ^^^^^', "SyntaxError: invalid syntax. Maybe you meant '==' or ':=' instead of '='?").trimEnd(),
    });
  });

  it('reports an IndentationError and an error only the compiler finds as CPython does', () => {
    expect(ended(lines('if True:', 'print(1)')).error).toMatchObject({
      kind: 'compile', line: 2, message: "IndentationError: expected an indented block after 'if' statement on line 1",
      stderr: lines('  File "main.py", line 2', '    print(1)', '    ^^^^^', "IndentationError: expected an indented block after 'if' statement on line 1").trimEnd(),
    });
    expect(ended(lines('x = 1', 'return x')).error).toMatchObject({
      kind: 'compile', line: 2, message: "SyntaxError: 'return' outside function",
      stderr: lines('  File "main.py", line 2', '    return x', '    ^^^^^^^^', "SyntaxError: 'return' outside function").trimEnd(),
    });
  });

  it("prints a compile-time warning of a program that runs once, as python main.py does", () => {
    const reply = runProgram(py, lines('x = 1', 'print(x is 1)'));
    if (reply.type !== 'result') throw new Error(reply.message);
    const console = reply.snapshots.at(-1)!.console ?? [];
    expect(console.filter(l => l.text.includes('SyntaxWarning'))).toEqual([{ text: 'main.py:2: SyntaxWarning: "is" with \'int\' literal. Did you mean "=="?', stream: 'stderr' }]);
  });
});

describe('tracebacks', () => {
  it('shows carets under the failing expression', () => {
    expect(ended(lines('def divide(a, b):', '    return a / b', 'print(divide(1, 0))')).error.stderr).toBe(lines(
      'Traceback (most recent call last):',
      '  File "main.py", line 3, in <module>',
      '    print(divide(1, 0))',
      '          ^^^^^^^^^^^^',
      '  File "main.py", line 2, in divide',
      '    return a / b',
      '           ~~^~~',
      'ZeroDivisionError: division by zero',
    ).trimEnd());
  });

  it('shows a chained exception, its cause or the one it was raised while handling, as CPython does', () => {
    const cause = ended(lines('try:', '    {}["k"]', 'except KeyError as e:', '    raise ValueError("bad") from e')).error.stderr!;
    expect(cause).toContain('KeyError: \'k\'\n\nThe above exception was the direct cause of the following exception:\n\nTraceback (most recent call last):');
    expect(cause.endsWith('ValueError: bad')).toBe(true);
    const context = ended(lines('try:', '    {}["k"]', 'except KeyError:', '    1 / 0')).error.stderr!;
    expect(context).toContain('During handling of the above exception, another exception occurred:');
    const hidden = ended(lines('try:', '    {}["k"]', 'except KeyError:', '    raise ValueError("bad") from None')).error.stderr!;
    expect(hidden).toBe(lines('Traceback (most recent call last):', '  File "main.py", line 4, in <module>', '    raise ValueError("bad") from None', 'ValueError: bad').trimEnd());
  });

  it("folds a runaway recursion's repeated frames, without the frame the recursion limit refused", () => {
    const stderr = ended(lines('def down(n):', '    return down(n + 1)', 'down(0)')).error.stderr!;
    expect(stderr).toBe(lines(
      'Traceback (most recent call last):',
      '  File "main.py", line 3, in <module>',
      '    down(0)',
      '  File "main.py", line 2, in down',
      '    return down(n + 1)',
      '           ^^^^^^^^^^^',
      '  File "main.py", line 2, in down',
      '    return down(n + 1)',
      '           ^^^^^^^^^^^',
      '  File "main.py", line 2, in down',
      '    return down(n + 1)',
      '           ^^^^^^^^^^^',
      '  [Previous line repeated 996 more times]',
      'RecursionError: maximum recursion depth exceeded',
    ).trimEnd());
  });

  it("shows library frames, as python main.py does, and never PyTutor's own", () => {
    const stderr = ended(lines('import json', 'json.loads("{")')).error.stderr!;
    expect(stderr).toContain('  File "/lib/python312.zip/json/decoder.py"');
    expect(stderr).not.toMatch(/<exec>|run_traced|_tracer/);
  });

  it("puts a comprehension's line and carets in the frame around it, where CPython 3.12 runs it inlined", () => {
    expect(ended(lines('def parse_all(items):', '    return [', '        int(t)', '        for t in items', '    ]', 'parse_all(["1", "x"])')).error.stderr).toBe(lines(
      'Traceback (most recent call last):',
      '  File "main.py", line 6, in <module>',
      '    parse_all(["1", "x"])',
      '  File "main.py", line 3, in parse_all',
      '    int(t)',
      "ValueError: invalid literal for int() with base 10: 'x'",
    ).trimEnd());
  });
});
