/**
 * What each step shows of the program's state (#9): static fields, only the
 * objects still reachable, no block variables left over from a block that has
 * ended, no value for a local that hasn't been assigned, frames labeled by
 * the construct they belong to, and library objects drawn with their state.
 * A step shows the state before its line runs (#24), so the state after line
 * L is the next step's.
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import type { ExecutionSnapshot, HeapObject, RuntimeValue, StackFrame } from '../../../types/snapshot';

function run(source: string): { snapshots: ExecutionSnapshot[]; error?: string; stdout: string } {
  const result = new JavaInterpreter().execute(parseJava(source));
  return { ...result, stdout: result.snapshots.at(-1)?.stdout.join('\n') ?? '' };
}

function runClean(source: string): ExecutionSnapshot[] {
  const result = run(source);
  expect(result.error, 'interpreter error').toBeUndefined();
  return result.snapshots;
}

const program = (body: string, members = '') => `import java.util.*;
public class Main {
${members}
  public static void main(String[] args) {
    ${body}
  }
}`;

/** Each frame as `name(variables)`, `this` first if the frame has one. */
function frames(snapshot: ExecutionSnapshot): string {
  return snapshot.callStack.map((f: StackFrame) => `${f.name}(${[...(f.thisArg ? ['this'] : []), ...f.variables.map(v => v.name)].join(',')})`).join(' ');
}

const stepsAt = (snapshots: ExecutionSnapshot[], line: number) => snapshots.filter(s => s.line === line);

function variable(snapshot: ExecutionSnapshot, name: string): RuntimeValue | undefined {
  for (const frame of snapshot.callStack) {
    const found = frame.variables.find(v => v.name === name);
    if (found) return found.value;
  }
  return undefined;
}

const target = (snapshot: ExecutionSnapshot, value: RuntimeValue | undefined): HeapObject | undefined =>
  value?.type === 'ref' ? snapshot.heap.find(h => h.id === value.heapId) : undefined;

const labels = (snapshot: ExecutionSnapshot) => snapshot.heap.map(h => h.label);

describe('static fields', () => {
  it('appear first, as Class.field, at every step', () => {
    const snapshots = runClean(`public class Main {
  static int moves = 0;
  static void hanoi(int n, char from, char to, char via) {
    if (n == 0) return;
    hanoi(n - 1, from, via, to);
    moves++;
    hanoi(n - 1, via, to, from);
  }
  public static void main(String[] args) {
    hanoi(2, 'A', 'C', 'B');
    System.out.println(moves);
  }
}`);
    for (const s of snapshots) {
      expect(s.callStack[0].name).toBe('Static fields');
      expect(s.callStack[0].variables.map(v => v.name)).toEqual(['Main.moves']);
    }
    expect(snapshots[0].callStack[0].variables[0].value).toEqual({ type: 'number', value: 0 });
    expect(snapshots.at(-1)!.callStack[0].variables[0].value).toEqual({ type: 'number', value: 3 });
  });

  it('point to their heap objects', () => {
    const snapshots = runClean(program('memo[1] = 1;', '  static long[] memo = new long[3];'));
    const last = snapshots.at(-1)!;
    const memo = target(last, variable(last, 'Main.memo'));
    expect(memo).toMatchObject({ objectType: 'array', label: 'long[]' });
    // A long goes to the UI as its exact digits.
    expect(memo!.properties.map(p => p.value)).toEqual(['0', '1', '0'].map(value => ({ type: 'bigint', value })));
  });

  it("appear for another class when it is first used, with its initializers' values", () => {
    const snapshots = runClean(program('int before = 1;\n    Counter c = new Counter();\n    int after = Counter.created;', `  static final int LIMIT = 3;
  static class Counter {
    static int created = 10;
    Counter() { created++; }
  }`));
    expect(frames(stepsAt(snapshots, 10)[0])).toBe('Static fields(Main.LIMIT) main(before)');
    expect(variable(snapshots.at(-1)!, 'Counter.created')).toEqual({ type: 'number', value: 11 });
    // new Counter() initializes Counter (in a <clinit> frame), then runs its constructor.
    const clinit = stepsAt(snapshots, 5)[0];
    expect(frames(clinit)).toBe('Static fields(Main.LIMIT,Counter.created) main(before) <clinit>()');
    expect(variable(clinit, 'Counter.created')).toEqual({ type: 'number', value: 0 });
    const ctor = stepsAt(snapshots, 6)[0];
    expect(frames(ctor)).toBe('Static fields(Main.LIMIT,Counter.created) main(before) Counter(this)');
    expect(variable(ctor, 'Counter.created')).toEqual({ type: 'number', value: 10 });
  });

  it("aren't shown in a program that has none", () => {
    const snapshots = runClean(program('int x = 1;'));
    expect(snapshots.every(s => s.callStack[0].name === 'main')).toBe(true);
  });
});

