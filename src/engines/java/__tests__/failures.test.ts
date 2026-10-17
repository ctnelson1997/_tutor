/**
 * Runs that end early (#7): an uncaught exception, the step or time limit, an
 * unsupported construct or an engine failure all keep the steps recorded up
 * to that point, and report the reason with a line. Stack traces and messages
 * were checked against real `java` (JDK 21).
 */
import { describe, it, expect, vi } from 'vitest';
import { runJava } from '../run';
import { parseJava, describeParseError } from '../parser';
import { JavaInterpreter } from '../interpreter';
import { Evaluator } from '../eval/evaluator';
import type { ExecutionSnapshot, RunError, WorkerMessage } from '../../../types/snapshot';

function result(message: WorkerMessage): { snapshots: ExecutionSnapshot[]; error?: RunError } {
  if (message.type !== 'result') throw new Error(`expected a result, got: ${message.message}`);
  return message;
}

const frameNames = (s: ExecutionSnapshot) => s.callStack.filter(f => !f.isBlockScope).map(f => f.name);

describe('an uncaught exception', () => {
  const divide = `public class Main {
  static int divide(int a, int b) {
    return a / b;
  }
  public static void main(String[] args) {
    System.out.println("start");
    int total = divide(10, 0);
    System.out.println(total);
  }
}`;

  it('keeps every step, ending with one where it was thrown', () => {
    const { snapshots } = result(runJava(divide));
    const last = snapshots[snapshots.length - 1];
    expect(last.line).toBe(3);
    expect(frameNames(last)).toEqual(['main', 'divide']);
    expect(last.stdout).toEqual(['start']);
  });

  it('is reported the way java reports it, stack trace included', () => {
    expect(result(runJava(divide)).error).toEqual({
      kind: 'exception',
      message: 'java.lang.ArithmeticException: / by zero',
      line: 3,
      stderr: 'Exception in thread "main" java.lang.ArithmeticException: / by zero\n\tat Main.divide(Main.java:3)\n\tat Main.main(Main.java:7)',
    });
  });

  it('names nested exception classes and constructors as java does', () => {
    const source = `public class Main {
  static class Oops extends RuntimeException {
    Oops(String m) { super(m); }
  }
  static class Point {
    Point() { throw new Oops("in constructor"); }
  }
  public static void main(String[] args) {
    new Point();
  }
}`;
    expect(result(runJava(source)).error).toEqual({
      kind: 'exception',
      message: 'Main$Oops: in constructor',
      line: 6,
      stderr: 'Exception in thread "main" Main$Oops: in constructor\n\tat Main$Point.<init>(Main.java:6)\n\tat Main.main(Main.java:9)',
    });
  });

  it('uses a user exception class\'s own toString()', () => {
    const source = `public class Main {
  static class Fail extends RuntimeException {
    public String toString() { return "custom failure"; }
  }
  public static void main(String[] args) {
    throw new Fail();
  }
}`;
    const { error } = result(runJava(source));
    expect(error?.message).toBe('custom failure');
    expect(error?.stderr?.split('\n')[0]).toBe('Exception in thread "main" custom failure');
  });

  it('gives a library error the line of the call that raised it', () => {
    const source = `import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner("");
    int n = in.nextInt();
  }
}`;
    expect(result(runJava(source)).error).toMatchObject({ kind: 'exception', message: 'java.util.NoSuchElementException', line: 5 });
  });

  it('becomes a catchable StackOverflowError when recursion is too deep, with a trimmed trace', () => {
    const source = `public class Main {
  static int f(int n) { return f(n + 1) + 1; }
  public static void main(String[] args) {
    f(0);
  }
}`;
    const { error } = result(runJava(source));
    expect(error?.kind).toBe('exception');
    expect(error?.message).toBe('java.lang.StackOverflowError');
    const trace = error!.stderr!.split('\n');
    expect(trace[0]).toBe('Exception in thread "main" java.lang.StackOverflowError');
    expect(trace[1]).toBe('\tat Main.f(Main.java:2)');
    expect(trace[trace.length - 1]).toMatch(/^\t\.\.\. \d+ more$/);
    expect(trace.length).toBeLessThanOrEqual(66);
  });
});

describe('a caught exception raised by the runtime', () => {
  it("shows the throwing method's frame at the throwing line, then the catch", () => {
    const source = `public class Main {
  static int divide(int a, int b) { return a / b; }
  public static void main(String[] args) {
    int total;
    try {
      total = divide(10, 0);
    } catch (ArithmeticException e) {
      total = -1;
    }
    System.out.println(total);
  }
}`;
    const { snapshots, error } = result(runJava(source));
    expect(error).toBeUndefined();
    const throwSite = snapshots.findIndex(s => s.line === 2 && frameNames(s).includes('divide'));
    expect(throwSite).toBeGreaterThan(-1);
    expect(snapshots[throwSite + 1].line).toBe(8);
    expect(frameNames(snapshots[throwSite + 1])).toEqual(['main']);
    expect(snapshots[snapshots.length - 1].stdout).toEqual(['-1']);
  });
});

