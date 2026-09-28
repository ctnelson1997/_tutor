/**
 * Assignment targets and the reference model (#5).
 *
 * Every shape of assignment target is written with `=`, a compound operator,
 * and prefix and postfix `++`/`--`. Each program also prints "witness" values
 * that show no other variable was written, and counts calls to show that a
 * target's subexpressions run once per operation. Every expected output here
 * was checked against real `java` (JDK 21).
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import { InterpreterError, JavaRuntimeError } from '../errors';
import {
  assignmentConversion,
  slotReference,
  fieldReference,
  arrayElementReference,
  arrayLength,
} from '../references';
import { type JavaHeapEntry, javaInt, javaDouble, javaChar, javaNull, javaString } from '../types';

function run(source: string): { stdout: string; error?: string; line?: number } {
  const result = new JavaInterpreter().execute(parseJava(source));
  return { stdout: result.snapshots.at(-1)?.stdout.join('\n') ?? '', error: result.error, line: result.failure?.line };
}

function expectOutput(source: string, expected: string) {
  const result = run(source);
  expect(result.error, 'interpreter error').toBeUndefined();
  expect(result.stdout).toBe(expected);
}

// ── Every target shape × `=`, `+=`, prefix `++`, postfix `--` ──

interface Shape {
  name: string;
  target: string;
  setup?: string;
  /** Printed after the operations: neighbors that must be unchanged, or a call count. */
  witness?: string;
  expectedWitness?: string;
  context?: 'instance' | 'parameter';
}

const SHAPES: Shape[] = [
  { name: 'local variable', target: 'x', setup: 'int x = 1; int y = 1;', witness: 'y', expectedWitness: '1' },
  { name: 'parameter', target: 'p', context: 'parameter' },
  { name: 'static field', target: 's', witness: 'Main.t', expectedWitness: '1' },
  { name: 'qualified static field', target: 'Main.s', witness: 'Main.t', expectedWitness: '1' },
  { name: "another class's static field", target: 'Counter.n', witness: 's', expectedWitness: '1' },
  { name: 'field of a local', target: 'o.v', setup: 'Node o = new Node(); Node other = new Node();', witness: 'other.v', expectedWitness: '1' },
  { name: 'explicit this field', target: 'this.v', context: 'instance', witness: 'this.w', expectedWitness: '1' },
  { name: 'implicit this field', target: 'v', context: 'instance', witness: 'w', expectedWitness: '1' },
  { name: 'this field chain', target: 'this.next.v', context: 'instance', witness: 'this.v', expectedWitness: '1' },
  { name: 'array element', target: 'a[1]', setup: 'int[] a = {1, 1, 1};', witness: 'a[0] + " " + a[2]', expectedWitness: '1 1' },
  { name: '2D array element', target: 'm[1][2]', setup: 'int[][] m = {{1, 1, 1}, {1, 1, 1}};', witness: 'm[0][2] + " " + m[1][1]', expectedWitness: '1 1' },
  { name: 'array element of a field', target: 'o.arr[1]', setup: 'Node o = new Node();', witness: 'o.arr[0] + " " + o.v', expectedWitness: '1 1' },
  { name: 'field of an array element', target: 'nodes[1].v', setup: 'Node[] nodes = {new Node(), new Node()};', witness: 'nodes[0].v', expectedWitness: '1' },
  { name: 'three-part chain', target: 'a.next.next.v', setup: 'Node a = new Node(); a.next = new Node(); a.next.next = new Node();', witness: 'a.v + " " + a.next.v', expectedWitness: '1 1' },
  { name: 'static field chain', target: 'Main.shared.v', witness: 's', expectedWitness: '1' },
  { name: 'field of a method result', target: 'pick().v', witness: 'calls', expectedWitness: '5' },
  { name: 'element of a method result', target: 'o.getArr()[1]', setup: 'Node o = new Node();', witness: 'o.arr[0] + " " + calls', expectedWitness: '1 5' },
  { name: 'element with a side-effecting index', target: 'a[index()]', setup: 'int[] a = {1, 1, 1};', witness: 'a[0] + " " + a[2] + " " + calls', expectedWitness: '1 1 5' },
  { name: 'parenthesized variable', target: '(x)', setup: 'int x = 1;' },
];

