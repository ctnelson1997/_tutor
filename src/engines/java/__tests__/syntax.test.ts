/**
 * Java syntax coverage (#6): every construct the interpreter meets either runs
 * the way Java runs it or stops the program with a message that names the
 * construct and its line. Nothing is skipped silently.
 *
 * Programs whose output matters are also in the JDK differential corpus (e.g.
 * core/switch-forms, core/try-resources-order, oop/static-init-lazy-order);
 * these tests pin down the exact rejection messages and what the steps show
 * (scopes, frames), which the corpus doesn't check. Expected outputs here were
 * checked against real `java` (JDK 21).
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import { UnsupportedFeatureError } from '../errors';
import type { ExecutionSnapshot, StackFrame } from '../../../types/snapshot';

function execute(source: string): { snapshots: ExecutionSnapshot[]; stdout: string; error?: string } {
  const result = new JavaInterpreter().execute(parseJava(source));
  return { ...result, stdout: result.snapshots.at(-1)?.stdout.join('\n') ?? '' };
}

/** A class Main with `body` as main's body and `members` after main. */
function program(body: string, members = ''): string {
  return `public class Main {
  public static void main(String[] args) {
    ${body}
  }
${members}
}`;
}

/** Names of the variables in each frame of a step, e.g. "main(o) if(s)". */
/** Each frame as `name(variables)`, `this` first if the frame has one. */
function frames(snapshot: ExecutionSnapshot): string {
  return snapshot.callStack.map((f: StackFrame) => `${f.name}(${[...(f.thisArg ? ['this'] : []), ...f.variables.map(v => v.name)].join(',')})`).join(' ');
}

function stepsAt(result: { snapshots: ExecutionSnapshot[] }, line: number): ExecutionSnapshot[] {
  return result.snapshots.filter(s => s.line === line);
}

