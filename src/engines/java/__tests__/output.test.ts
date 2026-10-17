/**
 * The two output streams (#22): stdout holds only what the program printed
 * to System.out, and once it writes to stderr (System.err, printStackTrace)
 * each step's console shows both in program order. Stack traces were checked
 * against JDK 21 (whose launcher frames the goldens strip too).
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import type { ExecutionSnapshot } from '../../../types/snapshot';

function run(source: string): ExecutionSnapshot {
  const result = new JavaInterpreter().execute(parseJava(source));
  expect(result.error, 'interpreter error').toBeUndefined();
  return result.snapshots.at(-1)!;
}

const stderrOf = (s: ExecutionSnapshot) => (s.console ?? []).filter(l => l.stream === 'stderr').map(l => l.text);

describe('stderr', () => {
  it('keeps System.err out of stdout, and shows both in order on the console', () => {
    const last = run(`public class Main {
  public static void main(String[] args) {
    System.out.println("out1");
    System.err.println("err1");
    System.err.print("partial ");
    System.err.printf("%d%n", 7);
    System.out.println("out2");
  }
}`);
    expect(last.stdout).toEqual(['out1', 'out2']);
    expect(last.console).toEqual([
      { text: 'out1', stream: 'stdout' },
      { text: 'err1', stream: 'stderr' },
      { text: 'partial 7', stream: 'stderr' },
      { text: 'out2', stream: 'stdout' },
    ]);
  });

  it("isn't added to a program that never writes to stderr", () => {
    expect(run('public class Main {\n  public static void main(String[] args) {\n    System.out.println(1);\n  }\n}').console).toBeUndefined();
  });

  it('shares finished console lines between steps', () => {
    const result = new JavaInterpreter().execute(parseJava(`public class Main {
  public static void main(String[] args) {
    System.err.println("a");
    int x = 1;
    System.out.println("b");
  }
}`));
    // Steps show the state before their line: none before the first write, then the same line objects.
    const [none, first, second, third] = result.snapshots.map(s => s.console);
    expect(none).toBeUndefined();
    expect(second).toBe(first);
    expect(third![0]).toBe(first![0]);
    expect(third).toEqual([{ text: 'a', stream: 'stderr' }, { text: 'b', stream: 'stdout' }]);
  });
});

describe('printStackTrace', () => {
  it('prints the exception and the frames it was created in, to stderr', () => {
    const last = run(`public class Main {
  static void check(int n) {
    if (n < 0) throw new IllegalArgumentException("negative: " + n);
  }
  public static void main(String[] args) {
    try {
      check(-1);
    } catch (IllegalArgumentException e) {
      e.printStackTrace();
    }
    System.out.println("done");
  }
}`);
    expect(last.stdout).toEqual(['done']);
    expect(stderrOf(last)).toEqual(['java.lang.IllegalArgumentException: negative: -1', '\tat Main.check(Main.java:3)', '\tat Main.main(Main.java:7)']);
  });

  it('gives a runtime exception the frames where the runtime raised it', () => {
    const last = run(`public class Main {
  static int divide(int a, int b) { return a / b; }
  public static void main(String[] args) {
    try {
      divide(1, 0);
    } catch (ArithmeticException e) {
      e.printStackTrace();
    }
  }
}`);
    expect(stderrOf(last)).toEqual(['java.lang.ArithmeticException: / by zero', '\tat Main.divide(Main.java:2)', '\tat Main.main(Main.java:5)']);
  });

  it('prints causes, with the frames they share shortened to "... n more"', () => {
    const last = run(`public class Main {
  static class AppException extends RuntimeException {
    AppException(String message, Throwable cause) { super(message, cause); }
  }
  static void parse() { Integer.parseInt("x"); }
  static void load() {
    try {
      parse();
    } catch (NumberFormatException e) {
      throw new AppException("could not load", e);
    }
  }
  public static void main(String[] args) {
    try {
      load();
    } catch (AppException e) {
      e.printStackTrace();
    }
  }
}`);
    expect(stderrOf(last)).toEqual([
      'Main$AppException: could not load',
      '\tat Main.load(Main.java:10)',
      '\tat Main.main(Main.java:15)',
      'Caused by: java.lang.NumberFormatException: For input string: "x"',
      '\tat Main.parse(Main.java:5)',
      '\tat Main.load(Main.java:8)',
      '\t... 1 more',
    ]);
  });
});
