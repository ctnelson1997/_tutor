/**
 * Unit tests for the JDK differential harness (corpus.ts, harness.ts). If a
 * checker silently passed everything, the differential suite would too, so
 * each one is tested against snapshots that break it.
 */
import { describe, it, expect } from 'vitest';
import type { ExecutionSnapshot, HeapObject, StackFrame } from '../../../../types/snapshot';
import { examples } from '../../examples';
import {
  caseHash,
  formatGolden,
  goldenFromJavaRun,
  loadCases,
  parseUncaughtException,
  type JdkCase,
  type JdkGolden,
} from './corpus';
import {
  blockScopedDeclarations,
  checkInvariant,
  compareOutput,
  goldenStdout,
  interpreterExceptionClass,
  mustFailLoudly,
  runInterpreter,
  simpleClassName,
  staticFieldsOf,
  validateKnownFailures,
  type InterpreterRun,
  type InvariantName,
} from './harness';

function snap(step: number, line: number, callStack: StackFrame[], heap: HeapObject[] = [], stdout: string[] = []): ExecutionSnapshot {
  return { step, line, callStack, heap, stdout };
}

function golden(overrides: Partial<JdkGolden> = {}): JdkGolden {
  return { stdout: '', stderr: '', exitCode: 0, exception: null, compileError: null, sourceSha256: '', ...overrides };
}

function run(stdoutLines: string[], error: string | null = null, steps = 1): InterpreterRun {
  const snapshots = Array.from({ length: steps }, (_, i) => snap(i, 1, [{ name: 'main', variables: [] }], [], stdoutLines));
  return { snapshots, error, phase: 'run' };
}

function testCase(source: string): JdkCase {
  return { id: 'test/case', category: 'test', name: 'case', source, stdin: '', origin: 'test', goldenPath: '' };
}

describe('goldenFromJavaRun', () => {
  it('records a normal run, normalizing CRLF', () => {
    const g = goldenFromJavaRun({ stdout: 'a\r\nb\r\n', stderr: '', exitCode: 0 }, 'h');
    expect(g).toEqual({ stdout: 'a\nb\n', stderr: '', exitCode: 0, exception: null, compileError: null, sourceSha256: 'h' });
  });

  it('parses an uncaught exception from stderr', () => {
    const g = goldenFromJavaRun({
      stdout: 'before\n',
      stderr: 'Exception in thread "main" java.lang.ArithmeticException: / by zero\n\tat Main.divide(Main.java:3)\n\tat Main.main(Main.java:7)\n',
      exitCode: 1,
    }, 'h');
    expect(g.exception).toEqual({ class: 'java.lang.ArithmeticException', message: '/ by zero' });
    expect(g.compileError).toBeNull();
  });

  it('separates javac diagnostics from the launcher\'s "compilation failed" line', () => {
    const stderr = 'Main.java:3: error: incompatible types: String cannot be converted to int\n    int x = "hello";\n            ^\n1 error\nerror: compilation failed\n';
    const g = goldenFromJavaRun({ stdout: '', stderr, exitCode: 1 }, 'h');
    expect(g.compileError).toBe('Main.java:3: error: incompatible types: String cannot be converted to int\n    int x = "hello";\n            ^\n1 error');
    expect(g.exception).toBeNull();
  });

  it('drops stack frames that only exist because of the source launcher', () => {
    const stderr = [
      'java.lang.RuntimeException: oops',
      '\tat Main.main(Main.java:4)',
      '\tat java.base/jdk.internal.reflect.DirectMethodHandleAccessor.invoke(DirectMethodHandleAccessor.java:103)',
      '\tat java.base/java.lang.reflect.Method.invoke(Method.java:580)',
      '\tat jdk.compiler/com.sun.tools.javac.launcher.Main.execute(Main.java:484)',
      '',
    ].join('\n');
    expect(goldenFromJavaRun({ stdout: '', stderr, exitCode: 0 }, 'h').stderr).toBe('java.lang.RuntimeException: oops\n\tat Main.main(Main.java:4)\n');
  });

  it('cuts very long stderr (a StackOverflowError trace)', () => {
    const stderr = 'Exception in thread "main" java.lang.StackOverflowError\n' + '\tat Main.f(Main.java:2)\n'.repeat(1024);
    const g = goldenFromJavaRun({ stdout: '', stderr, exitCode: 1 }, 'h');
    expect(g.stderr.split('\n').length).toBeLessThanOrEqual(51);
    expect(g.stderr).toMatch(/more lines\)$/);
    expect(g.exception).toEqual({ class: 'java.lang.StackOverflowError', message: null });
  });
});