describe('the step and time limits', () => {
  const longLoop = `public class Main {
  public static void main(String[] args) {
    int x = 0;
    for (int i = 0; i < 3000; i++) {
      x++;
    }
    System.out.println(x);
  }
}`;

  it('shows the first 5000 steps of a long loop, with a notice', () => {
    const { snapshots, error } = result(runJava(longLoop));
    expect(snapshots).toHaveLength(5000);
    expect(error).toMatchObject({
      kind: 'limit',
      message: 'Stopped after 5000 steps, the most that can be shown. Your code may contain an infinite loop.',
    });
    expect(error?.line).toBeGreaterThan(0);
  });

  it('can be lowered', () => {
    const { snapshots, error } = result(runJava(longLoop, '', { maxSteps: 10 }));
    expect(snapshots).toHaveLength(10);
    expect(error?.message).toContain('Stopped after 10 steps');
  });

  it('stops endless work that records no steps, like a loop inside toString()', () => {
    const source = `public class Main {
  static class Spin {
    public String toString() {
      int n = 0;
      while (true) { n++; }
    }
  }
  public static void main(String[] args) {
    System.out.println("before");
    System.out.println(new Spin());
  }
}`;
    const { snapshots, error } = result(runJava(source, '', { maxWork: 5000 }));
    expect(error).toMatchObject({ kind: 'limit' });
    expect(error?.message).toContain('Stopped after 5,000 steps of work');
    expect(snapshots[snapshots.length - 1].stdout).toEqual(['before']);
  });

  it('stops a run close to the time limit, keeping its steps', () => {
    const { snapshots, error } = result(runJava(longLoop.replace('3000', '100000000'), '', { maxSteps: 1e9, maxWork: 1e9, timeBudgetMs: 1 }));
    expect(error?.kind).toBe('limit');
    expect(error?.message).toMatch(/^Stopped after 0\.001 seconds/);
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it('runs no finally block when a limit stops the program', () => {
    const source = `public class Main {
  public static void main(String[] args) {
    try {
      while (true) { }
    } finally {
      System.out.println("finally");
    }
  }
}`;
    const { snapshots, error } = result(runJava(source, '', { maxSteps: 20 }));
    expect(error?.kind).toBe('limit');
    expect(snapshots[snapshots.length - 1].stdout).toEqual([]);
  });
});

describe('errors from the engine', () => {
  it('name a line, even when the error itself has none', () => {
    const source = `public class Main {
  public static void main(String[] args) {
    System.out.println("ok");
    boolean b = "aaa".matches("a++");
  }
}`;
    const { snapshots, error } = result(runJava(source));
    expect(error).toEqual({ kind: 'error', message: "Regular expressions with possessive quantifiers (a*+) aren't supported in JavaTutor yet", line: 4 });
    expect(snapshots[snapshots.length - 1].stdout).toEqual(['ok']);
  });

  it('report an unsupported declaration before any step', () => {
    const source = 'public class Main {\n  @interface Tag {}\n  public static void main(String[] args) {}\n}';
    expect(runJava(source)).toEqual({
      type: 'result',
      snapshots: [],
      error: { kind: 'error', message: "Annotation types (@interface) aren't supported in JavaTutor yet", line: 2 },
    });
  });

  it('hide the JavaScript text of an internal failure from the student, keeping it for tests', () => {
    // An engine bug: the evaluator's library dispatch throws a JavaScript error.
    const spy = vi.spyOn(Evaluator.prototype as unknown as { stdlib: () => never }, 'stdlib').mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'x')");
    });
    const outcome = (() => {
      try {
        return new JavaInterpreter().execute(parseJava('public class Main {\n  public static void main(String[] args) {\n    "a".length();\n  }\n}'));
      } finally {
        spy.mockRestore();
      }
    })();
    expect(outcome.failure).toEqual({ kind: 'error', message: 'Internal JavaTutor error (please report it)', line: 3 });
    expect(outcome.error).toContain('Cannot read properties of undefined');
  });

  it('are absent from a run that ends normally, by returning, or by System.exit', () => {
    for (const body of ['System.out.println(1);', 'return;', 'System.exit(0);']) {
      const message = result(runJava(`public class Main {\n  public static void main(String[] args) {\n    ${body}\n  }\n}`));
      expect(message.error).toBeUndefined();
    }
  });
});

describe('parse errors', () => {
  it('put a missing semicolon on the line it belongs at the end of, as javac does', () => {
    const source = 'public class Main {\n  public static void main(String[] args) {\n    int x = 5\n    System.out.println(x);\n  }\n}';
    expect(runJava(source)).toEqual({ type: 'error', message: "Syntax error: expected ';' but found 'System'", line: 3 });
  });

  it('describe code that ends too early without a line', () => {
    expect(runJava('public class Main {\n  void f() {\n')).toEqual({ type: 'error', message: "Syntax error: expected '}' but found the end of the code" });
  });

  it('turn java-parser\'s message into something readable', () => {
    const raw = "Sad sad panda, parsing errors detected in line: 2, column: 7!\nExpecting --> ')' <-- but found --> ';' <--!\n\t->compilationUnit";
    expect(describeParseError(raw, 'class A {\n  f(1;\n}')).toEqual({ message: "Syntax error: expected ')' but found ';'", line: 2 });
  });
});
