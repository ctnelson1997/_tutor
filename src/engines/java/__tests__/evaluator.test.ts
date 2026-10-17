/**
 * The evaluator (#14) and its steps (#24). Steps follow pythontutor.com: a
 * step shows the state before its line runs; entering a method (parameters
 * bound) and returning from it (`return ↵` holding the value) are steps of
 * their own; another statement on the line the frame last stepped at takes
 * no step, as CPython emits no new line event, except a loop's next test.
 * Java frames live on an explicit stack, so recursion depth doesn't depend on
 * JavaScript's. Expected outputs were checked against JDK 21.
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter, RETURN_VALUE, type RunLimits } from '../interpreter';
import type { ExecutionSnapshot, RuntimeValue } from '../../../types/snapshot';

function run(source: string, limits: Partial<RunLimits> = {}) {
  const result = new JavaInterpreter('', limits).execute(parseJava(source));
  return { ...result, stdout: result.snapshots.at(-1)?.stdout.join('\n') ?? '' };
}

/** Each step as `line: frame(variables) …`, block scopes included. */
function trace(snapshots: ExecutionSnapshot[]): string[] {
  return snapshots.map(s => `${s.line}: ${s.callStack.map(f => `${f.name}(${f.variables.map(v => v.name).join(',')})`).join(' ')}`);
}

const value = (s: ExecutionSnapshot, name: string): RuntimeValue | undefined =>
  s.callStack.flatMap(f => f.variables).find(v => v.name === name)?.value;

describe('steps follow pythontutor.com (#24)', () => {
  it('enter a method with its parameters bound, and return showing the value', () => {
    const result = run(`public class Main {
  static int square(int n) {
    int r = n * n;
    return r;
  }
  static void greet(String who) {
    System.out.println("hi " + who);
  }
  public static void main(String[] args) {
    int a = square(3);
    greet("bo");
  }
}`);
    expect(result.error).toBeUndefined();
    expect(trace(result.snapshots)).toEqual([
      '10: main()',
      '2: main() square(n)', // entering square: n is bound, its first line hasn't run
      '3: main() square(n)',
      '4: main() square(n,r)',
      `4: main() square(n,r,${RETURN_VALUE})`, // returning 9
      '11: main(a)',
      '6: main(a) greet(who)',
      '7: main(a) greet(who)',
      '8: main(a) greet(who)', // a void method returns at its closing brace, with no value
      '12: main(a)', // main returns: the final state
    ]);
    expect(value(result.snapshots[4], RETURN_VALUE)).toEqual({ type: 'number', value: 9 });
    expect(result.snapshots[8].stdout).toEqual(['hi bo']);
  });

  it('take one step for statements that share a line, as CPython does', () => {
    const result = run(`public class Main {
  static int fact(int n) { if (n <= 1) return 1; return n * fact(n - 1); }
  public static void main(String[] args) {
    int x = 1; int y = fact(3);
  }
}`);
    expect(result.error).toBeUndefined();
    // main's line once; each call's entry, and its return with the value.
    expect(result.snapshots.map(s => s.line)).toEqual([4, 2, 2, 2, 2, 2, 2, 5]);
    expect(result.snapshots.slice(4, 7).map(s => value(s, RETURN_VALUE))).toEqual([1, 2, 6].map(v => ({ type: 'number', value: v })));
  });

  it("take a step at a loop's every test, showing the variable it tests", () => {
    const result = run(`public class Main {
  public static void main(String[] args) {
    int sum = 0;
    for (int i = 0; i < 3; i++) sum += i;
    int k = 0;
    do {
      k++;
    } while (k < 2);
  }
}`);
    expect(result.error).toBeUndefined();
    const at = (line: number) => result.snapshots.filter(s => s.line === line);
    // A one-line loop still takes a step per iteration: the test after each update.
    expect(at(4).map(s => value(s, 'i'))).toEqual([0, 1, 2, 3].map(v => ({ type: 'number', value: v })));
    expect(at(8).map(s => value(s, 'k'))).toEqual([1, 2].map(v => ({ type: 'number', value: v })));
  });

  it('enter a constructor with this and its parameters, then run field initializers as steps', () => {
    const result = run(`public class Main {
  static class Box {
    int size = 1;
    Box(int s) {
      size = s;
    }
  }
  public static void main(String[] args) {
    Box b = new Box(4);
  }
}`);
    expect(result.error).toBeUndefined();
    expect(trace(result.snapshots)).toEqual([
      '9: main()',
      '4: main() Box(s)',
      '3: main() Box()', // a field initializer doesn't see the constructor's parameters
      '5: main() Box(s)',
      '6: main() Box(s)',
      '10: main(b)',
    ]);
    expect(result.snapshots[1].callStack[1].thisArg).toEqual({ type: 'ref', heapId: expect.any(String) });
  });
});

