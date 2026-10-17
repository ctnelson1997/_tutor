/**
 * Enums, records, inner, local and anonymous classes, lambdas and method
 * references (#16): what the steps show of them, and their compile errors.
 * What programs using them print is in the JDK corpus
 * (extra/lambdas-enums-records and the #16 cases); messages here were
 * checked against javac 21.
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import type { ExecutionSnapshot, HeapObject, StackFrame } from '../../../types/snapshot';

function run(source: string) {
  const result = new JavaInterpreter().execute(parseJava(source));
  return { ...result, stdout: result.snapshots.at(-1)?.stdout.join('\n') ?? '' };
}

const frames = (s: ExecutionSnapshot) =>
  s.callStack.map((f: StackFrame) => `${f.name}(${[...(f.thisArg ? ['this'] : []), ...f.variables.map(v => v.name)].join(',')})`).join(' ');

const heapLabel = (s: ExecutionSnapshot, label: string): HeapObject | undefined => s.heap.find(h => h.label === label);

const program = (body: string, members = '') => `import java.util.*;
import java.util.function.*;
import java.util.stream.*;
public class Main {
${members}
  public static void main(String[] args) {
    ${body}
  }
}`;

describe('lambdas', () => {
  const result = run(program(`int bonus = 5;
    Function<Integer, Integer> add = n -> n + bonus;
    int r = add.apply(2);
    List<Integer> nums = List.of(1, 2);
    nums.forEach(n -> System.out.print(n));
    nums.forEach(System.out::print);`));

  it('are function objects drawn as their source with the values they captured', () => {
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe('1212');
    const fn = result.snapshots.at(-1)!.heap.find(h => h.objectType === 'function')!;
    expect(fn.label).toBe('n -> n + bonus');
    expect(fn.properties).toEqual([{ key: 'bonus', value: { type: 'number', value: 5 } }]);
  });

  it('run in a frame named as javac names it, showing what they captured and their parameters, then their result', () => {
    const inLambda = result.snapshots.filter(s => s.callStack.some(f => f.name === 'lambda$main$0'));
    expect(inLambda.map(s => `${s.line}: ${frames(s)}`)).toEqual([
      '8: main(bonus,add) lambda$main$0(bonus,n)',
      '8: main(bonus,add) lambda$main$0(bonus,n,return ↵)',
    ]);
  });

  it('take steps when the library calls them (forEach), as pythontutor.com shows such calls', () => {
    const calls = result.snapshots.filter(s => s.callStack.some(f => f.name === 'lambda$main$1'));
    expect(calls.map(s => s.callStack.at(-1)!.variables.map(v => v.value))).toEqual([
      [{ type: 'number', value: 1 }], [{ type: 'number', value: 1 }],
      [{ type: 'number', value: 2 }], [{ type: 'number', value: 2 }],
    ]);
  });

  it("show a method reference as the method it calls, without a frame of its own", () => {
    expect(result.snapshots.some(s => s.callStack.some(f => f.name.includes('::')))).toBe(false);
  });

  it('run a stream lazily: each element goes through every stage before the next', () => {
    const lazy = run(program('List<String> log = new ArrayList<>();\n    Stream.of(1, 2).filter(x -> log.add("f" + x)).map(x -> log.add("m" + x)).count();\n    System.out.println(log);'));
    expect(lazy.stdout).toBe('[f1, m1, f2, m2]');
    const order = lazy.snapshots.map(s => s.callStack.at(-1)!.name).filter((n, i, all) => n.startsWith('lambda') && n !== all[i - 1]);
    expect(order).toEqual(['lambda$main$0', 'lambda$main$1', 'lambda$main$0', 'lambda$main$1']);
  });
});

describe('enums', () => {
  it('draw a constant with its name and fields, and keep the constants out of the static fields frame', () => {
    const result = run(program('Planet p = Planet.EARTH;\n    Planet[] all = Planet.values();', `  enum Planet {
    MERCURY(1), EARTH(2);
    final int order;
    Planet(int order) { this.order = order; }
  }`));
    expect(result.error).toBeUndefined();
    const last = result.snapshots.at(-1)!;
    expect(heapLabel(last, 'Planet.EARTH')!.properties).toEqual([{ key: 'order', value: { type: 'number', value: 2 } }]);
    expect(heapLabel(last, 'Planet[]')!.properties).toHaveLength(2);
    expect(last.callStack[0].name).toBe('main');
    // The constants are made in the enum's <clinit>, each by its constructor.
    expect(result.snapshots.filter(s => s.callStack.some(f => f.name === 'Planet')).length).toBeGreaterThan(0);
  });
});

describe('records', () => {
  it('draw their components as fields, and take no steps for what javac generates', () => {
    const result = run(program('Pt p = new Pt(1, 2);\n    int x = p.x();\n    String s = p.toString();', '  record Pt(int x, int y) {}'));
    expect(result.error).toBeUndefined();
    expect(heapLabel(result.snapshots.at(-1)!, 'Pt')!.properties.map(p => p.key)).toEqual(['x', 'y']);
    expect(result.snapshots.every(s => s.callStack.length === 1)).toBe(true);
  });

  it('run a compact constructor, then assign the components', () => {
    const result = run(program('Pt p = new Pt(-3, 2);', '  record Pt(int x, int y) {\n    Pt {\n      x = Math.abs(x);\n    }\n  }'));
    const fields = heapLabel(result.snapshots.at(-1)!, 'Pt')!.properties.map(p => (p.value as { value: number }).value);
    expect(fields).toEqual([3, 2]);
    expect(result.snapshots.some(s => s.callStack.some(f => f.name === 'Pt'))).toBe(true);
  });
});

describe('inner, local and anonymous classes', () => {
  const result = run(program(`int bonus = 5;
    Main m = new Main();
    Inner in = m.new Inner();
    int got = in.get();
    class Scorer { int score(int base) { return base + bonus; } }
    int s = new Scorer().score(1);
    Runnable r = new Runnable() {
      public void run() { System.out.println(bonus + got + s); }
    };
    r.run();`, `  int base = 10;
  class Inner {
    int get() { return base; }
  }`));

  it('give an inner object its enclosing instance as this$0', () => {
    expect(result.error).toBeUndefined();
    const last = result.snapshots.at(-1)!;
    const main = heapLabel(last, 'Main')!;
    expect(heapLabel(last, 'Inner')!.properties).toEqual([{ key: 'this$0', value: { type: 'ref', heapId: main.id } }]);
  });

  it("copy the locals a local or anonymous class reads into its object, as javac's val$ fields", () => {
    const last = result.snapshots.at(-1)!;
    expect(heapLabel(last, 'Main$1')!.properties.map(p => p.key).sort()).toEqual(['val$bonus', 'val$got', 'val$s']);
    expect(result.stdout).toBe('21');
  });

  it("number anonymous classes as javac does (Main$1), and name local ones' objects by class", () => {
    expect(result.snapshots.some(s => s.callStack.some(f => f.name === 'score'))).toBe(true);
    expect(result.snapshots.some(s => s.callStack.some(f => f.name === 'run' && f.thisArg))).toBe(true);
  });
});

describe("#16's compile errors, before any step", () => {
  it.each([
    ['a captured local assigned later', 'int n = 1;\n    Runnable r = () -> System.out.println(n);\n    n = 2;', 'Line 8: local variables referenced from a lambda expression must be final or effectively final'],
    ['an inner class capturing a changed local', 'int n = 0;\n    Runnable r = new Runnable() { public void run() { System.out.println(n); } };\n    n++;', 'Line 8: local variables referenced from an inner class must be final or effectively final'],
    ['a lambda for var', 'var f = () -> 1;', "Line 7: cannot infer type for local variable f\n  (lambda expression needs an explicit target-type)"],
    ['a lambda for Object', 'Object o = () -> 1;', 'Line 7: incompatible types: Object is not a functional interface'],
    ['a lambda with the wrong parameters', 'Function<Integer, Integer> f = (a, b) -> a;', 'Line 7: incompatible types: incompatible parameter types in lambda expression'],
    ['a lambda returning the wrong type', 'Supplier<String> s = () -> 5;', 'Line 7: incompatible types: bad return type in lambda expression\n    int cannot be converted to String'],
    ['a value for a void interface', 'Runnable r = () -> 5;', 'Line 7: incompatible types: lambda body is not compatible with a void functional interface\n    (consider using a block lambda body, or use a statement expression instead)'],
    ['an anonymous class missing a method', 'Runnable r = new Runnable() { };', 'Line 7: <anonymous Main$1> is not abstract and does not override abstract method run() in Runnable'],
  ])('%s', (_name, body, error) => {
    const result = run(program(body));
    expect(result.snapshots).toEqual([]);
    expect(result.error).toBe(error);
  });

  it.each([
    ['an enum instantiated', '  enum C { A }\n  static void f() { C c = new C(); }', 'Line 6: enum classes may not be instantiated'],
    ['an inner class made without an enclosing instance', '  class In {}\n  static void f() { In i = new In(); }', 'Line 6: non-static variable this cannot be referenced from a static context'],
    ["an enum constant body missing the enum's abstract method", '  enum Op { PLUS { }; abstract int apply(); }', 'Line 5: <anonymous Main$Op$1> is not abstract and does not override abstract method apply() in Op'],
  ])('%s', (_name, members, error) => {
    const result = run(program('', members));
    expect(result.snapshots).toEqual([]);
    expect(result.error).toBe(error);
  });
});