describe('parseUncaughtException', () => {
  it('handles an exception with no message', () => {
    expect(parseUncaughtException('Exception in thread "main" java.lang.IllegalStateException\n\tat Main.main(Main.java:3)\n'))
      .toEqual({ class: 'java.lang.IllegalStateException', message: null });
  });

  it('keeps nested class names and multi-line messages', () => {
    expect(parseUncaughtException('Exception in thread "main" Main$BadInput: line one\nline two\n\tat Main.main(Main.java:9)\n'))
      .toEqual({ class: 'Main$BadInput', message: 'line one\nline two' });
  });

  it('keeps an empty message distinct from no message', () => {
    expect(parseUncaughtException('Exception in thread "main" java.lang.RuntimeException: \n\tat Main.main(Main.java:3)\n'))
      .toEqual({ class: 'java.lang.RuntimeException', message: '' });
  });

  it('stops the message at a "Caused by" section', () => {
    expect(parseUncaughtException('Exception in thread "main" java.lang.RuntimeException: outer\nCaused by: java.lang.Error: inner\n'))
      .toEqual({ class: 'java.lang.RuntimeException', message: 'outer' });
  });

  it('returns null when nothing escaped', () => {
    expect(parseUncaughtException('java.lang.RuntimeException: printed by printStackTrace\n')).toBeNull();
  });
});

describe('caseHash and formatGolden', () => {
  it('keeps source and stdin apart', () => {
    expect(caseHash('ab', 'c')).not.toBe(caseHash('a', 'bc'));
    expect(caseHash('x', '')).toBe(caseHash('x', ''));
  });

  it('writes keys in a fixed order', () => {
    const shuffled = { sourceSha256: 'h', compileError: null, exception: null, exitCode: 0, stderr: '', stdout: 'x\n' } as JdkGolden;
    expect(Object.keys(JSON.parse(formatGolden(shuffled)))).toEqual(['stdout', 'stderr', 'exitCode', 'exception', 'compileError', 'sourceSha256']);
  });
});

describe('loadCases', () => {
  const cases = loadCases();

  it('includes every shipped example, read from examples.ts', () => {
    for (const ex of examples) {
      const c = cases.find(x => x.id === `examples/${ex.slug}`);
      expect(c, ex.slug).toBeDefined();
      expect(c!.source).toBe(ex.code.replace(/\r\n/g, '\n'));
    }
  });

  it('normalizes line endings and gives unique ids', () => {
    expect(cases.every(c => !c.source.includes('\r') && !c.stdin.includes('\r'))).toBe(true);
    expect(new Set(cases.map(c => c.id)).size).toBe(cases.length);
  });

  it('pairs a case with its .stdin file', () => {
    expect(cases.find(c => c.id === 'realistic/real-guessing-game')!.stdin).toBe('50 25 37\n');
  });
});

