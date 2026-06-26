/**
 * Behavior comparison tests for the Java interpreter.
 *
 * Each test runs a Java snippet through the interpreter and asserts:
 *   - the last snapshot's stdout matches the expected output
 *   - (optionally) the final call stack contains no leaked block-scope frames
 *
 * Unlike the JS engine where we can run plain JS in a vm sandbox as the
 * ground truth, the Java engine is the only interpreter we have — so the
 * expected outputs here are computed by hand (matching real Java / javac
 * semantics). When a case fails, either the interpreter is wrong or the
 * expectation is wrong; reconcile against real `java` if available.
 *
 * Add a case here whenever you find an engine bug from real-world Java code.
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import type { ExecutionSnapshot } from '../../../types/snapshot';

function execJava(source: string): { snapshots: ExecutionSnapshot[]; error?: string } {
  try {
    const cst = parseJava(source);
    const interp = new JavaInterpreter();
    return interp.execute(cst);
  } catch (e) {
    return { snapshots: [], error: (e as Error).message };
  }
}

function expectStdout(source: string, expected: string) {
  const r = execJava(source);
  if (r.error) throw new Error('interpreter error: ' + r.error);
  const last = r.snapshots[r.snapshots.length - 1];
  const actual = (last?.stdout || []).join('\n');
  expect(actual).toBe(expected);
}

function expectCleanStack(source: string, expected: string) {
  expectStdout(source, expected);
  const r = execJava(source);
  const last = r.snapshots[r.snapshots.length - 1];
  const leaked = last.callStack.some(f => f.isBlockScope);
  expect(leaked).toBe(false);
}

function wrap(body: string, methods = ''): string {
  return `public class Main {
    ${methods}
    public static void main(String[] args) {
      ${body}
    }
  }`;
}

describe('Java behavior comparison', () => {
  // ── Sanity ──
  it('hello world', () => expectStdout(wrap(`System.out.println("Hello, World!");`), 'Hello, World!'));
  it('arithmetic + precedence', () => expectStdout(wrap(`System.out.println(3 + 4 * 2);`), '11'));
  it('integer division truncates', () => expectStdout(wrap(`System.out.println(7 / 2);`), '3'));
  it('modulo', () => expectStdout(wrap(`System.out.println(17 % 5);`), '2'));
  it('double division', () => expectStdout(wrap(`System.out.println(7.0 / 2);`), '3.5'));
  it('char arithmetic', () => expectStdout(wrap(`char c = 'A'; System.out.println(c + 1);`), '66'));

  // ── Short-circuit eval (REGRESSION) ──
  // The interpreter previously evaluated both sides of && / || eagerly, so
  // `false && side()` would still run side(). Lazy operand thunks fix this.

  it('short-circuit && skips RHS', () => expectStdout(wrap(`
    int counter = 0;
    boolean r = false && (++counter > 0);
    System.out.println(r);
    System.out.println(counter);
  `), 'false\n0'));

  it('short-circuit || skips RHS', () => expectStdout(wrap(`
    int counter = 0;
    boolean r = true || (++counter > 0);
    System.out.println(r);
    System.out.println(counter);
  `), 'true\n0'));

  it('short-circuit && guards null deref', () => expectStdout(wrap(`
    String s = null;
    boolean ok = (s != null) && (s.length() > 0);
    System.out.println(ok);
  `), 'false'));

  it('short-circuit || guards null deref', () => expectStdout(wrap(`
    String s = null;
    boolean ok = (s == null) || (s.length() > 0);
    System.out.println(ok);
  `), 'true'));

  // ── Inline array literals ──
  it('inline new int[]{...} assigned to local', () => expectStdout(wrap(`
    int[] a = new int[]{1, 2, 3, 4, 5};
    System.out.println(a.length);
    System.out.println(a[2]);
  `), '5\n3'));

  it('inline array passed as method argument', () => expectStdout(wrap(`
    int x = find(new int[]{1, 2, 3, 4, 5}, 3);
    System.out.println(x);
  `, `static int find(int[] a, int t) {
    for (int i = 0; i < a.length; i++) if (a[i] == t) return i;
    return -1;
  }`), '2'));

  // ── Control flow ──
  it('for-loop sum', () => expectStdout(wrap(`int s = 0; for (int i = 1; i <= 10; i++) s += i; System.out.println(s);`), '55'));
  it('while loop', () => expectStdout(wrap(`int n = 1; while (n < 100) n *= 2; System.out.println(n);`), '128'));
  it('do-while', () => expectStdout(wrap(`int i = 0; do { i++; } while (i < 5); System.out.println(i);`), '5'));
  it('break in for', () => expectStdout(wrap(`int s = 0; for (int i = 0; i < 100; i++) { if (i == 5) break; s += i; } System.out.println(s);`), '10'));
  it('continue in for', () => expectStdout(wrap(`int s = 0; for (int i = 0; i < 10; i++) { if (i % 2 == 0) continue; s += i; } System.out.println(s);`), '25'));

  it('ternary lazy eval', () => expectStdout(wrap(`
    int x = 0;
    int r = x == 0 ? -1 : 100 / x;
    System.out.println(r);
  `), '-1'));

  it('if/else if/else cascading', () => expectStdout(wrap(`
    int n = 75;
    String grade;
    if (n >= 90) grade = "A";
    else if (n >= 80) grade = "B";
    else if (n >= 70) grade = "C";
    else grade = "F";
    System.out.println(grade);
  `), 'C'));

  it('switch with break', () => expectStdout(wrap(`
    switch (2) {
      case 1: System.out.println("one"); break;
      case 2: System.out.println("two"); break;
      default: System.out.println("other");
    }
  `), 'two'));

  it('switch fall-through', () => expectStdout(wrap(`
    int n = 1;
    switch (n) {
      case 1:
      case 2: System.out.println("low"); break;
      default: System.out.println("other");
    }
  `), 'low'));

  // ── Methods & recursion ──
  it('factorial', () => expectStdout(wrap(`System.out.println(fact(6));`, `static int fact(int n) { return n <= 1 ? 1 : n * fact(n-1); }`), '720'));
  it('fibonacci', () => expectStdout(wrap(`System.out.println(fib(10));`, `static int fib(int n) { return n < 2 ? n : fib(n-1) + fib(n-2); }`), '55'));
  it('GCD', () => expectStdout(wrap(`System.out.println(gcd(48, 18));`, `static int gcd(int a, int b) { return b == 0 ? a : gcd(b, a % b); }`), '6'));
  it('mutual recursion isEven/isOdd', () => expectStdout(wrap(`System.out.println(isEven(8));`,
    `static boolean isEven(int n) { return n == 0 ? true : isOdd(n-1); }
     static boolean isOdd(int n) { return n == 0 ? false : isEven(n-1); }`), 'true'));

  // ── Stack cleanup on early return ──
  it('return inside for-loop leaves no leaked frame', () => expectCleanStack(wrap(`
    System.out.println(find(new int[]{1, 2, 3, 4, 5}, 3));
  `, `static int find(int[] a, int t) {
    for (int i = 0; i < a.length; i++) if (a[i] == t) return i;
    return -1;
  }`), '2'));

  it('return inside nested for-loop leaves no leaked frame', () => expectCleanStack(wrap(`
    System.out.println(scan(3, 3));
  `, `static int scan(int rows, int cols) {
    for (int i = 0; i < rows; i++)
      for (int j = 0; j < cols; j++)
        if (i + j == 4) return i * 10 + j;
    return -1;
  }`), '22'));

  it('return inside while-loop leaves no leaked frame', () => expectCleanStack(wrap(`
    System.out.println(pow2above(50));
  `, `static int pow2above(int n) {
    int v = 1;
    while (true) { if (v > n) return v; v *= 2; }
  }`), '64'));

  // ── Arrays ──
  it('array init + sum', () => expectStdout(wrap(`
    int[] a = {1, 2, 3, 4, 5};
    int s = 0;
    for (int i = 0; i < a.length; i++) s += a[i];
    System.out.println(s);
  `), '15'));

  it('enhanced for over array', () => expectStdout(wrap(`
    int[] a = {10, 20, 30};
    int s = 0;
    for (int x : a) s += x;
    System.out.println(s);
  `), '60'));

  it('2D array indexing', () => expectStdout(wrap(`
    int[][] m = {{1, 2}, {3, 4}};
    System.out.println(m[0][0] + m[0][1] + m[1][0] + m[1][1]);
  `), '10'));

  it('bubble sort with array swap + chained StringBuilder', () => expectStdout(wrap(`
    int[] a = {5, 2, 8, 1, 9, 3};
    for (int i = 0; i < a.length; i++)
      for (int j = 0; j < a.length - i - 1; j++)
        if (a[j] > a[j+1]) { int t = a[j]; a[j] = a[j+1]; a[j+1] = t; }
    StringBuilder sb = new StringBuilder();
    for (int x : a) sb.append(x).append(",");
    System.out.println(sb.toString());
  `), '1,2,3,5,8,9,'));

  // ── Strings ──
  it('string concat', () => expectStdout(wrap(`System.out.println("hello" + " " + "world");`), 'hello world'));
  it('string + int concat', () => expectStdout(wrap(`System.out.println("answer=" + 42);`), 'answer=42'));
  it('String.length / charAt / substring', () => expectStdout(wrap(`
    String s = "Hello";
    System.out.println(s.length());
    System.out.println(s.charAt(1));
    System.out.println(s.substring(1, 4));
  `), '5\ne\nell'));

  it('String.equals', () => expectStdout(wrap(`String s = "hello"; System.out.println(s.equals("hello"));`), 'true'));

  // ── Postfix / prefix ──
  it('postfix vs prefix increment', () => expectStdout(wrap(`
    int i = 5; int a = i++; int b = ++i;
    System.out.println(i);
    System.out.println(a);
    System.out.println(b);
  `), '7\n5\n7'));

  it('compound assignments', () => expectStdout(wrap(`
    int x = 10; x += 5; x *= 2; x -= 3;
    System.out.println(x);
  `), '27'));

  // ── StringBuilder (REGRESSION: methods were missing) ──
  it('StringBuilder.append chained', () => expectStdout(wrap(`
    StringBuilder sb = new StringBuilder();
    sb.append("a").append(",").append("b");
    System.out.println(sb.toString());
  `), 'a,b'));

  it('StringBuilder.length and charAt', () => expectStdout(wrap(`
    StringBuilder sb = new StringBuilder("hello");
    System.out.println(sb.length());
    System.out.println(sb.charAt(1));
  `), '5\ne'));

  // ── ArrayList ──
  it('ArrayList add / get / size', () => expectStdout(wrap(`
    ArrayList list = new ArrayList();
    list.add(10); list.add(20); list.add(30);
    System.out.println(list.size());
    System.out.println(list.get(1));
  `), '3\n20'));

  // ── HashMap ──
  it('HashMap put / get / containsKey', () => expectStdout(wrap(`
    HashMap m = new HashMap();
    m.put("a", 1);
    m.put("b", 2);
    System.out.println(m.get("a"));
    System.out.println(m.get("b"));
    System.out.println(m.containsKey("c"));
  `), '1\n2\nfalse'));

  // ── User-defined inner classes (recently added support) ──
  it('static inner class with instance method', () => expectStdout(
    `public class Main {
      static class Box {
        int v;
        Box(int v) { this.v = v; }
        int get() { return v; }
      }
      public static void main(String[] args) {
        Box b = new Box(42);
        System.out.println(b.get());
      }
    }`, '42'));

  it('inner class with mutating method', () => expectStdout(
    `public class Main {
      static class Counter {
        int n = 0;
        void inc() { n++; }
        int get() { return n; }
      }
      public static void main(String[] args) {
        Counter c = new Counter();
        c.inc(); c.inc(); c.inc();
        System.out.println(c.get());
      }
    }`, '3'));

  // ── Classic textbook algorithms ──
  it('FizzBuzz 1-15', () => expectStdout(wrap(`
    StringBuilder sb = new StringBuilder();
    for (int i = 1; i <= 15; i++) {
      if (i % 15 == 0) sb.append("FizzBuzz");
      else if (i % 3 == 0) sb.append("Fizz");
      else if (i % 5 == 0) sb.append("Buzz");
      else sb.append(i);
      sb.append(",");
    }
    System.out.println(sb.toString());
  `), '1,2,Fizz,4,Buzz,Fizz,7,8,Fizz,Buzz,11,Fizz,13,14,FizzBuzz,'));

  it('binary search', () => expectStdout(wrap(`
    int[] a = {1, 3, 5, 7, 9, 11, 13, 15};
    int lo = 0, hi = a.length - 1, target = 11, idx = -1;
    while (lo <= hi) {
      int mid = (lo + hi) / 2;
      if (a[mid] == target) { idx = mid; break; }
      if (a[mid] < target) lo = mid + 1; else hi = mid - 1;
    }
    System.out.println(idx);
  `), '5'));

  it('palindrome check', () => expectStdout(wrap(`
    String s = "racecar";
    int i = 0, j = s.length() - 1; boolean pal = true;
    while (i < j) {
      if (s.charAt(i) != s.charAt(j)) { pal = false; break; }
      i++; j--;
    }
    System.out.println(pal);
  `), 'true'));
});