describe('only objects the program can still reach are drawn', () => {
  it('drops old arrays and leftover keySet() copies (the #9 repro)', () => {
    const snapshots = runClean(program(`int[] data = new int[2];
    for (int i = 0; i < 3; i++) data = Arrays.copyOf(data, data.length * 2);
    Map<String, Integer> m = new HashMap<>();
    m.put("a", 1);
    for (String k : m.keySet()) moves++;
    for (String k : m.keySet()) moves++;`, '  static int moves = 0;'));
    const last = snapshots.at(-1)!;
    expect(labels(last)).toEqual(['int[]', 'HashMap']);
    expect(target(last, variable(last, 'data'))!.properties).toHaveLength(16);
    expect(variable(last, 'Main.moves')).toEqual({ type: 'number', value: 2 });
  });

  it('drops an object once nothing refers to it', () => {
    const snapshots = runClean(program('Node n = new Node();\n    n.next = new Node();\n    n.next = null;\n    n = null;',
      '  static class Node { Node next; }'));
    expect(labels(stepsAt(snapshots, 7)[0])).toEqual(['Node', 'Node']);
    expect(labels(stepsAt(snapshots, 8)[0])).toEqual(['Node']);
    expect(stepsAt(snapshots, 9)[0].heap).toEqual([]);
  });

  it('keeps objects reached through fields, collections and callers, in the order they were made', () => {
    const snapshots = runClean(program(`List<Node> nodes = new ArrayList<>();
    Node head = new Node(1);
    head.next = new Node(2);
    nodes.add(new Node(3));
    touch(head);`, `  static class Node { int val; Node next; Node(int v) { val = v; } }
  static void touch(Node n) {
    int depth = 1;
  }`));
    // Inside touch(): main's head and nodes, and the node only the list holds.
    const inside = stepsAt(snapshots, 5)[0];
    expect(labels(inside)).toEqual(['ArrayList', 'Node', 'Node', 'Node']);
    const ids = inside.heap.map(h => Number(h.id));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    // A collection's backing array is drawn as its contents, not on its own.
    expect(inside.heap.some(h => h.objectType === 'array')).toBe(false);
  });

  it("draws an object while its constructor runs, through the frame's this", () => {
    const snapshots = runClean(program('new Box();', '  static class Box {\n    int size;\n    Box() { size = 4; }\n  }'));
    const inCtor = stepsAt(snapshots, 5)[0];
    expect(frames(inCtor)).toBe('main() Box(this)');
    expect(target(inCtor, inCtor.callStack[1].thisArg)).toMatchObject({ label: 'Box' });
    expect(snapshots.at(-1)!.heap).toEqual([]); // nothing kept the new Box
  });

  it('draws a caught exception through the catch parameter', () => {
    const snapshots = runClean(program('try {\n      throw new IllegalStateException("no");\n    } catch (IllegalStateException e) {\n      System.out.println(e.getMessage());\n    }'));
    const inCatch = stepsAt(snapshots, 8)[0];
    expect(frames(inCatch)).toBe('main() catch(e)');
    expect(target(inCatch, variable(inCatch, 'e'))).toMatchObject({ label: 'IllegalStateException' });
  });
});

describe('no block variables are left behind', () => {
  const source = `public class Main {
  static int find(int[] xs, int target) {
    for (int i = 0; i < xs.length; i++) {
      if (xs[i] == target) {
        int found = i;
        return found;
      }
    }
    return -1;
  }
  public static void main(String[] args) {
    int[] xs = {1, 2, 3};
    for (int x : xs) {
      int sq = x * x;
      if (sq > 3) {
        int flag = 1;
        continue;
      }
    }
    while (true) {
      int w = 5;
      if (w > 1) break;
    }
    int at = find(xs, 2);
    try {
      int[] small = new int[1];
      small[at] = 9;
    } catch (ArrayIndexOutOfBoundsException e) {
      int handled = 1;
    }
    System.out.println(at);
  }
}`;
  const snapshots = runClean(source);

  it('after continue: the next iteration shows only its own loop variable', () => {
    // The loop's first step comes before x exists; each later one shows only x (no sq or flag).
    expect(stepsAt(snapshots, 13).map(frames)).toEqual(['main(xs)', 'main(xs) for(x)', 'main(xs) for(x)', 'main(xs) for(x)']);
  });

  it('after break and return', () => {
    expect(frames(stepsAt(snapshots, 24)[0])).toBe('main(xs)'); // after the while loop's break
    expect(frames(stepsAt(snapshots, 26)[0])).toBe('main(xs,at)'); // after find() returned from inside its loop
    const returning = stepsAt(snapshots, 6).find(s => s.callStack.at(-1)!.name === 'find')!;
    expect(frames(returning)).toBe('main(xs) find(xs,target,return ↵)');
  });

  it('after a caught exception, which shows the try block where it happened', () => {
    const [assign] = stepsAt(snapshots, 27);
    expect(frames(assign)).toBe('main(xs,at) try(small)');
    expect(frames(stepsAt(snapshots, 29)[0])).toBe('main(xs,at) catch(e)');
    expect(frames(stepsAt(snapshots, 31)[0])).toBe('main(xs,at)');
  });
});