describe('unsupported constructs stop the program with a clear message', () => {
  it.each([
    ['a lambda', program('Runnable r = () -> System.out.println("x");'), "Line 3: Lambda expressions aren't supported in JavaTutor yet"],
    ['a lambda argument', program('java.util.List<String> l = new java.util.ArrayList<>();\n    l.sort((a, b) -> a.length() - b.length());'), "Line 4: Lambda expressions aren't supported in JavaTutor yet"],
    ['a cast lambda', program('Object o = (Runnable) () -> {};'), "Line 3: Lambda expressions aren't supported in JavaTutor yet"],
    ['a method reference', program('java.util.List<String> l = new java.util.ArrayList<>();\n    l.forEach(System.out::println);'), "Line 4: Method references (::) aren't supported in JavaTutor yet"],
    ['a constructor reference', program('Object f = int[]::new;'), "Line 3: Method references (::) aren't supported in JavaTutor yet"],
    ['a primitive class literal', program('Object c = int.class;'), "Line 3: Class literals (.class) aren't supported in JavaTutor yet"],
    ['an anonymous class', program('Object o = new Object() { };'), "Line 3: Anonymous classes aren't supported in JavaTutor yet"],
    ['a nested enum', program('', '  enum Color { RED, GREEN }'), "Line 5: Enums aren't supported in JavaTutor yet"],
    ['a top-level enum', program('') + '\nenum Suit { HEARTS }', "Line 7: Enums aren't supported in JavaTutor yet"],
    ['a nested record', program('', '  record Point(int x, int y) {}'), "Line 5: Records aren't supported in JavaTutor yet"],
    ['a top-level record', program('') + '\nrecord Pair(int a, int b) {}', "Line 7: Records aren't supported in JavaTutor yet"],
    ['an interface default method', program('', '  interface Greeter { default String hi() { return "hi"; } }'), "Line 5: Default methods in interfaces aren't supported in JavaTutor yet"],
    ['inheritance', program('', '  static class A {}\n  static class B extends A {}'), "Line 6: Inheritance (class B extends A) isn't supported in JavaTutor yet"],
    ['extending a library class', program('', '  static class Worker extends Thread {}'), "Line 5: Inheritance (class Worker extends Thread) isn't supported in JavaTutor yet"],
    ['a local class', program('class Helper {}\n    System.out.println("x");'), "Line 3: Classes declared inside a method aren't supported in JavaTutor yet"],
    ['a local enum', program('enum Dir { UP }'), "Line 3: Enums declared inside a method aren't supported in JavaTutor yet"],
    ['a local interface', program('interface Shape {}'), "Line 3: Interfaces declared inside a method aren't supported in JavaTutor yet"],
    ['an annotation type', program('') + '\n@interface Tag {}', "Line 7: Annotation types (@interface) aren't supported in JavaTutor yet"],
    ['a library class JavaTutor lacks', program('Thread t = new Thread();'), "Line 3: The Thread class isn't supported in JavaTutor yet"],
    ['a hexadecimal floating-point literal', program('double d = 0x1.8p1;'), "Line 3: Hexadecimal floating-point literals aren't supported in JavaTutor yet"],
    ['two nested classes with one name', 'public class Main {\n  static class A { static class Node {} }\n  static class B { static class Node {} }\n  public static void main(String[] args) {}\n}', "Line 3: Two classes named Node aren't supported in JavaTutor yet"],
    ['a for-each over a user Iterable', program('for (Object x : new Bag()) {}', '  static class Bag implements Iterable<Object> { public java.util.Iterator<Object> iterator() { return null; } }'), "Line 3: For-each loops over your own Iterable classes aren't supported in JavaTutor yet"],
  ])('rejects %s', (_name, source, message) => {
    expect(execute(source).error).toBe(message);
  });

  it('rejects an inner class using a field of its enclosing object', () => {
    const source = `public class Main {
  int count = 5;
  class Counter { int get() { return count; } }
  void run() { System.out.println(new Counter().get()); }
  public static void main(String[] args) { new Main().run(); }
}`;
    expect(execute(source).error).toBe("Line 3: Inner classes using a field of the enclosing object ('count') aren't supported in JavaTutor yet");
  });

  it('rejects an inner class calling a method of its enclosing object', () => {
    const source = `public class Main {
  int base() { return 1; }
  class Counter { int get() { return base() + 1; } }
  void run() { System.out.println(new Counter().get()); }
  public static void main(String[] args) { new Main().run(); }
}`;
    expect(execute(source).error).toBe("Line 3: Inner classes calling a method of the enclosing object ('base()') aren't supported in JavaTutor yet");
  });

  it('rejects methods outside a class, which Java 21 only allows as a preview feature', () => {
    expect(execute('void main() { System.out.println("x"); }').error).toBe('Line 1: Methods and fields must be declared inside a class');
  });

  it('rejects a declaration before running anything, and a lambda only when it is reached', () => {
    const declaration = execute(program('System.out.println("before");', '  enum E { A }'));
    expect(declaration.snapshots).toHaveLength(0);
    const expression = execute(program('System.out.println("before");\n    Runnable r = () -> {};'));
    expect(expression.stdout).toBe('before');
    expect(expression.error).toContain('Line 4: Lambda expressions');
  });

  it("doesn't run finally blocks when the program stops on an unsupported construct", () => {
    const result = execute(program('try {\n      Runnable r = () -> {};\n    } finally {\n      System.out.println("finally");\n    }'));
    expect(result.error).toContain('Lambda expressions');
    expect(result.stdout).toBe('');
  });

  it('builds messages with the right verb', () => {
    expect(new UnsupportedFeatureError('Enums', 3).message).toBe("Line 3: Enums aren't supported in JavaTutor yet");
    expect(new UnsupportedFeatureError('Qualified this (Outer.this)', 7, true).message).toBe("Line 7: Qualified this (Outer.this) isn't supported in JavaTutor yet");
    expect(new UnsupportedFeatureError('Records', 1).construct).toBe('Records');
  });
});