describe('interpreter errors → exception class', () => {
  it('reads each form the interpreter produces', () => {
    expect(interpreterExceptionClass('Exception in thread "main" IllegalStateException: Stack full')).toBe('IllegalStateException');
    expect(interpreterExceptionClass('Exception in thread "main" InvalidAgeException: Invalid age: -3')).toBe('InvalidAgeException');
    expect(interpreterExceptionClass('Line 5: ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3')).toBe('ArrayIndexOutOfBoundsException');
    expect(interpreterExceptionClass('ArithmeticException: / by zero')).toBe('ArithmeticException');
  });

  it('treats engine failures as no exception', () => {
    expect(interpreterExceptionClass('Unknown method: list.add()')).toBeNull();
    expect(interpreterExceptionClass("Line 4: Variable 'size' is not defined")).toBeNull();
    expect(interpreterExceptionClass('Execution exceeded 5000 steps. Your code may contain an infinite loop.')).toBeNull();
    expect(interpreterExceptionClass('Maximum call stack size exceeded')).toBeNull();
  });

  it('simplifies qualified and nested names', () => {
    expect(simpleClassName('java.lang.ArithmeticException')).toBe('ArithmeticException');
    expect(simpleClassName('Main$InsufficientFundsException')).toBe('InsufficientFundsException');
    expect(simpleClassName('Plain')).toBe('Plain');
  });
});

describe('compareOutput', () => {
  it('passes on matching stdout, dropping one trailing newline', () => {
    expect(goldenStdout(golden({ stdout: 'a\nb\n' }))).toBe('a\nb');
    expect(compareOutput(golden({ stdout: 'a\nb\n' }), run(['a', 'b']))).toEqual({ kind: 'pass', problems: [] });
  });

  it('reports wrong output without an error as "wrong"', () => {
    const v = compareOutput(golden({ stdout: '3000000000\n' }), run(['-1294967296']));
    expect(v.kind).toBe('wrong');
    expect(v.problems[0]).toContain('stdout line 1');
  });

  it('reports an interpreter failure on a program Java runs cleanly as "error"', () => {
    const v = compareOutput(golden({ stdout: '6\n' }), run([], 'Unknown method: nums.stream()'));
    expect(v.kind).toBe('error');
    expect(v.problems.some(p => p.includes('Unknown method'))).toBe(true);
  });

  it('requires the same uncaught exception class', () => {
    const g = golden({ stdout: 'before\n', exitCode: 1, exception: { class: 'java.lang.ArithmeticException', message: '/ by zero' } });
    expect(compareOutput(g, run(['before'], 'ArithmeticException: / by zero')).kind).toBe('pass');
    expect(compareOutput(g, run(['before'], 'Line 3: NullPointerException')).kind).toBe('error');
    expect(compareOutput(g, run(['before'], 'Unknown method: x()')).kind).toBe('error');
    expect(compareOutput(g, run(['before'])).kind).toBe('wrong'); // Java threw, the interpreter didn't
  });

  it('expects programs javac rejects to fail before running', () => {
    const g = golden({ exitCode: 1, compileError: 'Main.java:3: error: incompatible types' });
    expect(compareOutput(g, { snapshots: [], error: 'Parse error: …', phase: 'parse' }).kind).toBe('pass');
    expect(compareOutput(g, run(['hello'])).kind).toBe('wrong');
    expect(compareOutput(g, run([], "Line 5: Variable 'z' is not defined", 2)).kind).toBe('error');
  });
});

describe('runInterpreter', () => {
  it('reports a parse failure without running anything', () => {
    const r = runInterpreter('public class Main { void f( }', '');
    expect(r.phase).toBe('parse');
    expect(r.snapshots).toEqual([]);
    expect(r.error).toMatch(/^Parse error: /);
  });

  it('feeds stdin to Scanner', () => {
    const src = 'import java.util.Scanner;\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    System.out.println(sc.nextInt() * 2);\n  }\n}\n';
    const r = runInterpreter(src, '21\n');
    expect(r.error).toBeNull();
    expect(r.snapshots[r.snapshots.length - 1].stdout).toEqual(['42']);
  });
});