describe('frames on an explicit stack', () => {
  const depth = `public class Main {
  static int depth(int n) { return n == 0 ? 0 : 1 + depth(n - 1); }
  public static void main(String[] args) {
    System.out.println(depth(3000));
  }
}`;

  it("recurse as deep as the limit allows, whatever JavaScript's stack is", () => {
    const result = run(depth, { maxDepth: 5000, maxSteps: 100_000, maxWork: 10_000_000 });
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe('3000');
  });

  it('throw StackOverflowError past the limit, which a program can catch', () => {
    expect(run(depth).error).toBe('Exception in thread "main" java.lang.StackOverflowError');
    const caught = run(`public class Main {
  static int down(int n) {
    return down(n + 1);
  }
  public static void main(String[] args) {
    try {
      down(0);
    } catch (StackOverflowError e) {
      System.out.println("caught");
    }
  }
}`);
    expect(caught.error).toBeUndefined();
    expect(caught.stdout).toBe('caught');
  });

  it('show the outermost frame and the 98 deepest, with a note for the rest', () => {
    const result = run(`public class Main {
  static int depth(int n) {
    if (n == 0) return 0;
    int below = depth(n - 1);
    return below + 1;
  }
  public static void main(String[] args) {
    System.out.println(depth(150));
  }
}`);
    expect(result.stdout).toBe('150');
    // At depth(0), 152 frames: main, depth(150) … depth(0).
    const deepest = result.snapshots.find(s => value({ ...s, callStack: [s.callStack.at(-1)!] }, 'n')?.value === 0)!;
    expect(deepest.callStack).toHaveLength(100);
    expect(deepest.callStack[0].name).toBe('main');
    expect(deepest.callStack[1]).toEqual({ name: '… 53 more frames', variables: [] });
    expect(deepest.callStack[2].variables[0].value).toEqual({ type: 'number', value: 97 });
  });
});

describe("the binder's decisions run end to end (#13)", () => {
  it('overloads and constructors chosen by type, the Integer cache, conditional types, remove(Object)', () => {
    const result = run(`import java.util.*;
public class Main {
  static String f(int x) { return "int"; }
  static String f(double x) { return "double"; }
  static String f(Object x) { return "Object"; }
  static String f(long x) { return "long"; }
  static class P {
    String how;
    P(int x) { how = "int"; }
    P(String s) { how = "String"; }
    P(double d) { how = "double"; }
  }
  public static void main(String[] args) {
    System.out.println(f(1) + " " + f(1.5) + " " + f("s") + " " + f(2L) + " " + f('c') + " " + f(Integer.valueOf(3)));
    System.out.println(new P(1).how + " " + new P("x").how + " " + new P(2f).how);
    Integer a = 127, b = 127, c = 128, d = 128;
    System.out.println((a == b) + " " + (c == d) + " " + c.equals(d));
    boolean t = true;
    System.out.println(t ? 1 : 2.0);
    System.out.println(t ? 'a' : 0);
    List<Integer> xs = new ArrayList<>(List.of(10, 20, 30, 40));
    xs.remove(Integer.valueOf(40));
    xs.remove(1);
    System.out.println(xs + " " + Integer.toString(42) + " " + Integer.toString(255, 16));
  }
}`);
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe('int double Object long int Object\nint String double\ntrue false true\n1.0\na\n[10, 30] 42 ff');
  });

  it('stop a program javac rejects before any step, with its error', () => {
    const result = run('public class Main {\n  public static void main(String[] args) {\n    int x = "s";\n  }\n}');
    expect(result.snapshots).toEqual([]);
    expect(result.error).toBe('Line 3: incompatible types: String cannot be converted to int');
  });
});