describe('what the steps show', () => {
  it('scopes an instanceof pattern variable to its if statement', () => {
    const result = execute(program(`Object o = "hi";
    if (o instanceof String s) {
      System.out.println(s.length());
    }
    System.out.println("after");`));
    expect(frames(stepsAt(result, 5)[0])).toBe('main(o) if(s)');
    expect(frames(stepsAt(result, 7)[0])).toBe('main(o)');
  });

  it('keeps a negated pattern variable after an if whose branch returns', () => {
    const result = execute(program('show("text");', `  static void show(Object o) {
    if (!(o instanceof String s)) return;
    System.out.println(s);
  }`));
    expect(result.stdout).toBe('text');
    expect(frames(stepsAt(result, 7)[0])).toBe('main() show(o,s)');
  });

  it('scopes locals declared in a switch block to the switch', () => {
    const result = execute(program(`int x = 1;
    switch (x) {
      case 1:
        int inside = 10;
        System.out.println(inside);
    }
    System.out.println("after");`));
    expect(frames(stepsAt(result, 7)[0])).toBe('main(x) switch(inside)');
    expect(frames(stepsAt(result, 9)[0])).toBe('main(x)');
  });

  it('runs static initializers in a <clinit> frame, lazily for a class other than the entry class', () => {
    const source = `public class Main {
  static int[] squares = new int[3];
  static { for (int i = 0; i < 3; i++) squares[i] = i * i; }
  static class Later {
    static int value;
    static { value = 7; }
  }
  public static void main(String[] args) {
    System.out.println(squares[2]);
    System.out.println(Later.value);
  }
}`;
    const result = execute(source);
    expect(result.stdout).toBe('4\n7');
    expect(frames(result.snapshots[0])).toBe('Static fields(Main.squares) <clinit>() for(i)');
    // Later's static field appears once Later is initialized, at its first use.
    expect(frames(stepsAt(result, 6)[0])).toBe('Static fields(Main.squares,Later.value) main() <clinit>()');
  });

  it("runs instance initializers in the constructor's frame, without its parameters", () => {
    const source = program('Box b = new Box(2);\n    System.out.println(b.size);', `  static class Box {
    int size;
    { size = 5; }
    Box(int extra) { size += extra; }
  }`);
    const result = execute(source);
    expect(result.stdout).toBe('7');
    expect(frames(stepsAt(result, 8)[0])).toBe('main() Box(this)');
    expect(frames(stepsAt(result, 9)[0])).toBe('main() Box(this,extra)');
  });

  it('shows a constructor called with this(…) as its own frame', () => {
    const source = program('new Point();', `  static class Point {
    int x;
    Point() { this(4); }
    Point(int x) { this.x = x; }
  }`);
    const result = execute(source);
    expect(frames(stepsAt(result, 8)[0])).toBe('main() Point(this) Point(this,x)');
  });

  it("binds main's args only when main uses it", () => {
    const unused = execute(program('System.out.println("hi");'));
    expect(unused.snapshots.every(s => s.callStack[0].variables.length === 0)).toBe(true);
    const used = execute(program('System.out.println(args.length);'));
    const args = used.snapshots[0].callStack[0].variables.find(v => v.name === 'args');
    expect(args?.value.type).toBe('ref');
    const array = used.snapshots[0].heap.find(h => args?.value.type === 'ref' && h.id === args.value.heapId);
    expect(array).toMatchObject({ objectType: 'array', label: 'String[]', properties: [] });
  });

  it('leaves no loop scopes behind after a labeled break', () => {
    const result = execute(program(`outer:
    for (int i = 0; i < 3; i++) {
      for (int j = 0; j < 3; j++) {
        if (j == 1) break outer;
      }
    }
    System.out.println("done");`));
    expect(frames(stepsAt(result, 9)[0])).toBe('main()');
  });

  it('shows try-with-resources variables only inside the try block', () => {
    const result = execute(program(`try (java.util.Scanner sc = new java.util.Scanner("5")) {
      System.out.println(sc.nextInt());
    } finally {
      System.out.println("finally");
    }`));
    expect(frames(stepsAt(result, 4)[0])).toBe('main() try(sc)');
    expect(frames(stepsAt(result, 6)[0])).toBe('main()');
  });

  it('gives a step to an assert without evaluating it', () => {
    const result = execute(program('assert 1 / 0 == 0;\n    System.out.println("ok");'));
    expect(result.error).toBeUndefined();
    expect(stepsAt(result, 3)).toHaveLength(1);
  });
});

describe('class initialization happens where Java does it', () => {
  const source = `public class Main {
  static int log(String s) { System.out.println(s); return 1; }
  static class Helper {
    static { log("Helper init"); }
    Helper(int x) { log("Helper ctor"); }
  }
  static class Target {
    static int x;
    static { log("Target init"); }
  }
  static class Self {
    static int a = Self.b + 1;
    static int b = 5;
  }
  public static void main(String[] args) {
    new Helper(log("argument"));
    Target.x = log("right-hand side");
    System.out.println(Target.x);
    System.out.println(Self.a + " " + Self.b);
  }
}`;

  it('initializes a class before new evaluates its arguments, and after the right-hand side of a static field assignment', () => {
    const result = execute(source);
    expect(result.error).toBeUndefined();
    // A static field read while its class initializes still has its default value (b is 0 when a is computed).
    expect(result.stdout).toBe('Helper init\nargument\nHelper ctor\nright-hand side\nTarget init\n1\n1 5');
  });
});