describe('invariant: refs', () => {
  const c = testCase('class Main {}\n');
  const main = (variables: StackFrame['variables']): StackFrame => ({ name: 'main', variables });

  it('accepts refs to heap objects in the same snapshot', () => {
    const s = snap(0, 1, [main([{ name: 'a', value: { type: 'ref', heapId: '1' } }])], [{ id: '1', objectType: 'array', properties: [] }]);
    expect(checkInvariant('refs', c, { snapshots: [s], error: null, phase: 'run' })).toEqual([]);
  });

  it('flags a dangling ref, a duplicate heap id, a JavaScript-only value and an array hole', () => {
    const props: HeapObject['properties'] = [{ key: '0', value: { type: 'number', value: 1 } }];
    props[2] = { key: '2', value: { type: 'number', value: 3 } }; // props[1] is a hole
    const s = snap(0, 1, [main([
      { name: 'a', value: { type: 'ref', heapId: '9' } },
      { name: 'u', value: { type: 'undefined', value: null } },
    ])], [
      { id: '1', objectType: 'array', properties: props },
      { id: '1', objectType: 'object', properties: [] },
    ]);
    const v = checkInvariant('refs', c, { snapshots: [s], error: null, phase: 'run' }).join('\n');
    expect(v).toContain('heap id #1 appears twice');
    expect(v).toContain("variable 'a' in frame main points to heap #9");
    expect(v).toContain("variable 'u' in frame main is not a valid value");
    expect(v).toContain('property #1 of heap #1 is not a valid value');
  });
});

describe('invariant: lines', () => {
  const c = testCase('line1\nline2\nline3\n');
  const frames: StackFrame[] = [{ name: 'main', variables: [] }];

  it('accepts lines 1..N and flags anything else', () => {
    const ok = { snapshots: [snap(0, 1, frames), snap(1, 3, frames)], error: null, phase: 'run' as const };
    expect(checkInvariant('lines', c, ok)).toEqual([]);
    const bad = { snapshots: [snap(0, 0, frames), snap(1, 4, frames)], error: null, phase: 'run' as const };
    expect(checkInvariant('lines', c, bad)).toHaveLength(2);
  });
});

describe('invariant: js-errors', () => {
  const c = testCase('class Main {}\n');
  const withError = (error: string): InterpreterRun => ({ snapshots: [], error, phase: 'run' });

  it('flags raw JavaScript error text', () => {
    for (const e of ["Cannot read properties of undefined (reading 'kind')", 'Maximum call stack size exceeded', 'x.map is not a function', 'value is [object Object]']) {
      expect(checkInvariant('js-errors', c, withError(e)), e).toHaveLength(1);
    }
  });

  it('accepts Java-level errors', () => {
    for (const e of ['Exception in thread "main" IllegalStateException: Stack full', "Line 4: Variable 'size' is not defined", 'Unknown method: list.add()']) {
      expect(checkInvariant('js-errors', c, withError(e)), e).toEqual([]);
    }
    expect(checkInvariant('js-errors', c, { snapshots: [], error: null, phase: 'run' })).toEqual([]);
  });
});