describe('the step where an exception starts shows the block it started in', () => {
  it('in a switch block', () => {
    const result = run(program('switch (1) {\n      case 1:\n        int[] tiny = new int[0];\n        tiny[0] = 5;\n    }'));
    expect(result.error).toContain('ArrayIndexOutOfBoundsException');
    const last = result.snapshots.at(-1)!;
    expect(last.line).toBe(8);
    expect(frames(last)).toBe('main() switch(tiny)');
  });

  it("in a field initializer, which doesn't see the constructor's parameters", () => {
    const result = run(program('new Risky(3);', `  static class Risky {
    int[] data = new int[2];
    int bad = data[5];
    Risky(int size) { }
  }`));
    expect(result.error).toContain('ArrayIndexOutOfBoundsException');
    const last = result.snapshots.at(-1)!;
    expect(last.line).toBe(5);
    expect(frames(last)).toBe('main() Risky(this)');
  });
});

describe('a local declared without a value', () => {
  it("isn't shown until it is assigned", () => {
    const snapshots = runClean(program('String label;\n    int count;\n    count = 2;\n    label = "x" + count;'));
    expect(frames(stepsAt(snapshots, 6)[0])).toBe('main()');
    expect(frames(stepsAt(snapshots, 7)[0])).toBe('main()');
    expect(frames(stepsAt(snapshots, 8)[0])).toBe('main(count)');
    expect(frames(stepsAt(snapshots, 9)[0])).toBe('main(label,count)'); // in declaration order
  });

  it('is shown once any branch assigns it', () => {
    const snapshots = runClean(program('int sign;\n    if (args.length > 0) sign = 1;\n    else sign = -1;\n    System.out.println(sign);'));
    expect(frames(stepsAt(snapshots, 8)[0])).toBe('main(args,sign)');
    expect(snapshots.at(-1)!.stdout).toEqual(['-1']);
  });

  it('is an error to read before it is assigned (javac rejects that)', () => {
    const result = run(program('int x;\n    if (args.length > 0) x = 1;\n    System.out.println(x);'));
    expect(result.error).toBe("Line 7: Variable 'x' might not have been initialized");
    expect(result.snapshots.length).toBeGreaterThan(0);
    expect(run(program('int total;\n    total += 5;')).error).toBe("Line 6: Variable 'total' might not have been initialized");
  });

  it("can't be declared with var", () => {
    expect(run(program('var x;')).error).toBe("Line 5: cannot infer type for local variable x\n  (cannot use 'var' on variable without initializer)");
  });
});

describe('frames', () => {
  it('label try, catch and finally blocks by their construct', () => {
    const snapshots = runClean(program(`try {
      int a = 1;
      throw new RuntimeException();
    } catch (RuntimeException e) {
      int b = 2;
      b++;
    } finally {
      int c = 3;
      c++;
    }`));
    expect(frames(stepsAt(snapshots, 7)[0])).toBe('main() try(a)');
    expect(frames(stepsAt(snapshots, 10)[0])).toBe('main() catch(e,b)');
    expect(frames(stepsAt(snapshots, 13)[0])).toBe('main() finally(c)');
  });

  it('show this apart from the variables', () => {
    const snapshots = runClean(program('Box b = new Box();\n    b.grow(2);', '  static class Box {\n    int size;\n    void grow(int by) { size += by; }\n  }'));
    const inGrow = stepsAt(snapshots, 5)[0];
    const grow = inGrow.callStack.find(f => f.name === 'grow')!;
    expect(grow.variables.map(v => v.name)).toEqual(['by']);
    expect(grow.thisArg).toEqual(variable(inGrow, 'b'));
  });
});