function shapeProgram(s: Shape): string {
  const statements = [
    `System.out.println(${s.target} = 5);`,
    `System.out.println(${s.target} += 3);`,
    `System.out.println(++${s.target});`,
    `System.out.println(${s.target}--);`,
    `System.out.println(${s.target});`,
    ...(s.witness ? [`System.out.println(${s.witness});`] : []),
  ].join('\n      ');
  return `public class Main {
  static int s = 1, t = 1, calls = 0;
  static Node shared = new Node();
  static Node picked = new Node();
  static class Counter { static int n = 1; }
  static class Node {
    int v = 1, w = 1;
    int[] arr = {1, 1, 1};
    Node next;
    int[] getArr() { calls++; return arr; }
    void run() {
      ${s.context === 'instance' ? statements : ''}
    }
  }
  static Node pick() { calls++; return picked; }
  static int index() { calls++; return 1; }
  static void withParam(int p) {
      ${s.context === 'parameter' ? statements : ''}
  }
  public static void main(String[] args) {
      ${s.setup ?? ''}
      ${s.context === 'instance' ? 'Node n = new Node(); n.next = new Node(); n.run();'
        : s.context === 'parameter' ? 'withParam(1);' : statements}
  }
}`;
}

describe('assignment targets: =, +=, prefix ++ and postfix -- on every shape', () => {
  it.each(SHAPES)('$name', (shape) => {
    const expected = ['5', '8', '9', '9', '8', ...(shape.expectedWitness ? [shape.expectedWitness] : [])].join('\n');
    expectOutput(shapeProgram(shape), expected);
  });
});

// ── Evaluation order (JLS §15.26) ──

describe('evaluation order', () => {
  it('evaluates array, index, then value, and checks null and bounds at the right moment', () => expectOutput(`
public class Main {
  static int[] arr = new int[3];
  static StringBuilder log = new StringBuilder();
  static int[] a() { log.append("a "); return arr; }
  static int i() { log.append("i "); return 1; }
  static int e() { log.append("e "); return 7; }
  static int rhs() { log.append("rhs "); return 1; }
  static class Node { int v; }
  public static void main(String[] args) {
    a()[i()] = e();
    System.out.println(log + "| " + arr[1]);
    log.setLength(0);
    a()[i()] += e();
    System.out.println(log + "| " + arr[1]);
    log.setLength(0);
    try { arr[5] = rhs(); } catch (ArrayIndexOutOfBoundsException ex) { log.append("AIOOBE"); }
    System.out.println(log);
    log.setLength(0);
    try { arr[5] += rhs(); } catch (ArrayIndexOutOfBoundsException ex) { log.append("AIOOBE"); }
    System.out.println(log);
    Node n = null;
    log.setLength(0);
    try { n.v = rhs(); } catch (NullPointerException ex) { log.append("NPE"); }
    System.out.println(log);
    log.setLength(0);
    try { n.v += rhs(); } catch (NullPointerException ex) { log.append("NPE"); }
    System.out.println(log);
    int x = 1;
    x += (x = 5);
    System.out.println(x);
    int k = 0;
    k = k++;
    System.out.println(k);
  }
}`, 'a i e | 7\na i e | 14\nrhs AIOOBE\nAIOOBE\nrhs NPE\nNPE\n6\n0'));
});

// ── Types ──

describe('compound assignment and ++/-- keep the variable type', () => {
  it('narrows the result back to the declared type', () => expectOutput(`
public class Main {
  public static void main(String[] args) {
    int salary = 1000; salary *= 1.5; System.out.println(salary);
    int x = 5; x += 2.7; System.out.println(x);
    char c = 'a'; c += 2; System.out.println(c);
    c++; System.out.println(c);
    char[] cs = {'x', 'y'}; cs[0]++; System.out.println(cs[0]);
    short sh = 1; sh += 2; sh++; System.out.println(sh);
    long big = 2147483647; big++; System.out.println(big);
    boolean flag = false; flag |= true; System.out.println(flag);
    String s = "a"; s += 1; s += 'b'; System.out.println(s);
    Integer boxed = 5; boxed++; boxed += 2; System.out.println(boxed);
    double d = 1; d += 1; d /= 4; System.out.println(d);
  }
}`, '1500\n7\nc\nd\ny\n4\n2147483648\ntrue\na1b\n8\n0.5'));

  it('converts every store to the declared type: array elements, fields and statics', () => expectOutput(`
public class Main {
  double total;
  static double avg;
  public static void main(String[] args) {
    double[] d = new double[2];
    d[0] = 1;
    System.out.println(d[0] / 2);
    Main m = new Main();
    m.total = 5;
    System.out.println(m.total / 2);
    avg = 3;
    System.out.println(avg / 2);
    Main.avg = 7;
    System.out.println(Main.avg / 2);
    long[] big = new long[1];
    big[0] = 3;
    System.out.println(big[0]);
    double r = d[1] = 4;
    System.out.println(r);
  }
}`, '0.5\n2.5\n1.5\n3.5\n3\n4.0'));
});

// ── Null and bounds checks ──

