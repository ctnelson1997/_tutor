/**
 * Inheritance (#15): what the steps show of a class chain, and the class
 * model's compile errors. What programs print is in the JDK corpus
 * (extra/inheritance and the oop/ cases); messages, traces and outputs here
 * were checked against JDK 21.
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import type { ExecutionSnapshot, StackFrame } from '../../../types/snapshot';

function run(source: string) {
  const result = new JavaInterpreter().execute(parseJava(source));
  return { ...result, stdout: result.snapshots.at(-1)?.stdout.join('\n') ?? '' };
}

/** Each frame as `name(variables)`, `this` first if the frame has one. */
const frames = (s: ExecutionSnapshot) =>
  s.callStack.map((f: StackFrame) => `${f.name}(${[...(f.thisArg ? ['this'] : []), ...f.variables.map(v => v.name)].join(',')})`).join(' ');

const animals = `public class Main {
  static class Animal {
    String sound = "...";
    String name;
    Animal(String name) {
      this.name = name;
    }
    String describe() {
      return name + " says " + sound();
    }
    String sound() { return sound; }
  }
  static class Dog extends Animal {
    String sound = "Woof";
    Dog(String name) {
      super(name);
    }
    String sound() { return sound + "/" + super.sound(); }
  }
  public static void main(String[] args) {
    Animal a = new Dog("Rex");
    System.out.println(a.describe());
  }
}`;

describe('the steps of a class chain', () => {
  const result = run(animals);

  it('construct as Java does: super(…) in a frame of its own, then the subclass initializers, then its body', () => {
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe('Rex says Woof/...');
    expect(result.snapshots.slice(0, 9).map(s => `${s.line}: ${frames(s)}`)).toEqual([
      '21: main()',
      '15: main() Dog(this,name)',
      '16: main() Dog(this,name)',
      '5: main() Dog(this,name) Animal(this,name)',
      '3: main() Dog(this,name) Animal(this)', // Animal's field initializer, in Animal's constructor
      '6: main() Dog(this,name) Animal(this,name)',
      '7: main() Dog(this,name) Animal(this,name)',
      '14: main() Dog(this)', // then Dog's
      '17: main() Dog(this,name)',
    ]);
  });

  it("draw an object with its whole chain's fields, a hidden one under its class's name", () => {
    const dog = result.snapshots.at(-1)!.heap.find(h => h.label === 'Dog')!;
    expect(dog.properties.map(p => `${p.key}=${p.value.type === 'string' ? p.value.value : p.value.type}`))
      .toEqual(['Animal.sound=...', 'name=Rex', 'sound=Woof']);
  });

  it('label a frame of an inherited method, or one reached through super, with its class', () => {
    const names = new Set(result.snapshots.flatMap(s => s.callStack.map(f => f.name)));
    expect(names).toContain('Animal.describe'); // a Dog runs Animal's describe()
    expect(names).toContain('Animal.sound'); // super.sound()
    expect(names).toContain('sound'); // Dog's own sound()
  });

  it("label a default method's frame with its interface", () => {
    const greet = run(`public class Main {
  interface Greeter {
    String name();
    default String greet() {
      return "Hi " + name();
    }
  }
  static class Ann implements Greeter { public String name() { return "Ann"; } }
  public static void main(String[] args) {
    System.out.println(new Ann().greet());
  }
}`);
    expect(greet.stdout).toBe('Hi Ann');
    expect(greet.snapshots.some(s => s.callStack.some(f => f.name === 'Greeter.greet'))).toBe(true);
  });

  it('trace an exception through the constructors and inherited methods it passed, as java does', () => {
    const ctor = run(`public class Main {
  static class Animal {
    Animal(String name) {
      if (name.isEmpty()) throw new IllegalArgumentException("no name");
    }
  }
  static class Dog extends Animal {
    Dog() {
      super("");
    }
  }
  public static void main(String[] args) {
    new Dog();
  }
}`);
    expect(ctor.failure?.stderr).toBe('Exception in thread "main" java.lang.IllegalArgumentException: no name\n\tat Main$Animal.<init>(Main.java:4)\n\tat Main$Dog.<init>(Main.java:9)\n\tat Main.main(Main.java:13)');
    const inherited = run(`public class Main {
  static class Animal {
    int legs;
    int perLeg(int n) {
      return n / legs;
    }
  }
  static class Fish extends Animal { }
  public static void main(String[] args) {
    System.out.println(new Fish().perLeg(4));
  }
}`);
    expect(inherited.failure?.stderr).toBe('Exception in thread "main" java.lang.ArithmeticException: / by zero\n\tat Main$Animal.perLeg(Main.java:5)\n\tat Main.main(Main.java:10)');
  });

  it("run Object's own methods for super.toString() and super.clone()", () => {
    const result = run(`public class Main {
  static class NC {
    Object copy() throws CloneNotSupportedException { return super.clone(); }
    public String toString() { return "NC:" + super.toString().startsWith("Main$NC@"); }
  }
  public static void main(String[] args) {
    System.out.println(new NC());
    try { new NC().copy(); } catch (CloneNotSupportedException e) { System.out.println(e); }
  }
}`);
    expect(result.stdout).toBe('NC:true\njava.lang.CloneNotSupportedException: Main$NC');
  });
});