describe('library objects are drawn with their state', () => {
  it('a Scanner shows the input it has left, with line breaks visible', () => {
    const snapshots = runClean(program('Scanner in = new Scanner("5\\nhello\\n");\n    int n = in.nextInt();\n    String rest = in.nextLine();'));
    const remaining = (s: ExecutionSnapshot) => target(s, variable(s, 'in'))!.properties;
    expect(remaining(stepsAt(snapshots, 6)[0])).toEqual([{ key: 'remaining', value: { type: 'string', value: '5\nhello\n', display: '"5\\nhello\\n"' } }]);
    expect(remaining(stepsAt(snapshots, 7)[0])[0].value).toMatchObject({ display: '"\\nhello\\n"' });
    expect(remaining(stepsAt(snapshots, 8)[0])[0].value).toMatchObject({ display: '"hello\\n"' });
  });

  it('an Iterator shows its collection and its cursor', () => {
    const snapshots = runClean(program('List<Integer> nums = new ArrayList<>(List.of(3, 1));\n    Iterator<Integer> it = nums.iterator();\n    int first = it.next();'));
    const last = snapshots.at(-1)!;
    const it = target(last, variable(last, 'it'))!;
    expect(it.label).toBe('Iterator');
    expect(it.properties).toEqual([
      { key: 'collection', value: variable(last, 'nums') },
      { key: 'cursor', value: { type: 'number', value: 1 } },
    ]);
  });

  it('a Random shows its seed, which each call advances', () => {
    const snapshots = runClean(program('Random rng = new Random(42);\n    int r = rng.nextInt(10);\n    System.out.println(r);'));
    const seed = (s: ExecutionSnapshot) => target(s, variable(s, 'rng'))!.properties;
    expect(seed(stepsAt(snapshots, 6)[0])).toEqual([{ key: 'seed', value: { type: 'bigint', value: String(42n ^ 0x5DEECE66Dn) } }]);
    expect(seed(stepsAt(snapshots, 7)[0])[0].value).not.toEqual(seed(stepsAt(snapshots, 6)[0])[0].value);
    expect(snapshots.at(-1)!.stdout).toEqual(['0']); // new Random(42).nextInt(10) is 0 in Java too
  });

  it('a library Comparator shows how it orders', () => {
    const snapshots = runClean(program('Comparator<Integer> rev = Collections.reverseOrder();\n    Comparator<Integer> back = rev.reversed();'));
    const last = snapshots.at(-1)!;
    const reverse = { type: 'string', value: 'reverse', display: '"reverse"' };
    expect(target(last, variable(last, 'rev'))!.properties).toEqual([{ key: 'order', value: reverse }]);
    expect(target(last, variable(last, 'back'))!.properties).toEqual([
      { key: 'order', value: reverse },
      { key: 'base', value: variable(last, 'rev') },
    ]);
  });
});

describe('values show as Java writes them (#17)', () => {
  const last = runClean(program(`char grade = 'B';
    String letter = "B";
    double avg = 5;
    float f = 1.1f;
    double widened = f;
    long big = 9007199254740993L;
    String quoted = "a\\n\\"b\\"";
    char tab = '\\t';
    char[] blank = new char[1];
    int n = 7;`)).at(-1)!;
  const shown = (name: string) => variable(last, name);

  it(`tells a char from a String: 'B' and "B"`, () => {
    expect(shown('grade')).toEqual({ type: 'string', value: 'B', display: "'B'" });
    expect(shown('letter')).toEqual({ type: 'string', value: 'B', display: '"B"' });
    expect(shown('tab')).toMatchObject({ display: "'\\t'" });
    expect(target(last, shown('blank'))!.properties[0].value).toMatchObject({ display: "'\\u0000'" }); // the default char, visible
  });

  it('shows a whole-number double as 5.0, and a float with the digits Java prints', () => {
    expect(shown('avg')).toEqual({ type: 'number', value: 5, display: '5.0' });
    expect(shown('f')).toEqual({ type: 'number', value: Math.fround(1.1), display: '1.1' });
    expect(shown('widened')).toMatchObject({ display: '1.100000023841858' }); // (double) 1.1f
  });

  it('shows a long exactly, even past 2^53', () => {
    expect(shown('big')).toEqual({ type: 'bigint', value: '9007199254740993' });
  });

  it('shows the escapes of a string', () => {
    expect(shown('quoted')).toEqual({ type: 'string', value: 'a\n"b"', display: '"a\\n\\"b\\""' });
  });

  it('leaves ints as they were', () => {
    expect(shown('n')).toEqual({ type: 'number', value: 7 });
  });
});