describe('null and bounds checks', () => {
  it('throws catchable NullPointerException and ArrayIndexOutOfBoundsException', () => expectOutput(`
public class Main {
  static class Node { int val; Node next; int get() { return val; } }
  public static void main(String[] args) {
    Node n = new Node();
    try { System.out.println(n.next.val); } catch (NullPointerException e) { System.out.println("read NPE"); }
    try { n.next.val = 3; } catch (NullPointerException e) { System.out.println("write NPE"); }
    try { n.next.get(); } catch (NullPointerException e) { System.out.println("call NPE"); }
    int[] a = null;
    try { System.out.println(a.length); } catch (NullPointerException e) { System.out.println("length NPE"); }
    try { a[0]++; } catch (NullPointerException e) { System.out.println("element NPE"); }
    int[] b = new int[3];
    try { b[3] = 5; } catch (ArrayIndexOutOfBoundsException e) { System.out.println(e.getMessage()); }
    try { b[-1]++; } catch (ArrayIndexOutOfBoundsException e) { System.out.println(e.getMessage()); }
    System.out.println(b.length);
  }
}`, 'read NPE\nwrite NPE\ncall NPE\nlength NPE\nelement NPE\nIndex 3 out of bounds for length 3\nIndex -1 out of bounds for length 3\n3'));

  it('names the null expression when a NullPointerException is uncaught', () => {
    const result = run(`public class Main {
  static class Node { int val; Node next; }
  public static void main(String[] args) {
    Node n = new Node();
    System.out.println(n.next.val);
  }
}`);
    expect(result.error).toBe('Exception in thread "main" java.lang.NullPointerException: Cannot read field "val" because "n.next" is null');
    expect(result.line).toBe(5);
  });

  it('describes method calls on null the same way', () => {
    const result = run(`public class Main {
  public static void main(String[] args) {
    String s = null;
    s.length();
  }
}`);
    expect(result.error).toBe('Exception in thread "main" java.lang.NullPointerException: Cannot invoke "length()" because "s" is null');
    expect(result.line).toBe(4);
  });
});

// ── Name resolution ──

describe('names resolve the way Java resolves them', () => {
  it("finds an instance field before another class's static field of the same name", () => expectOutput(`
public class Main {
  static class A { static int count = 100; }
  static class B {
    int count = 1;
    int bump() { count++; return count; }
  }
  public static void main(String[] args) {
    B b = new B();
    System.out.println(b.bump());
    System.out.println(A.count);
  }
}`, '2\n100'));

  it('reads and writes static fields through their class, including a nested class path', () => expectOutput(`
public class Main {
  static int total = 0;
  static class Counter { static int created = 0; Counter() { created++; } }
  public static void main(String[] args) {
    Main.total = 5;
    Main.total += 2;
    new Counter();
    new Counter();
    Counter.created++;
    System.out.println(Main.total + " " + Counter.created);
    System.out.println(Main.Counter.created);
  }
}`, '7 3\n3'));

  it('follows chains through method calls, for reads and writes', () => expectOutput(`
import java.util.*;
public class Main {
  static class Node { int v = 1; Node next; Node link() { return next; } }
  public static void main(String[] args) {
    List<Node> nodes = new ArrayList<>();
    nodes.add(new Node());
    nodes.get(0).v += 41;
    System.out.println(nodes.get(0).v);
    Node a = new Node();
    a.next = new Node();
    a.link().v = 9;
    a.link().v++;
    System.out.println(a.next.v + " " + a.v);
    StringBuilder sb = new StringBuilder();
    sb.append("x").append(nodes.get(0).v).append(a.link().v);
    System.out.println(sb);
  }
}`, '42\n10 1\nx4210'));

  it('reports an assignment to an undeclared name instead of creating a local', () => {
    const result = run(`public class Main {
  public static void main(String[] args) {
    y = 5;
    System.out.println(y);
  }
}`);
    expect(result.error).toBe("Line 3: Variable 'y' is not defined");
    expect(result.stdout).toBe('');
  });

  it.each([
    ['super member access', 'class B { public String toString() { return super.toString(); } }', 'System.out.println(new B());', "Line 6: Members reached through 'super' (super.name) aren't supported in JavaTutor yet"],
    ['inheritance', 'class A { public String toString() { return "A"; } }\nclass B extends A { public String toString() { return super.toString(); } }', 'System.out.println(new B());', "Line 7: Inheritance (class B extends A) isn't supported in JavaTutor yet"],
    ['method references', '', 'java.util.function.BinaryOperator<Integer> f = Integer::sum;', "Line 3: Method references (::) aren't supported in JavaTutor yet"],
    ['class literals', '', 'System.out.println(String.class);', "Line 3: Class literals (.class) aren't supported in JavaTutor yet"],
  ])('fails loudly on %s', (_name, classes, statement, message) => {
    const result = run(`public class Main {
  public static void main(String[] args) {
    ${statement}
  }
}
${classes}`);
    expect(result.error).toContain(message);
  });
});

