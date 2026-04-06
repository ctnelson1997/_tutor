import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';

function run(source: string) {
  try {
    const cst = parseJava(source);
    const interp = new JavaInterpreter();
    return interp.execute(cst);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { snapshots: [], error: `Parse error: ${message}` };
  }
}

function getStdout(source: string): string[] {
  const result = run(source);
  expect(result.error).toBeUndefined();
  const last = result.snapshots[result.snapshots.length - 1];
  return last?.stdout || [];
}

function getVars(source: string): Record<string, unknown> {
  const result = run(source);
  expect(result.error).toBeUndefined();
  const last = result.snapshots[result.snapshots.length - 1];
  const frame = last?.callStack[last.callStack.length - 1];
  if (!frame) return {};
  const vars: Record<string, unknown> = {};
  for (const v of frame.variables) {
    vars[v.name] = v.value.type === 'ref' ? `ref:${v.value.heapId}` : v.value.value;
  }
  return vars;
}

describe('Java Interpreter', () => {
  describe('Variables & Types', () => {
    it('declares int variables', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          int x = 42;
          int y = 10;
        }
      }`);
      expect(vars.x).toBe(42);
      expect(vars.y).toBe(10);
    });

    it('declares double variables', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          double pi = 3.14;
        }
      }`);
      expect(vars.pi).toBe(3.14);
    });

    it('declares boolean variables', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          boolean flag = true;
          boolean other = false;
        }
      }`);
      expect(vars.flag).toBe(true);
      expect(vars.other).toBe(false);
    });

    it('declares String variables', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          String name = "hello";
        }
      }`);
      expect(vars.name).toBe('hello');
    });
  });

  describe('Arithmetic', () => {
    it('evaluates basic arithmetic', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          int a = 3 + 4;
          int b = 10 - 2;
          int c = 3 * 5;
          int d = 10 / 3;
          int e = 10 % 3;
        }
      }`);
      expect(vars.a).toBe(7);
      expect(vars.b).toBe(8);
      expect(vars.c).toBe(15);
      expect(vars.d).toBe(3); // integer division
      expect(vars.e).toBe(1);
    });

    it('handles string concatenation', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String msg = "Hello" + " " + "World";
          System.out.println(msg);
        }
      }`);
      expect(stdout).toContain('Hello World');
    });

    it('handles int + string concatenation', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 5;
          System.out.println("x = " + x);
        }
      }`);
      expect(stdout).toContain('x = 5');
    });
  });

  describe('Control Flow', () => {
    it('executes if/else', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 10;
          if (x > 5) {
            System.out.println("big");
          } else {
            System.out.println("small");
          }
        }
      }`);
      expect(stdout).toContain('big');
    });

    it('executes for loop', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int sum = 0;
          for (int i = 0; i < 5; i++) {
            sum += i;
          }
          System.out.println(sum);
        }
      }`);
      expect(stdout).toContain('10');
    });

    it('executes while loop', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int n = 1;
          while (n < 10) {
            n = n * 2;
          }
          System.out.println(n);
        }
      }`);
      expect(stdout).toContain('16');
    });

    it('executes do-while loop', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int count = 0;
          do {
            count++;
          } while (count < 3);
          System.out.println(count);
        }
      }`);
      expect(stdout).toContain('3');
    });

    it('executes switch statement', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int day = 3;
          String name;
          switch (day) {
            case 1: name = "Mon"; break;
            case 2: name = "Tue"; break;
            case 3: name = "Wed"; break;
            default: name = "Other"; break;
          }
          System.out.println(name);
        }
      }`);
      expect(stdout).toContain('Wed');
    });

    it('handles break in for loop', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          for (int i = 0; i < 10; i++) {
            if (i == 3) break;
          }
          System.out.println("done");
        }
      }`);
      expect(stdout).toContain('done');
    });

    it('handles continue in for loop', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int sum = 0;
          for (int i = 0; i < 5; i++) {
            if (i == 2) continue;
            sum += i;
          }
          System.out.println(sum);
        }
      }`);
      expect(stdout).toContain('8'); // 0+1+3+4 = 8
    });

    it('for loop variable i appears in a block scope frame', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int sum = 0;
          for (int i = 0; i < 3; i++) {
            sum += i;
          }
        }
      }`);
      expect(result.error).toBeUndefined();
      // Find a snapshot inside the loop — should have a block scope frame with i
      const loopSnapshot = result.snapshots.find(s =>
        s.callStack.some(f => f.isBlockScope && f.variables.some(v => v.name === 'i'))
      );
      expect(loopSnapshot).toBeDefined();
      // main frame should have sum but NOT i
      const mainFrame = loopSnapshot!.callStack[0];
      expect(mainFrame.isBlockScope).toBeFalsy();
      expect(mainFrame.variables.some(v => v.name === 'sum')).toBe(true);
      expect(mainFrame.variables.some(v => v.name === 'i')).toBe(false);
      // block scope frame should have i and be named "for"
      const blockFrame = loopSnapshot!.callStack.find(f => f.isBlockScope);
      expect(blockFrame).toBeDefined();
      expect(blockFrame!.name).toBe('for');
      expect(blockFrame!.variables.some(v => v.name === 'i')).toBe(true);
    });
  });

  describe('Methods', () => {
    it('calls static methods', () => {
      const stdout = getStdout(`public class Main {
        public static int add(int a, int b) {
          return a + b;
        }
        public static void main(String[] args) {
          int result = add(3, 4);
          System.out.println(result);
        }
      }`);
      expect(stdout).toContain('7');
    });

    it('handles recursion', () => {
      const stdout = getStdout(`public class Main {
        public static int factorial(int n) {
          if (n <= 1) return 1;
          return n * factorial(n - 1);
        }
        public static void main(String[] args) {
          System.out.println(factorial(5));
        }
      }`);
      expect(stdout).toContain('120');
    });

    it('tracks call stack', () => {
      const result = run(`public class Main {
        public static int helper(int x) {
          return x * 2;
        }
        public static void main(String[] args) {
          int y = helper(5);
        }
      }`);
      expect(result.error).toBeUndefined();
      // Should have snapshots with both main and helper on the call stack
      const helperSnapshot = result.snapshots.find(s => s.callStack.length === 2);
      expect(helperSnapshot).toBeDefined();
      expect(helperSnapshot!.callStack[0].name).toBe('main');
      expect(helperSnapshot!.callStack[1].name).toBe('helper');
    });
  });

  describe('Arrays', () => {
    it('creates arrays with initializer', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int[] nums = {10, 20, 30};
          System.out.println(nums[1]);
        }
      }`);
      expect(stdout).toContain('20');
    });

    it('creates arrays with new', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int[] arr = new int[3];
          arr[0] = 42;
          System.out.println(arr[0]);
        }
      }`);
      expect(stdout).toContain('42');
    });

    it('accesses array length', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int[] nums = {1, 2, 3, 4, 5};
          System.out.println(nums.length);
        }
      }`);
      expect(stdout).toContain('5');
    });

    it('supports enhanced for loop', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int[] nums = {1, 2, 3};
          int sum = 0;
          for (int n : nums) {
            sum += n;
          }
          System.out.println(sum);
        }
      }`);
      expect(stdout).toContain('6');
    });
  });

  describe('Strings', () => {
    it('calls String methods', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String s = "Hello";
          System.out.println(s.length());
          System.out.println(s.toUpperCase());
          System.out.println(s.substring(0, 3));
        }
      }`);
      expect(stdout[0]).toBe('5');
      expect(stdout[1]).toBe('HELLO');
      expect(stdout[2]).toBe('Hel');
    });
  });

  describe('Snapshots', () => {
    it('generates snapshots for each statement', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int x = 1;
          int y = 2;
          int z = x + y;
        }
      }`);
      expect(result.error).toBeUndefined();
      expect(result.snapshots.length).toBe(3);
      expect(result.snapshots[0].step).toBe(0);
      expect(result.snapshots[1].step).toBe(1);
      expect(result.snapshots[2].step).toBe(2);
    });

    it('includes heap objects for arrays', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int[] nums = {10, 20};
        }
      }`);
      expect(result.error).toBeUndefined();
      expect(result.snapshots[0].heap.length).toBeGreaterThan(0);
      expect(result.snapshots[0].heap[0].objectType).toBe('array');
    });
  });

  describe('Variables & Types (extended)', () => {
    it('declares char variables', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          char c = 'A';
        }
      }`);
      expect(vars.c).toBe('A');
    });

    it('handles null values', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          String s = null;
        }
      }`);
      expect(vars.s).toBeNull();
    });

    it('handles uninitialized variables with defaults', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int x;
          x = 5;
        }
      }`);
      expect(result.error).toBeUndefined();
      const last = result.snapshots[result.snapshots.length - 1];
      const frame = last.callStack[last.callStack.length - 1];
      const xVar = frame.variables.find(v => v.name === 'x');
      expect(xVar?.value.value).toBe(5);
    });

    it('handles string escape sequences', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String s = "line1\\nline2";
          System.out.println(s);
        }
      }`);
      expect(stdout[0]).toBe('line1\nline2');
    });

    it('handles multiple variable declarations', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          int a = 1, b = 2, c = 3;
        }
      }`);
      expect(vars.a).toBe(1);
      expect(vars.b).toBe(2);
      expect(vars.c).toBe(3);
    });
  });

  describe('Arithmetic (extended)', () => {
    it('handles operator precedence', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          int x = 2 + 3 * 4;
          int y = (2 + 3) * 4;
        }
      }`);
      expect(vars.x).toBe(14);
      expect(vars.y).toBe(20);
    });

    it('handles integer division truncation', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          int a = 7 / 2;
          int b = -7 / 2;
        }
      }`);
      expect(vars.a).toBe(3);
      expect(vars.b).toBe(-3);
    });

    it('handles double arithmetic', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          double x = 7.0 / 2.0;
        }
      }`);
      expect(vars.x).toBe(3.5);
    });

    it('handles compound assignment operators', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          int x = 10;
          x += 5;
          int y = 20;
          y -= 3;
          int z = 4;
          z *= 3;
          int w = 15;
          w /= 4;
          int m = 17;
          m %= 5;
        }
      }`);
      expect(vars.x).toBe(15);
      expect(vars.y).toBe(17);
      expect(vars.z).toBe(12);
      expect(vars.w).toBe(3);
      expect(vars.m).toBe(2);
    });

    it('handles unary minus', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          int x = -5;
          int y = -x;
        }
      }`);
      expect(vars.x).toBe(-5);
      expect(vars.y).toBe(5);
    });

    it('handles division by zero error', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int x = 5 / 0;
        }
      }`);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('ArithmeticException');
    });

    it('handles boolean operators', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          boolean a = true && false;
          boolean b = true || false;
          boolean c = !true;
        }
      }`);
      expect(vars.a).toBe(false);
      expect(vars.b).toBe(true);
      expect(vars.c).toBe(false);
    });

    it('handles comparison operators', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          boolean a = 5 > 3;
          boolean b = 3 >= 3;
          boolean c = 2 < 1;
          boolean d = 4 <= 4;
          boolean e = 5 == 5;
          boolean f = 5 != 3;
        }
      }`);
      expect(vars.a).toBe(true);
      expect(vars.b).toBe(true);
      expect(vars.c).toBe(false);
      expect(vars.d).toBe(true);
      expect(vars.e).toBe(true);
      expect(vars.f).toBe(true);
    });

    it('handles bitwise operators', () => {
      const vars = getVars(`public class Main {
        public static void main(String[] args) {
          int a = 5 & 3;
          int b = 5 | 3;
          int c = 5 ^ 3;
        }
      }`);
      expect(vars.a).toBe(1);   // 101 & 011 = 001
      expect(vars.b).toBe(7);   // 101 | 011 = 111
      expect(vars.c).toBe(6);   // 101 ^ 011 = 110
    });
  });

  describe('Unary Operators', () => {
    it('handles prefix increment', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 5;
          int y = ++x;
          System.out.println(x);
          System.out.println(y);
        }
      }`);
      expect(stdout).toContain('6');
      expect(stdout[0]).toBe('6');
      expect(stdout[1]).toBe('6');
    });

    it('handles postfix increment', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 5;
          int y = x++;
          System.out.println(x);
          System.out.println(y);
        }
      }`);
      expect(stdout[0]).toBe('6');
      expect(stdout[1]).toBe('5');
    });

    it('handles prefix decrement', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 5;
          int y = --x;
          System.out.println(x);
          System.out.println(y);
        }
      }`);
      expect(stdout[0]).toBe('4');
      expect(stdout[1]).toBe('4');
    });

    it('handles postfix decrement', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 5;
          int y = x--;
          System.out.println(x);
          System.out.println(y);
        }
      }`);
      expect(stdout[0]).toBe('4');
      expect(stdout[1]).toBe('5');
    });

    it('handles increment in for loop update', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int total = 0;
          for (int i = 0; i < 3; i++) {
            total += i;
          }
          System.out.println(total);
        }
      }`);
      expect(stdout).toContain('3'); // 0+1+2
    });
  });

  describe('Control Flow (extended)', () => {
    it('handles else-if chains', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int score = 75;
          String grade;
          if (score >= 90) {
            grade = "A";
          } else if (score >= 80) {
            grade = "B";
          } else if (score >= 70) {
            grade = "C";
          } else {
            grade = "F";
          }
          System.out.println(grade);
        }
      }`);
      expect(stdout).toContain('C');
    });

    it('handles if taking the false branch', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 1;
          if (x > 10) {
            System.out.println("yes");
          } else {
            System.out.println("no");
          }
        }
      }`);
      expect(stdout).toContain('no');
    });

    it('handles nested loops', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int count = 0;
          for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
              count++;
            }
          }
          System.out.println(count);
        }
      }`);
      expect(stdout).toContain('9');
    });

    it('handles while with break', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int i = 0;
          while (true) {
            if (i >= 5) break;
            i++;
          }
          System.out.println(i);
        }
      }`);
      expect(stdout).toContain('5');
    });

    it('handles switch with fall-through', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 1;
          int result = 0;
          switch (x) {
            case 1: result += 1;
            case 2: result += 2;
            case 3: result += 3; break;
            default: result = -1;
          }
          System.out.println(result);
        }
      }`);
      expect(stdout).toContain('6'); // 1+2+3 fall-through
    });

    it('handles switch default case', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 99;
          String label;
          switch (x) {
            case 1: label = "one"; break;
            case 2: label = "two"; break;
            default: label = "other"; break;
          }
          System.out.println(label);
        }
      }`);
      expect(stdout).toContain('other');
    });

    it('handles do-while that runs multiple times', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int n = 1;
          do {
            n = n * 2;
          } while (n < 100);
          System.out.println(n);
        }
      }`);
      expect(stdout).toContain('128');
    });

    it('handles do-while that runs exactly once', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 10;
          do {
            x++;
          } while (x < 5);
          System.out.println(x);
        }
      }`);
      expect(stdout).toContain('11');
    });
  });

  describe('Methods (extended)', () => {
    it('handles void methods', () => {
      const stdout = getStdout(`public class Main {
        public static void greet(String name) {
          System.out.println("Hello, " + name);
        }
        public static void main(String[] args) {
          greet("Alice");
        }
      }`);
      expect(stdout).toContain('Hello, Alice');
    });

    it('handles methods returning boolean', () => {
      const stdout = getStdout(`public class Main {
        public static boolean isEven(int n) {
          return n % 2 == 0;
        }
        public static void main(String[] args) {
          System.out.println(isEven(4));
          System.out.println(isEven(7));
        }
      }`);
      expect(stdout[0]).toBe('true');
      expect(stdout[1]).toBe('false');
    });

    it('handles methods returning String', () => {
      const stdout = getStdout(`public class Main {
        public static String repeat(String s, int n) {
          String result = "";
          for (int i = 0; i < n; i++) {
            result = result + s;
          }
          return result;
        }
        public static void main(String[] args) {
          System.out.println(repeat("ab", 3));
        }
      }`);
      expect(stdout).toContain('ababab');
    });

    it('handles multiple method calls in sequence', () => {
      const stdout = getStdout(`public class Main {
        public static int square(int x) {
          return x * x;
        }
        public static int cube(int x) {
          return x * square(x);
        }
        public static void main(String[] args) {
          System.out.println(square(3));
          System.out.println(cube(3));
        }
      }`);
      expect(stdout[0]).toBe('9');
      expect(stdout[1]).toBe('27');
    });

    it('handles recursive fibonacci', () => {
      const stdout = getStdout(`public class Main {
        public static int fib(int n) {
          if (n <= 1) return n;
          return fib(n - 1) + fib(n - 2);
        }
        public static void main(String[] args) {
          System.out.println(fib(7));
        }
      }`);
      expect(stdout).toContain('13');
    });

    it('handles method with no parameters', () => {
      const stdout = getStdout(`public class Main {
        public static int getAnswer() {
          return 42;
        }
        public static void main(String[] args) {
          System.out.println(getAnswer());
        }
      }`);
      expect(stdout).toContain('42');
    });

    it('emits a pre-call snapshot on the call site line before entering the method', () => {
      const result = run(`public class Main {
        public static int add(int a, int b) {
          return a + b;
        }
        public static void main(String[] args) {
          int x = 1;
          int y = add(2, 3);
        }
      }`);
      expect(result.error).toBeUndefined();
      // Find snapshots on the call line (line 7: int y = add(2, 3))
      const callLineSnaps = result.snapshots.filter(s => s.line === 7);
      expect(callLineSnaps.length).toBeGreaterThanOrEqual(1);
      // The first snapshot on line 7 should be the pre-call (only main frame, no add frame)
      const preCall = callLineSnaps[0];
      expect(preCall.callStack.length).toBe(1); // only main frame
      expect(preCall.callStack[0].name).toBe('main');
    });

    it('tracks correct call stack depth during recursion', () => {
      const result = run(`public class Main {
        public static int countdown(int n) {
          if (n <= 0) return 0;
          return countdown(n - 1);
        }
        public static void main(String[] args) {
          countdown(3);
        }
      }`);
      expect(result.error).toBeUndefined();
      // Find the deepest call stack
      const maxDepth = Math.max(...result.snapshots.map(s => s.callStack.length));
      expect(maxDepth).toBe(5); // main + countdown(3) + countdown(2) + countdown(1) + countdown(0)
    });
  });

  describe('Arrays (extended)', () => {
    it('handles array element assignment', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int[] arr = new int[3];
          arr[0] = 10;
          arr[1] = 20;
          arr[2] = 30;
          System.out.println(arr[0] + arr[1] + arr[2]);
        }
      }`);
      expect(stdout).toContain('60');
    });

    it('handles String arrays', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String[] names = {"Alice", "Bob", "Charlie"};
          System.out.println(names[2]);
        }
      }`);
      expect(stdout).toContain('Charlie');
    });

    it('handles array index out of bounds', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int[] arr = {1, 2, 3};
          int x = arr[5];
        }
      }`);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('ArrayIndexOutOfBoundsException');
    });

    it('handles boolean arrays', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          boolean[] flags = new boolean[3];
          flags[0] = true;
          System.out.println(flags[0]);
          System.out.println(flags[1]);
        }
      }`);
      expect(stdout[0]).toBe('true');
      expect(stdout[1]).toBe('false');
    });

    it('handles 2D arrays', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int[][] grid = {{1, 2}, {3, 4}, {5, 6}};
          System.out.println(grid[1][0]);
          System.out.println(grid[2][1]);
        }
      }`);
      expect(stdout[0]).toBe('3');
      expect(stdout[1]).toBe('6');
    });

    it('handles iterating with index and printing', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int[] nums = {10, 20, 30};
          for (int i = 0; i < nums.length; i++) {
            System.out.println(nums[i]);
          }
        }
      }`);
      expect(stdout).toEqual(['10', '20', '30']);
    });

    it('passes arrays to methods', () => {
      const stdout = getStdout(`public class Main {
        public static int sum(int[] arr) {
          int total = 0;
          for (int i = 0; i < arr.length; i++) {
            total += arr[i];
          }
          return total;
        }
        public static void main(String[] args) {
          int[] nums = {1, 2, 3, 4, 5};
          System.out.println(sum(nums));
        }
      }`);
      expect(stdout).toContain('15');
    });
  });

  describe('Strings (extended)', () => {
    it('handles charAt', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String s = "Hello";
          char c = s.charAt(1);
          System.out.println(c);
        }
      }`);
      expect(stdout).toContain('e');
    });

    it('handles indexOf', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String s = "Hello World";
          System.out.println(s.indexOf("World"));
          System.out.println(s.indexOf("xyz"));
        }
      }`);
      expect(stdout[0]).toBe('6');
      expect(stdout[1]).toBe('-1');
    });

    it('handles contains and startsWith', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String s = "Hello World";
          System.out.println(s.contains("World"));
          System.out.println(s.startsWith("Hello"));
          System.out.println(s.endsWith("World"));
        }
      }`);
      expect(stdout[0]).toBe('true');
      expect(stdout[1]).toBe('true');
      expect(stdout[2]).toBe('true');
    });

    it('handles toLowerCase and trim', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String s = "  HELLO  ";
          System.out.println(s.trim());
          System.out.println(s.toLowerCase());
        }
      }`);
      expect(stdout[0]).toBe('HELLO');
      expect(stdout[1]).toBe('  hello  ');
    });

    it('handles equals', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String a = "hello";
          String b = "hello";
          String c = "world";
          System.out.println(a.equals(b));
          System.out.println(a.equals(c));
        }
      }`);
      expect(stdout[0]).toBe('true');
      expect(stdout[1]).toBe('false');
    });

    it('handles replace', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String s = "aabbcc";
          System.out.println(s.replace("bb", "XX"));
        }
      }`);
      expect(stdout).toContain('aaXXcc');
    });

    it('handles isEmpty', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          String a = "";
          String b = "hi";
          System.out.println(a.isEmpty());
          System.out.println(b.isEmpty());
        }
      }`);
      expect(stdout[0]).toBe('true');
      expect(stdout[1]).toBe('false');
    });

    it('handles string concatenation with multiple types', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int i = 42;
          double d = 3.14;
          boolean b = true;
          System.out.println("i=" + i + " d=" + d + " b=" + b);
        }
      }`);
      expect(stdout[0]).toContain('i=42');
      expect(stdout[0]).toContain('b=true');
    });
  });

  describe('Static Fields', () => {
    it('reads and writes static fields', () => {
      const stdout = getStdout(`public class Main {
        static int counter;
        public static void main(String[] args) {
          counter = 10;
          counter += 5;
          System.out.println(counter);
        }
      }`);
      expect(stdout).toContain('15');
    });

    it('shares static fields between methods', () => {
      const stdout = getStdout(`public class Main {
        static int count;
        public static void increment() {
          count++;
        }
        public static void main(String[] args) {
          count = 0;
          increment();
          increment();
          increment();
          System.out.println(count);
        }
      }`);
      expect(stdout).toContain('3');
    });
  });

  describe('Math Methods', () => {
    it('handles Math.abs', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          System.out.println(Math.abs(-5));
        }
      }`);
      expect(stdout[0]).toBe('5.0');
    });

    it('handles Math.max and Math.min', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          System.out.println(Math.max(3, 7));
          System.out.println(Math.min(3, 7));
        }
      }`);
      expect(stdout[0]).toBe('7.0');
      expect(stdout[1]).toBe('3.0');
    });

    it('handles Math.pow and Math.sqrt', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          System.out.println(Math.pow(2, 10));
          System.out.println(Math.sqrt(144));
        }
      }`);
      expect(stdout[0]).toBe('1024.0');
      expect(stdout[1]).toBe('12.0');
    });
  });

  describe('Integer Wrapper', () => {
    it('handles Integer.parseInt', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = Integer.parseInt("42");
          System.out.println(x);
        }
      }`);
      expect(stdout).toContain('42');
    });
  });

  describe('System.out.print', () => {
    it('handles print without newline', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          System.out.print("Hello");
          System.out.print(" World");
          System.out.println("!");
        }
      }`);
      // print appends to current line, println starts a new one
      expect(stdout.join('')).toContain('Hello World');
    });
  });

  describe('Ternary Operator', () => {
    it('evaluates ternary expression', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 5;
          String result = (x > 3) ? "big" : "small";
          System.out.println(result);
        }
      }`);
      expect(stdout).toContain('big');
    });

    it('evaluates ternary with false condition', () => {
      const stdout = getStdout(`public class Main {
        public static void main(String[] args) {
          int x = 1;
          String result = (x > 3) ? "big" : "small";
          System.out.println(result);
        }
      }`);
      expect(stdout).toContain('small');
    });
  });

  describe('Snapshots (extended)', () => {
    it('tracks line numbers correctly', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int x = 1;
          int y = 2;
          int z = 3;
        }
      }`);
      expect(result.error).toBeUndefined();
      expect(result.snapshots[0].line).toBe(3);
      expect(result.snapshots[1].line).toBe(4);
      expect(result.snapshots[2].line).toBe(5);
    });

    it('tracks stdout accumulation across snapshots', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          System.out.println("a");
          System.out.println("b");
          System.out.println("c");
        }
      }`);
      expect(result.error).toBeUndefined();
      // Each println is an expression stmt + snapshot
      const snapshotsWithStdout = result.snapshots.filter(s => s.stdout.length > 0);
      expect(snapshotsWithStdout.length).toBeGreaterThan(0);
      const last = result.snapshots[result.snapshots.length - 1];
      expect(last.stdout).toEqual(['a', 'b', 'c']);
    });

    it('shows variables appearing incrementally', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int a = 1;
          int b = 2;
        }
      }`);
      expect(result.error).toBeUndefined();
      const frame0 = result.snapshots[0].callStack[0];
      const frame1 = result.snapshots[1].callStack[0];
      expect(frame0.variables.length).toBe(1);
      expect(frame0.variables[0].name).toBe('a');
      expect(frame1.variables.length).toBe(2);
      expect(frame1.variables[1].name).toBe('b');
    });

    it('includes array properties in heap', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int[] arr = {10, 20, 30};
        }
      }`);
      expect(result.error).toBeUndefined();
      const heap = result.snapshots[0].heap;
      expect(heap.length).toBe(1);
      expect(heap[0].objectType).toBe('array');
      expect(heap[0].properties.length).toBe(3);
      expect(heap[0].properties[0].value).toEqual({ type: 'number', value: 10 });
      expect(heap[0].properties[1].value).toEqual({ type: 'number', value: 20 });
      expect(heap[0].properties[2].value).toEqual({ type: 'number', value: 30 });
    });
  });

  describe('Error Handling', () => {
    it('reports parse errors for invalid syntax', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int x = ;
        }
      }`);
      // Should fail to parse
      expect(result.error).toBeDefined();
    });

    it('reports undefined variable errors', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int x = undefinedVar;
        }
      }`);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not defined');
    });

    it('reports unknown method errors', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          unknownMethod();
        }
      }`);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not defined');
    });

    it('enforces snapshot limit', () => {
      const result = run(`public class Main {
        public static void main(String[] args) {
          int i = 0;
          while (i >= 0) {
            i++;
          }
        }
      }`);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('5000');
    });
  });

  describe('Security', () => {
    it('analyzeCode flags suspicious patterns', async () => {
      const { analyzeCode } = await import('../security');
      const flags = analyzeCode('Runtime.getRuntime().exec("ls")');
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].level).toBe('warning');
    });

    it('analyzeCode returns empty for safe code', async () => {
      const { analyzeCode } = await import('../security');
      const flags = analyzeCode('int x = 5;');
      expect(flags.length).toBe(0);
    });
  });

  describe('Examples', () => {
    it('all examples execute successfully', async () => {
      const { examples } = await import('../examples');
      for (const example of examples) {
        const result = run(example.code);
        expect(result.error).toBeUndefined();
        expect(result.snapshots.length).toBeGreaterThan(0);
      }
    });

    it('all examples have correct metadata', async () => {
      const { examples } = await import('../examples');
      for (const example of examples) {
        expect(example.language).toBe('java');
        expect(example.title).toBeTruthy();
        expect(example.slug).toBeTruthy();
        expect(example.category).toBeTruthy();
        expect(example.code).toBeTruthy();
      }
    });
  });

  describe('Engine Contract', () => {
    it('exports a valid LanguageEngine', async () => {
      const { javaEngine } = await import('../index');
      expect(javaEngine.id).toBe('java');
      expect(javaEngine.displayName).toBe('Java');
      expect(typeof javaEngine.editorExtension).toBe('function');
      expect(typeof javaEngine.execute).toBe('function');
      expect(Array.isArray(javaEngine.examples)).toBe(true);
      expect(javaEngine.examples.length).toBeGreaterThan(0);
      expect(typeof javaEngine.sandboxCode).toBe('string');
      expect(typeof javaEngine.analyzeCode).toBe('function');
      expect(javaEngine.heapTypeConfig).toBeDefined();
    });
  });
});