describe('invariant: scopes', () => {
  const source = [
    'public class Main {',                      // 1
    '  public static void main(String[] args) {', // 2
    '    int total = 0;',                         // 3
    '    for (int n : new int[]{1, 2}) {',        // 4
    '      int doubled = n * 2;',                 // 5
    '      total += doubled;',                    // 6
    '    }',                                      // 7
    '    System.out.println(total);',             // 8
    '  }',                                        // 9
    '}',                                          // 10
  ].join('\n') + '\n';
  const c = testCase(source);
  const main: StackFrame = { name: 'main', variables: [{ name: 'total', value: { type: 'number', value: 0 } }] };
  const block = (...names: string[]): StackFrame => ({
    name: 'for', isBlockScope: true, variables: names.map(name => ({ name, value: { type: 'number', value: 1 } })),
  });
  const check = (...snapshots: ExecutionSnapshot[]) => checkInvariant('scopes', c, { snapshots, error: null, phase: 'run' });

  it('knows where each block-scoped local is in scope', () => {
    const decls = blockScopedDeclarations(source).get('main')!;
    expect(decls).toContainEqual({ name: 'n', from: 4, to: 7 });
    expect(decls).toContainEqual({ name: 'doubled', from: 5, to: 7 });
  });

  it('keys constructors, interface default methods and record constructors the way frames are named', () => {
    const table = blockScopedDeclarations([
      'public class Main {',                                              // 1
      '  interface Named { default String shout() { int k = 1; return ""; } }', // 2
      '  record P(int x) { P { int q = x; } }',                           // 3
      '  Main(int a) {',                                                  // 4
      '    int top = a;',                                                 // 5
      '    try { int t = 1; } catch (RuntimeException e) { }',            // 6
      '  }',                                                              // 7
      '}',                                                                // 8
    ].join('\n'));
    expect(table.get('shout')).toEqual([{ name: 'k', from: 2, to: 2 }]);
    expect(table.get('P')).toEqual([{ name: 'q', from: 3, to: 3 }]);
    expect(table.get('Main')).toEqual([
      { name: 'top', from: 5, to: 7 },
      { name: 't', from: 6, to: 6 },
      { name: 'e', from: 6, to: 6 },
    ]);
  });

  it('keys instance initializer blocks by class name and static blocks as <clinit>', () => {
    const table = blockScopedDeclarations([
      'public class Main {',                                  // 1
      '  static class Bag {',                                 // 2
      '    int[] items;',                                     // 3
      '    { for (int i = 0; i < 2; i++) { int sq = i; } }', // 4
      '  }',                                                  // 5
      '  static { int boot = 1; }',                           // 6
      '}',                                                    // 7
    ].join('\n'));
    expect(table.get('Bag')).toEqual([{ name: 'i', from: 4, to: 4 }, { name: 'sq', from: 4, to: 4 }]);
    expect(table.get('<clinit>')).toEqual([{ name: 'boot', from: 6, to: 6 }]);
  });

  it('accepts block variables on lines where they are in scope', () => {
    expect(check(snap(0, 4, [main, block('n')]), snap(1, 5, [main, block('n', 'doubled')]), snap(2, 8, [main]))).toEqual([]);
  });

  it("flags a body variable still shown at the next iteration's header", () => {
    expect(check(snap(0, 4, [main, block('n', 'doubled')]))[0]).toContain("shows 'doubled'");
  });

  it('flags a loop variable shown after the loop ended', () => {
    expect(check(snap(0, 8, [main, block('n')]))[0]).toContain("shows 'n'");
  });

  it('only checks block frames of the innermost method', () => {
    // A caller's stale-looking block frame sits below the callee: its line is unknown, so it's not judged.
    const callee: StackFrame = { name: 'helper', variables: [] };
    expect(check(snap(0, 8, [main, block('n'), callee]))).toEqual([]);
  });
});

describe('invariant: reachable', () => {
  const c = testCase('class Main {}\n');
  it('flags heap objects nothing points to', () => {
    const s = snap(0, 1, [{ name: 'main', variables: [{ name: 'a', value: { type: 'ref', heapId: '1' } }] }], [
      { id: '1', objectType: 'object', properties: [{ key: 'next', value: { type: 'ref', heapId: '2' } }] },
      { id: '2', objectType: 'object', properties: [] },
      { id: '3', objectType: 'array', label: 'int[]', properties: [] },
    ]);
    const v = checkInvariant('reachable', c, { snapshots: [s], error: null, phase: 'run' });
    expect(v).toHaveLength(1);
    expect(v[0]).toContain('#3 int[]');
    expect(v[0]).not.toContain('#2');
  });

  it("counts a frame's this and the static fields as roots", () => {
    const s = snap(0, 1, [
      { name: 'Static fields', variables: [{ name: 'Main.memo', value: { type: 'ref', heapId: '1' } }] },
      { name: 'main', variables: [] },
      { name: 'Node', variables: [], thisArg: { type: 'ref', heapId: '2' } },
    ], [
      { id: '1', objectType: 'array', label: 'long[]', properties: [] },
      { id: '2', objectType: 'object', label: 'Node', properties: [] },
    ]);
    expect(checkInvariant('reachable', c, { snapshots: [s], error: null, phase: 'run' })).toEqual([]);
  });
});