describe("the class model's compile errors, before any step", () => {
  it.each([
    ['a cycle', 'static class A extends B { }\n  static class B extends A { }', 'Line 2: cyclic inheritance involving A'],
    ['a final superclass', 'static final class F { }\n  static class G extends F { }', 'Line 3: cannot inherit from final F'],
    ['extending an interface', 'interface I { }\n  static class H extends I { }', 'Line 3: no interface expected here'],
    ['implementing a class', 'static class F { }\n  static class K implements F { }', 'Line 3: interface expected here'],
    ['a missing implementation', 'static abstract class Shape { abstract double area(); }\n  static class Circle extends Shape { }', 'Line 3: Circle is not abstract and does not override abstract method area() in Shape'],
    ['a missing compareTo', 'static class P implements Comparable<P> { }', 'Line 2: P is not abstract and does not override abstract method compareTo(P) in Comparable'],
    ['an abstract method in a class', 'static class Shape { abstract double area(); }', 'Line 2: Shape is not abstract and does not override abstract method area() in Shape'],
    ['no constructor for the implicit super()', 'static class A { A(int x) {} }\n  static class B extends A { }', 'Line 3: constructor A in class A cannot be applied to given types;\n  required: int\n  found:    no arguments'],
    ['calling an abstract method through super', 'static abstract class S { abstract int f(); }\n  static class T extends S { int f() { return super.f(); } }', 'Line 3: abstract method f() in S cannot be accessed directly'],
    ['an incompatible return type', 'static class A { void m() {} }\n  static class B extends A { int m() { return 1; } }', 'Line 3: m() in B cannot override m() in A\n  return type int is not compatible with void'],
  ])('%s', (_name, classes, error) => {
    const result = run(`public class Main {\n  ${classes}\n  public static void main(String[] args) { System.out.println("ran"); }\n}`);
    expect(result.snapshots).toEqual([]);
    expect(result.error).toBe(error);
  });

  it("accepts what javac accepts: an Iterator without remove(), a Comparator without reversed()", () => {
    const result = run(`import java.util.*;
public class Main {
  static class Count implements Iterator<Integer> {
    int n = 0;
    public boolean hasNext() { return n < 2; }
    public Integer next() { return n++; }
  }
  static class ByLength implements Comparator<String> {
    public int compare(String a, String b) { return a.length() - b.length(); }
  }
  public static void main(String[] args) {
    Count c = new Count();
    while (c.hasNext()) System.out.print(c.next());
    List<String> words = new ArrayList<>(List.of("ccc", "a", "bb"));
    words.sort(new ByLength());
    System.out.println(" " + words);
  }
}`);
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe('01 [a, bb, ccc]');
  });
});
