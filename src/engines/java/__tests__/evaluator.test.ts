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

  it("recurse as deep as Java's stack allows, whatever JavaScript's stack is (#73)", () => {
    const result = run(depth);
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe('3000');
    expect(run(depth.replace('3000', '9000')).stdout).toBe('9000');
    // Shown to the limit when the steps allow it.
    const shown = run(depth, { shownDepth: 5000, maxSteps: 100_000, maxWork: 10_000_000 });
    expect(shown.stdout).toBe('3000');
    expect(shown.snapshots.some(s => s.label)).toBe(false);
  });

  it('run calls deeper than the steps can show without steps, and say so at the next step (#73)', () => {
    const { snapshots, error } = run(depth);
    expect(error).toBeUndefined();
    // One-line frames: a step entering each shown one and one as it returns, within the step cap with steps to spare.
    expect(snapshots.length).toBeLessThan(5000 - 200);
    const labeled = snapshots.filter(s => s.label);
    expect(labeled).toHaveLength(1);
    const [, unshown] = /^([\d,]+) deeper calls ran without steps \(3,002 frames deep\)$/.exec(labeled[0].label!)!;
    const deepestShown = Math.min(...snapshots.map(s => Number(value({ ...s, callStack: [s.callStack.at(-1)!] }, 'n')?.value ?? 3000)));
    // depth(3000) … depth(0) are 3,001 calls: the shown ones, then the rest.
    expect(3000 - deepestShown + 1 + Number(unshown.replace(/,/g, ''))).toBe(3001);
    // The labeled step is the deepest shown frame returning, with the value from below.
    expect(value({ ...labeled[0], callStack: [labeled[0].callStack.at(-1)!] }, RETURN_VALUE)).toEqual({ type: 'number', value: deepestShown });
    // Past shownDepth, calls are quiet whatever steps are left.
    const capped = run(depth, { shownDepth: 500, maxSteps: 100_000, maxWork: 10_000_000 });
    expect(capped.stdout).toBe('3000');
    expect(capped.snapshots.find(s => s.label)?.label).toBe('2,502 deeper calls ran without steps (3,002 frames deep)');
  });

  it('throw StackOverflowError past the limit, which a program can catch', () => {
    expect(run(depth, { maxDepth: 2500 }).error).toBe('Exception in thread "main" java.lang.StackOverflowError');
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
    // The catch's step says how deep the recursion went.
    expect(caught.snapshots.find(s => s.label)?.label).toMatch(/^[\d,]+ deeper calls ran without steps \(10,000 frames deep\)$/);
  });

  it("run a toString that recurses through string concatenation on the explicit stack (#73)", () => {
    const result = run(`public class Main {
  static class Node {
    int v;
    Node next;
    public String toString() { return next == null ? "" + v : v + "," + next; }
  }
  static class Nothing {
    public String toString() { return null; }
  }
  public static void main(String[] args) {
    Node head = null;
    for (int i = 0; i < 1000; i++) { Node n = new Node(); n.v = i; n.next = head; head = n; }
    String s = "list: ";
    s += head;
    System.out.println(s.length() + " " + s.substring(0, 16));
    System.out.println("x" + new Nothing());
  }
}`);
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe('3895 list: 999,998,99\nxnull');
    // Each toString is a frame on the stack, as deep as the list.
    expect(Math.max(...result.snapshots.map(s => s.callStack.length))).toBe(100);
    expect(result.snapshots.some(s => s.callStack.some(f => /^… [\d,]+ more frames$/.test(f.name)))).toBe(true);
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

describe('the heap drawn incrementally (#73)', () => {
  const program = `import java.util.*;
public class Main {
  static class P {
    int x;
    P next;
  }
  public static void main(String[] args) {
    P a = new P();
    P b = new P();
    int[] arr = {1, 2};
    List<Integer> list = new ArrayList<>();
    Map<String, Integer> map = new HashMap<>();
    a.x = 5;
    a.next = b;
    arr[1] = 7;
    list.add(3);
    map.put("k", 1);
    map.put("k", 2);
    StringBuilder sb = new StringBuilder();
    sb.append("hi");
    System.out.println(a.x + arr[1] + list.size() + map.get("k") + sb.toString());
  }
}`;
  const { snapshots } = run(program);
  const at = (line: number) => snapshots.find(s => s.line === line)!;
  const object = (s: ExecutionSnapshot, name: string) => {
    const ref = value(s, name);
    return s.heap.find(o => ref?.type === 'ref' && o.id === ref.heapId)!;
  };

  it('draws each change at the step after it', () => {
    expect(object(at(13), 'a').properties).toEqual([{ key: 'x', value: { type: 'number', value: 0 } }, { key: 'next', value: { type: 'null', value: null } }]);
    expect(object(at(14), 'a').properties[0].value).toEqual({ type: 'number', value: 5 });
    expect(object(at(15), 'a').properties[1].value).toEqual({ type: 'ref', heapId: object(at(15), 'b').id });
    expect(object(at(15), 'arr').properties.map(p => p.value)).toEqual([{ type: 'number', value: 1 }, { type: 'number', value: 2 }]);
    expect(object(at(16), 'arr').properties[1].value).toEqual({ type: 'number', value: 7 });
    expect(object(at(16), 'list').properties).toEqual([]);
    expect(object(at(17), 'list').properties).toEqual([{ key: '0', value: { type: 'number', value: 3 } }]);
    expect(object(at(18), 'map').properties).toEqual([{ key: 'k', value: { type: 'number', value: 1 } }]);
    expect(object(at(19), 'map').properties).toEqual([{ key: 'k', value: { type: 'number', value: 2 } }]);
    expect(object(at(21), 'sb').properties).toEqual([{ key: 'value', value: expect.objectContaining({ value: 'hi' }) }]);
  });

  it('gives an unchanged object the very object the step before showed', () => {
    expect(object(at(14), 'b')).toBe(object(at(13), 'b'));
    expect(object(at(15), 'arr')).toBe(object(at(13), 'arr'));
    expect(object(at(16), 'a')).toBe(object(at(15), 'a'));
    expect(object(at(14), 'a')).not.toBe(object(at(13), 'a'));
    // And keeps creation order.
    expect(at(21).heap.map(o => Number(o.id))).toEqual([...at(21).heap.map(o => Number(o.id))].sort((x, y) => x - y));
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

describe('library calls run overrides, never overloads (#62)', () => {
  it("calls a class's equals(P) only where Java's binder chose it, and Object's equals elsewhere", () => {
    const result = run(`import java.util.*;
public class Main {
  static class P {
    int v;
    P(int v) { this.v = v; }
    public boolean equals(P other) { return v == other.v; }
    public int hashCode() { return v; }
  }
  record R(int v) {}
  public static void main(String[] args) {
    P a = new P(1), b = new P(1);
    Object o = b;
    List<P> list = new ArrayList<>(List.of(a));
    System.out.println(a.equals(b) + " " + a.equals(o) + " " + list.contains(b) + " " + list.indexOf(b) + " " + Objects.equals(a, b) + " " + new HashSet<>(list).contains(b));
    System.out.println(new HashSet<>(List.of(new R(2))).contains(new R(2)) + " " + Objects.equals(new R(3), new R(3)));
  }
}`);
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe('true false false -1 false false\ntrue true');
  });

  it("orders only a Comparable class's objects, with the JVM's ClassCastException otherwise", () => {
    const result = run(`import java.util.*;
public class Main {
  static class S {
    int score;
    S(int s) { score = s; }
    public int compareTo(S o) { return score - o.score; }
  }
  static class C implements Comparable<C> {
    int score;
    C(int s) { score = s; }
    public int compareTo(C o) { return score - o.score; }
  }
  public static void main(String[] args) {
    C[] cs = { new C(2), new C(1) };
    Arrays.sort(cs);
    System.out.println(cs[0].score + " " + new TreeSet<>(List.of(new C(5), new C(4))).first().score);
    Arrays.sort(new S[] { new S(1) });
    try { new TreeSet<S>().add(new S(1)); } catch (ClassCastException e) { System.out.println(e.getMessage()); }
  }
}`);
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe("1 4\nclass Main$S cannot be cast to class java.lang.Comparable (Main$S is in unnamed module of loader 'app'; java.lang.Comparable is in module java.base of loader 'bootstrap')");
  });
});

describe('arrays are covariant, and check their stores (#67)', () => {
  it("throws ArrayStoreException naming the value's class, after the null and bounds checks", () => {
    const result = run(`public class Main {
  static class Animal {}
  static class Dog extends Animal {}
  static class Cat extends Animal {}
  public static void main(String[] args) {
    String[] words = new String[2];
    Object[] objs = words;
    objs[0] = "fine";
    try { objs[1] = 42; } catch (ArrayStoreException e) { System.out.println(e); }
    Animal[] pets = new Dog[1];
    try { pets[0] = new Cat(); } catch (ArrayStoreException e) { System.out.println(e.getMessage()); }
    pets[0] = new Dog();
    Object[][] grid = new Integer[2][2];
    try { grid[0] = new String[1]; } catch (ArrayStoreException e) { System.out.println(e.getMessage()); }
    try { objs[5] = 1; } catch (ArrayIndexOutOfBoundsException e) { System.out.println(e.getMessage()); }
    Object[] any = new Object[1];
    any[0] = new int[0];
    System.out.println(words[0] + " " + words[1] + " " + (pets[0] instanceof Dog));
  }
}`);
    expect(result.error).toBeUndefined();
    expect(result.stdout).toBe('java.lang.ArrayStoreException: java.lang.Integer\nMain$Cat\n[Ljava.lang.String;\nIndex 5 out of bounds for length 2\nfine null true');
  });
});