describe('invariant: statics', () => {
  const source = `public class Main {
  static int moves, depth = 2;
  static class Helper { static int calls; }
  public static void main(String[] args) { moves++; }
}
interface Limits { int MAX = 3; }
`;
  const statics = (...names: string[]): StackFrame => ({
    name: 'Static fields',
    variables: names.map(name => ({ name, value: { type: 'number', value: 0 } })),
  });
  const check = (...callStacks: StackFrame[][]) =>
    checkInvariant('statics', testCase(source), { snapshots: callStacks.map((cs, i) => snap(i, 4, cs)), error: null, phase: 'run' });

  it("finds the entry class's static fields, and whether any class or interface has one", () => {
    expect(staticFieldsOf(source)).toEqual({ entry: ['Main.moves', 'Main.depth'], any: true });
    expect(staticFieldsOf('interface I { int X = 1; }\npublic class Main { public static void main(String[] a) {} }\n'))
      .toEqual({ entry: [], any: true });
    expect(staticFieldsOf('public class Main { int x; public static void main(String[] a) {} }\n')).toEqual({ entry: [], any: false });
  });

  it("passes when every step shows the entry class's static fields first", () => {
    expect(check([statics('Main.moves', 'Main.depth'), { name: 'main', variables: [] }],
      [statics('Main.moves', 'Main.depth', 'Helper.calls'), { name: 'main', variables: [] }])).toEqual([]);
  });

  it('flags a step without the frame, or missing one of the fields', () => {
    const v = check([{ name: 'main', variables: [] }], [statics('Main.moves'), { name: 'main', variables: [] }]);
    expect(v).toEqual([
      'step 0: has no "Static fields" frame first',
      "step 1: doesn't show the static field(s) Main.depth",
    ]);
  });

  it('flags the frame in a program with no static fields', () => {
    const v = checkInvariant('statics', testCase('public class Main { public static void main(String[] a) {} }\n'),
      { snapshots: [snap(0, 1, [statics(), { name: 'main', variables: [] }])], error: null, phase: 'run' });
    expect(v).toEqual(['step 0: shows a "Static fields" frame, but the program has no static fields']);
  });
});

describe('mustFailLoudly', () => {
  it('holds for failures whose main issue is a construct JavaTutor rejects (#6, #15, #16)', () => {
    expect(mustFailLoudly({ issues: [16], reason: 'lambda' })).toBe(true);
    expect(mustFailLoudly({ issues: [15, 21], reason: 'inheritance' })).toBe(true);
    expect(mustFailLoudly({ issues: [6], reason: 'syntax' })).toBe(true);
  });

  it("doesn't hold for other issues, a secondary rejected issue, or no known failure", () => {
    expect(mustFailLoudly({ issues: [21], reason: 'collections' })).toBe(false);
    expect(mustFailLoudly({ issues: [20, 16], reason: 'String.chars()' })).toBe(false);
    expect(mustFailLoudly(undefined)).toBe(false);
  });
});

describe('validateKnownFailures', () => {
  const ids = new Set(['core/a', 'core/b']);
  it('accepts well-formed entries', () => {
    expect(validateKnownFailures({
      output: { 'core/a': { issues: [10], reason: 'long wraps' } },
      invariants: { 'core/b': { scopes: { issues: [9], reason: 'stale' } } },
    }, ids)).toEqual([]);
  });

  it('rejects unknown cases and invariants, and entries without an issue or reason', () => {
    const problems = validateKnownFailures({
      output: { 'core/missing': { issues: [10], reason: 'x' }, 'core/a': { issues: [], reason: '' } },
      invariants: { 'core/b': { ['bogus' as InvariantName]: { issues: [9], reason: 'no such invariant' } } },
    }, ids).join('\n');
    expect(problems).toContain('output.core/missing: no such case');
    expect(problems).toContain('output.core/a: needs "issues"');
    expect(problems).toContain('output.core/a: needs a "reason"');
    expect(problems).toContain('invariants.core/b.bogus: not an enforced invariant');
  });
});