describe('calls', () => {
  const source = `import java.util.*;
public class Main {
  interface Cmp<T> { int cmp(T a, T b); }
  static class ByX implements Cmp<Point> {
    public int cmp(Point a, Point b) { return a.x - b.x; }
  }
  static class Point implements Comparable<Point> {
    int x;
    Point(int x) { this.x = x; }
    public int compareTo(Point o) { return Integer.compare(x, o.x); }
    public String toString() { return "P" + x; }
  }
  static <T> T best(List<T> xs, Cmp<T> c) {
    T b = xs.get(0);
    for (T x : xs) if (c.cmp(x, b) > 0) b = x;
    return b;
  }
  public static void main(String[] args) {
    List<Point> ps = new ArrayList<>(List.of(new Point(3), new Point(9), new Point(1)));
    System.out.println(best(ps, new ByX()));
    Collections.sort(ps);
    System.out.println(ps);
    Comparable<Point> c = ps.get(0);
    System.out.println(c.compareTo(ps.get(1)));
    Object o = ps.get(2);
    System.out.println(o.toString() + " " + o.equals(o) + " " + (o.hashCode() == o.hashCode()));
  }
}`;
  const result = run(source);
  const framesNamed = (name: string) => result.snapshots.filter(s => s.callStack.some(f => f.name === name));

  it('dispatch to the override, also through a generic interface (cmp(Point, Point) for Cmp<T>.cmp(T, T))', () => {
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe('P9\n[P1, P3, P9]\n-1\nP9 true true');
    expect(framesNamed('cmp')).toHaveLength(6); // three calls: entry and return each
  });

  it('show the methods the library calls back (compareTo for a sort, toString for println), as pythontutor.com does', () => {
    // Collections.sort compares the points, println(ps) prints each one, then the explicit c.compareTo(…) and o.toString().
    const sortLine = 21, printLine = 22;
    const callers = (name: string) => framesNamed(name).map(s => s.callStack.find(f => f.name === 'main')).filter(Boolean);
    expect(framesNamed('compareTo').length).toBeGreaterThan(2);
    expect(framesNamed('toString').length).toBe(5 * 2); // best(…) printed, the three points of ps, then o.toString(): entry and return each
    expect(callers('compareTo').length).toBe(framesNamed('compareTo').length);
    expect(result.snapshots.some(s => s.line === 10 && s.callStack.some(f => f.name === 'compareTo'))).toBe(true);
    expect([sortLine, printLine]).toEqual([21, 22]);
  });

  it("name the method a NullPointerException couldn't call as the JVM does", () => {
    const npe = run(`import java.util.*;
public class Main {
  static class Node { void link(Node n, int k, String s, int[] a) {} }
  public static void main(String[] args) {
    Node x = null; List<String> l = null; Object o = null; StringBuilder sb = null; Map<String, Integer> m = null; int[] arr = null;
    try { x.link(null, 1, "", null); } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { l.size(); } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { o.hashCode(); } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { sb.append("a"); } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { m.get("a"); } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { l.add("x"); } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { System.out.println(arr.length); } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { arr[0] = 1; } catch (NullPointerException e) { System.out.println(e.getMessage()); }
  }
}`);
    expect(npe.error).toBeUndefined();
    expect(npe.stdout.split('\n')).toEqual([
      'Cannot invoke "Main$Node.link(Main$Node, int, String, int[])" because "x" is null',
      'Cannot invoke "java.util.List.size()" because "l" is null',
      'Cannot invoke "Object.hashCode()" because "o" is null',
      'Cannot invoke "java.lang.StringBuilder.append(String)" because "sb" is null',
      'Cannot invoke "java.util.Map.get(Object)" because "m" is null',
      'Cannot invoke "java.util.List.add(Object)" because "l" is null',
      'Cannot read the array length because "arr" is null',
      'Cannot store to int array because "arr" is null',
    ]);
  });

  it('name an array by its static element type when it is null', () => {
    const npe = run(`public class Main {
  public static void main(String[] args) {
    int[] a = null; String[] s = null; double[][] d = null; char[] c = null; long[] l = null; boolean[] b = null;
    try { a[0] = 1; } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { System.out.println(a[0]); } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { s[0] = ""; } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { System.out.println(s[0]); } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { d[0] = null; } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { c[0] = 'x'; } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { l[0]++; } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { b[0] = true; } catch (NullPointerException e) { System.out.println(e.getMessage()); }
    try { a[0] += 2; } catch (NullPointerException e) { System.out.println(e.getMessage()); }
  }
}`);
    expect(npe.stdout.split('\n')).toEqual([
      'Cannot store to int array because "a" is null',
      'Cannot load from int array because "a" is null',
      'Cannot store to object array because "s" is null',
      'Cannot load from object array because "s" is null',
      'Cannot store to object array because "d" is null',
      'Cannot store to char array because "c" is null',
      'Cannot load from long array because "l" is null',
      'Cannot store to byte/boolean array because "b" is null',
      'Cannot load from int array because "a" is null',
    ]);
  });
});