// ── The reference module on its own ──

describe('references module', () => {
  const heap = (): Map<string, JavaHeapEntry> => new Map<string, JavaHeapEntry>([
    ['1', { className: 'Node', fields: new Map([['v', javaInt(1)]]) }],
    ['2', { elementType: 'double', elements: [javaDouble(0), javaDouble(0)] }],
  ]);
  const node = { kind: 'objectRef', heapId: '1', className: 'Node' } as const;
  const doubles = { kind: 'arrayRef', heapId: '2' } as const;

  it('assignmentConversion widens toward double, float and long, and never narrows', () => {
    expect(assignmentConversion(javaInt(1), 'double')).toEqual(javaDouble(1));
    expect(assignmentConversion(javaChar(65), 'long')).toEqual({ kind: 'primitive', javaType: 'long', value: 65 });
    expect(assignmentConversion(javaDouble(2.5), 'int')).toEqual(javaDouble(2.5));
    expect(assignmentConversion(javaString('x'), 'double')).toEqual(javaString('x'));
  });

  it('slotReference reads and writes the slot, converting what it stores', () => {
    const slot = { value: javaDouble(0), type: 'double' };
    const ref = slotReference(slot);
    expect(ref.declaredType).toBe('double');
    expect(ref.set(javaInt(3))).toEqual(javaDouble(3));
    expect(slot.value).toEqual(javaDouble(3));
    expect(ref.get()).toEqual(javaDouble(3));
  });

  it("slotReference won't read a local that has no value yet, and the first write gives it one", () => {
    const slot: { value: ReturnType<typeof javaInt>; type: string; unassigned?: boolean } = { value: javaInt(0), type: 'int', unassigned: true };
    const ref = slotReference(slot, 'count', 4);
    expect(() => ref.get()).toThrow(new InterpreterError("Variable 'count' might not have been initialized", 4));
    ref.set(javaInt(2));
    expect(slot.unassigned).toBe(false);
    expect(ref.get()).toEqual(javaInt(2));
  });

  it('fieldReference reads and writes the named field only', () => {
    const h = heap();
    const ref = fieldReference(h, node, 'v', 'int', 'n', 1);
    ref.set(javaInt(7));
    expect(ref.get()).toEqual(javaInt(7));
    expect(fieldReference(h, node, 'missing', 'int', 'n', 4).get).toThrow("Line 4: Field 'missing' does not exist on Node");
  });

  it('defers the null check until the field is accessed', () => {
    const ref = fieldReference(heap(), javaNull(), 'v', 'int', 'n.next', 7); // creating it doesn't throw
    expect(() => ref.get()).toThrow('Line 7: NullPointerException: Cannot read field "v" because "n.next" is null');
    expect(() => ref.set(javaInt(1))).toThrow('Line 7: NullPointerException: Cannot assign field "v" because "n.next" is null');
  });

  it('checks array bounds on access, with Java\'s message, and converts to the element type', () => {
    const h = heap();
    expect(arrayElementReference(h, doubles, 1, 'd', 1).set(javaInt(2))).toEqual(javaDouble(2));
    const outOfBounds = arrayElementReference(h, doubles, 2, 'd', 3); // creating it doesn't throw
    expect(() => outOfBounds.get()).toThrow('Line 3: ArrayIndexOutOfBoundsException: Index 2 out of bounds for length 2');
    expect(() => arrayElementReference(h, javaNull(), 0, 'a', 5).set(javaInt(1)))
      .toThrow('Line 5: NullPointerException: Cannot store to array because "a" is null');
  });

  it('arrayLength reads the length, or throws a NullPointerException for null', () => {
    expect(arrayLength(heap(), doubles, 'd', 1)).toBe(2);
    expect(() => arrayLength(heap(), javaNull(), 'a', 9)).toThrow('Line 9: NullPointerException: Cannot read the array length because "a" is null');
  });

  it('raises Java exceptions as catchable JavaRuntimeErrors that carry the class and line', () => {
    try {
      fieldReference(heap(), javaNull(), 'v', 'int', 'n', 12).get();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(JavaRuntimeError);
      expect(e).toBeInstanceOf(InterpreterError);
      expect((e as JavaRuntimeError).className).toBe('NullPointerException');
      expect((e as JavaRuntimeError).line).toBe(12);
    }
  });
});
