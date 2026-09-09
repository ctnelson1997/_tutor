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
import { examples } from '../examples';
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

function execJavaWithInput(source: string, stdin: string): { snapshots: ExecutionSnapshot[]; error?: string } {
  try {
    const cst = parseJava(source);
    const interp = new JavaInterpreter(stdin);
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

function expectStdoutWithInput(source: string, stdin: string, expected: string) {
  const r = execJavaWithInput(source, stdin);
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

  // ── stdlib: static utilities ──
  it('Arrays.toString + Arrays.sort', () => expectStdout(wrap(`
    int[] a = {3, 1, 2};
    Arrays.sort(a);
    System.out.println(Arrays.toString(a));
  `), '[1, 2, 3]'));

  it('java.util.Arrays fully qualified also resolves', () => expectStdout(wrap(`
    int[] a = {5, 4};
    System.out.println(java.util.Arrays.toString(a));
  `), '[5, 4]'));

  it('String.format and System.out.printf', () => expectStdout(wrap(`
    System.out.println(String.format("%s=%d", "x", 7));
    System.out.printf("%d + %.2f = %.2f%n", 1, 2.5, 3.5);
    System.out.print("done");
  `), 'x=7\n1 + 2.50 = 3.50\ndone'));

  it('Math extended methods', () => expectStdout(wrap(`
    System.out.println(Math.log10(1000));
    System.out.println((int) Math.hypot(3, 4));
    System.out.println(Math.floorMod(-3, 5));
  `), '3.0\n5\n2'));

  it('Integer / Character helpers', () => expectStdout(wrap(`
    System.out.println(Integer.toBinaryString(5));
    System.out.println(Integer.parseInt("ff", 16));
    System.out.println(Character.isDigit('5'));
    System.out.println(Character.toUpperCase('a'));
  `), '101\n255\ntrue\nA'));

  it('System.arraycopy', () => expectStdout(wrap(`
    int[] src = {1, 2, 3, 4};
    int[] dst = new int[4];
    System.arraycopy(src, 1, dst, 0, 3);
    System.out.println(Arrays.toString(dst));
  `), '[2, 3, 4, 0]'));

  it('Math.PI / Integer.MAX_VALUE constants', () => expectStdout(wrap(`
    System.out.println(Integer.MAX_VALUE);
    System.out.printf("%.4f%n", Math.PI);
  `), '2147483647\n3.1416'));

  // ── stdlib: collections + for-each ──
  it('ArrayList for-each + Collections.sort', () => expectStdout(wrap(`
    ArrayList<Integer> list = new ArrayList<>();
    list.add(5); list.add(1); list.add(3);
    Collections.sort(list);
    int sum = 0;
    for (int x : list) sum += x;
    System.out.println(list);
    System.out.println(sum);
  `), '[1, 3, 5]\n9'));

  it('HashSet de-duplicates', () => expectStdout(wrap(`
    HashSet<Integer> s = new HashSet<>();
    s.add(1); s.add(1); s.add(2);
    System.out.println(s.size());
    System.out.println(s.contains(2));
    System.out.println(s.contains(9));
  `), '2\ntrue\nfalse'));

  it('TreeSet iterates in sorted order', () => expectStdout(wrap(`
    TreeSet<Integer> s = new TreeSet<>();
    s.add(3); s.add(1); s.add(2);
    StringBuilder sb = new StringBuilder();
    for (int x : s) sb.append(x);
    System.out.println(sb.toString());
  `), '123'));

  it('HashMap keySet + getOrDefault', () => expectStdout(wrap(`
    HashMap<String, Integer> counts = new HashMap<>();
    String[] words = {"a", "b", "a", "a", "b"};
    for (String w : words) counts.put(w, counts.getOrDefault(w, 0) + 1);
    System.out.println(counts.get("a"));
    System.out.println(counts.get("b"));
    System.out.println(counts.getOrDefault("z", -1));
  `), '3\n2\n-1'));

  it('LinkedHashMap preserves insertion order in toString', () => expectStdout(wrap(`
    LinkedHashMap<String, Integer> m = new LinkedHashMap<>();
    m.put("b", 2); m.put("a", 1);
    System.out.println(m);
  `), '{b=2, a=1}'));

  it('TreeMap sorts keys', () => expectStdout(wrap(`
    TreeMap<String, Integer> m = new TreeMap<>();
    m.put("b", 2); m.put("a", 1); m.put("c", 3);
    System.out.println(m);
    System.out.println(m.firstKey());
  `), '{a=1, b=2, c=3}\na'));

  it('Stack is LIFO', () => expectStdout(wrap(`
    Stack<Integer> st = new Stack<>();
    st.push(1); st.push(2); st.push(3);
    System.out.println(st.pop());
    System.out.println(st.peek());
    System.out.println(st.size());
  `), '3\n2\n2'));

  it('ArrayDeque as FIFO queue', () => expectStdout(wrap(`
    ArrayDeque<Integer> q = new ArrayDeque<>();
    q.offer(1); q.offer(2); q.offer(3);
    System.out.println(q.poll());
    System.out.println(q.poll());
    System.out.println(q.peek());
  `), '1\n2\n3'));

  it('entrySet iteration (LinkedHashMap, defined order)', () => expectStdout(wrap(`
    LinkedHashMap<String, Integer> m = new LinkedHashMap<>();
    m.put("x", 10); m.put("y", 20);
    for (Map.Entry<String, Integer> e : m.entrySet()) {
      System.out.println(e.getKey() + "->" + e.getValue());
    }
  `), 'x->10\ny->20'));

  // ── stdlib: Scanner (reads from preset stdin) ──
  it('Scanner reads ints from stdin', () => expectStdoutWithInput(wrap(`
    Scanner sc = new Scanner(System.in);
    int n = sc.nextInt();
    int sum = 0;
    for (int i = 0; i < n; i++) sum += sc.nextInt();
    System.out.println(sum);
  `), '3\n10 20 30', '60'));

  it('Scanner nextInt then nextLine gotcha (Java semantics)', () => expectStdoutWithInput(wrap(`
    Scanner sc = new Scanner(System.in);
    int n = sc.nextInt();
    sc.nextLine();
    String line = sc.nextLine();
    System.out.println(n);
    System.out.println("[" + line + "]");
  `), '42\nhello world', '42\n[hello world]'));

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

  // ── Multiple top-level classes (tester + logic split) ──
  // A source file may declare more than one top-level class; `ClassName.method()`
  // dispatches statics against that class's own table. javac forbids two *public*
  // top-level classes per file, but this educational engine is lenient.
  it('qualified static call on a second top-level class', () => expectStdout(
    `public class Main {
      public static void main(String[] args) {
        System.out.println(Helper.val());
      }
    }
    public class Helper {
      public static int val() { return 42; }
    }`, '42'));

  it('entry class need not be declared first', () => expectStdout(
    `public class Logic {
      public static int twice(int n) { return n * 2; }
    }
    public class Runner {
      public static void main(String[] args) {
        System.out.println(Logic.twice(21));
      }
    }`, '42'));

  it('non-entry class calls its own sibling static helper unqualified', () => expectStdout(
    `public class Main {
      public static void main(String[] args) {
        System.out.println(Helper.compute());
      }
    }
    public class Helper {
      public static int compute() { return base() + 1; }
      public static int base() { return 10; }
    }`, '11'));

  it('instance method calls a sibling instance method unqualified', () => expectStdout(
    `public class Main {
      int getX() { return 5; }
      int doubleX() { return getX() * 2; }
      public static void main(String[] args) {
        Main m = new Main();
        System.out.println(m.doubleX());
      }
    }`, '10'));

  it('CoffeeShop tester + logic split (from examples)', () => expectStdout(
    `public class CoffeeShopTester {
      public static void main(String[] args) {
        System.out.println("=== COFFEE SHOP TESTER ===");
        if (testPriceOf()) {
          System.out.println("testPriceOf: PASS");
        } else {
          System.out.println("testPriceOf: FAIL");
        }
      }
      public static boolean testPriceOf() {
        String[] menu = {"latte", "drip"};
        int[] prices = {5, 3};
        if (CoffeeShop.priceOf(menu, prices, "drip") != 3) return false;
        if (CoffeeShop.priceOf(menu, prices, "tea") != -1) return false;
        return true;
      }
    }
    public class CoffeeShop {
      public static int priceOf(String[] menu, int[] prices, String item) {
        for (int i = 0; i < menu.length; i++) {
          if (menu[i].equals(item)) return prices[i];
        }
        return -1;
      }
    }`, '=== COFFEE SHOP TESTER ===\ntestPriceOf: PASS'));

  it('the shipped "multiple-classes" example runs and passes', () => {
    const example = examples.find(e => e.slug === 'multiple-classes');
    expect(example).toBeDefined();
    expectStdout(example!.code, '=== COFFEE SHOP TESTER ===\ntestPriceOf: PASS');
  });

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

  // ── Numeric assignment conversion (REGRESSION) ──
  // Values bound to a variable/parameter of declared floating-point type were
  // stored with the *initializer literal's* javaType, so `double x = 1;` kept
  // javaType 'int' and a later `target / x` ran integer division. coerceToType()
  // in setVariable/updateVariable now widens int -> double on binding.

  it('Newton sqrt(2013) — double, not integer, division', () => expectStdout(wrap(`
    double target = 2013;
    double x = 1;
    double oldx;
    do {
      oldx = x;
      x = (x + target / x) / 2;
    }
    while (oldx != x);
    System.out.println(x);
    System.out.println(x*x);
  `), '44.86646854834911\n2013.0'));

  it('int literal assigned to double divides as double', () =>
    expectStdout(wrap(`double x = 5; System.out.println(x / 2);`), '2.5'));

  it('reassigning a double keeps it a double', () =>
    expectStdout(wrap(`double d = 7; d = d / 2; System.out.println(d);`), '3.5'));

  it('int argument widens to double parameter', () => expectStdout(wrap(`
    System.out.println(half(7));
  `, `static double half(double d) { return d / 2; }`), '3.5'));

  it('increment preserves double type (fractional part kept)', () =>
    expectStdout(wrap(`double d = 1.5; d++; System.out.println(d);`), '2.5'));

  // Guard against over-eager coercion: int math must still truncate.
  it('int division still truncates after coercion fix', () =>
    expectStdout(wrap(`int a = 7; System.out.println(a / 2);`), '3'));
});
