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

describe("Throwable's state (#64), traces checked against JDK 21's javac and java", () => {
  const program = `public class Main {
  static class Validation extends RuntimeException {
    private final int age;
    Validation(int age) { this.age = age; }
    @Override public String getMessage() { return "age must be positive but was " + age; }
  }
  static class Res implements AutoCloseable {
    final String name;
    Res(String name) { this.name = name; }
    public void close() { throw new IllegalStateException("close " + name); }
  }
  static void load() {
    throw new IllegalArgumentException("missing");
  }
  static void wrap() {
    try {
      load();
    } catch (IllegalArgumentException e) {
      throw new RuntimeException("load failed", e);
    }
  }
  public static void main(String[] args) {
    try {
      wrap();
    } catch (RuntimeException e) {
      e.printStackTrace();
    }
    try (Res a = new Res("a"); Res b = new Res("b")) {
      throw new Validation(-3);
    } catch (Validation e) {
      e.printStackTrace();
    }
    wrap();
  }
}`;
  const caused = (mainLine: number) => [
    'java.lang.RuntimeException: load failed',
    '\tat Main.wrap(Main.java:19)',
    `\tat Main.main(Main.java:${mainLine})`,
    'Caused by: java.lang.IllegalArgumentException: missing',
    '\tat Main.load(Main.java:13)',
    '\tat Main.wrap(Main.java:17)',
    '\t... 1 more',
  ];

  it('prints causes, suppressed exceptions and an overridden getMessage() in printStackTrace and the uncaught trace', () => {
    const result = new JavaInterpreter().execute(parseJava(program));
    expect(stderrOf(result.snapshots.at(-1)!)).toEqual([
      ...caused(24),
      'Main$Validation: age must be positive but was -3',
      '\tat Main.main(Main.java:29)',
      '\tSuppressed: java.lang.IllegalStateException: close b',
      '\t\tat Main$Res.close(Main.java:10)',
      '\t\tat Main.main(Main.java:28)',
      '\tSuppressed: java.lang.IllegalStateException: close a',
      '\t\tat Main$Res.close(Main.java:10)',
      '\t\tat Main.main(Main.java:28)',
    ]);
    expect(result.failure?.stderr).toBe(['Exception in thread "main" ' + caused(33)[0], ...caused(33).slice(1)].join('\n'));
  });

  it("keeps the detail message apart from a program's own fields, and makes a cause's message its toString()", () => {
    const last = run(`public class Main {
  static class BadEx extends Exception { private String msg; BadEx(String msg) { this.msg = msg; } }
  static class OtherEx extends RuntimeException { private String message; OtherEx(String m) { super(m); message = "field"; } }
  public static void main(String[] args) {
    RuntimeException w = new RuntimeException(new IllegalStateException("inner"));
    System.out.println(w.getMessage() + " | " + w.getCause().getMessage() + " | " + w);
    System.out.println(new Exception("load failed", new ArrayIndexOutOfBoundsException("x")).getCause());
    System.out.println(new BadEx("oops").getMessage() + " " + new OtherEx("detail").getMessage() + " " + new OtherEx("d").message);
    Exception e = new Exception("top");
    e.addSuppressed(new RuntimeException("s1"));
    System.out.println(e.getSuppressed().length + " " + e.getSuppressed()[0]);
    try { new Exception("c", null).initCause(new Error("z")); } catch (IllegalStateException x) { System.out.println(x.getMessage()); }
  }
}`);
    expect(last.stdout).toEqual([
      'java.lang.IllegalStateException: inner | inner | java.lang.RuntimeException: java.lang.IllegalStateException: inner',
      'java.lang.ArrayIndexOutOfBoundsException: x',
      'null detail field',
      '1 java.lang.RuntimeException: s1',
      "Can't overwrite cause with java.lang.Error: z",
    ]);
  });

  it("draws Throwable's message and cause first, and a program's field of the same name beside Throwable's", () => {
    const last = run(`public class Main {
  static class OtherEx extends RuntimeException { private String message; OtherEx(String m, Throwable c) { super(m, c); message = "field"; } }
  public static void main(String[] args) {
    Exception inner = new IllegalStateException("inner");
    OtherEx e = new OtherEx("detail", inner);
    e.addSuppressed(new Error("s"));
    System.out.println(e.getMessage());
  }
}`);
    const drawn = (label: string) => last.heap.find(o => o.label === label)!.properties.map(p => `${p.key}=${p.value.type === 'ref' ? 'ref' : JSON.stringify(p.value.value)}`);
    expect(drawn('OtherEx')).toEqual(['Throwable.message="detail"', 'cause=ref', 'suppressed[0]=ref', 'message="field"']);
    expect(drawn('IllegalStateException')).toEqual(['message="inner"']);
    expect(drawn('Error')).toEqual(['message="s"']);
  });
});
