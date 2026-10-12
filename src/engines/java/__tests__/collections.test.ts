/**
 * Collections as java.util has them (#21): HashMap's table and iteration
 * order, how collections, views and iterators are drawn, iterators that fail
 * fast, and Object's equals/hashCode/toString. Program outputs were checked
 * against JDK 21; the corpus case extra/collections-behavior covers the rest
 * of the behavior against its JDK golden.
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import { hashCodeOf, newTable, hashInsert, presize, tableSizeFor } from '../stdlib/hashing';
import { newBuiltin, callInstanceMethod } from '../stdlib/collections';
import type { StdlibContext } from '../stdlib/context';
import { type JavaValue, type JavaHeapEntry, javaInt, javaLong, javaDouble, javaChar, javaBool, javaString, javaNull, javaValueToString } from '../types';
import type { ExecutionSnapshot, HeapObject, RuntimeValue } from '../../../types/snapshot';

function run(source: string) {
  const result = new JavaInterpreter().execute(parseJava(source));
  return { ...result, last: result.snapshots.at(-1)!, stdout: result.snapshots.at(-1)?.stdout ?? [] };
}

function runClean(source: string) {
  const result = run(source);
  expect(result.error, 'interpreter error').toBeUndefined();
  return result;
}

const program = (body: string, members = '') => `import java.util.*;
public class Main {
${members}
  public static void main(String[] args) {
    ${body}
  }
}`;

function variable(snapshot: ExecutionSnapshot, name: string): RuntimeValue | undefined {
  for (const frame of snapshot.callStack) {
    const found = frame.variables.find(v => v.name === name);
    if (found) return found.value;
  }
  return undefined;
}

const target = (snapshot: ExecutionSnapshot, value: RuntimeValue | undefined): HeapObject | undefined =>
  value?.type === 'ref' ? snapshot.heap.find(h => h.id === value.heapId) : undefined;

/** The object a variable refers to, drawn as `label objectType [entries]`, with primitives and strings as their values. */
function drawn(snapshot: ExecutionSnapshot, name: string): string {
  const obj = target(snapshot, variable(snapshot, name))!;
  const show = (v: RuntimeValue) => (v.type === 'ref' ? `#${v.heapId}` : String(v.value));
  const entries = obj.properties.map(p => (obj.objectType === 'map' ? `${p.key}=${show(p.value)}` : show(p.value)));
  return `${obj.label} ${obj.objectType} [${entries.join(', ')}]`;
}

function makeCtx(): StdlibContext {
  const heap = new Map<string, JavaHeapEntry>();
  let next = 1;
  return {
    heap,
    allocArray: (elementType, elements) => { const id = String(next++); heap.set(id, { elementType, elements }); return id; },
    allocObject: (className, fields) => { const id = String(next++); heap.set(id, { className, fields, builtin: true }); return id; },
    random: () => 0.5,
    stdin: '',
    writeStdout: () => {},
    invokeUserMethod: () => undefined,
  };
}

describe('hashCode', () => {
  it("is Java's for strings, boxes, collections and entries", () => {
    const ctx = makeCtx();
    expect(hashCodeOf(javaString('hello'), ctx)).toBe(99162322);
    expect(hashCodeOf(javaInt(-5), ctx)).toBe(-5);
    expect(hashCodeOf(javaChar(97), ctx)).toBe(97);
    expect(hashCodeOf(javaLong(5000000000n), ctx)).toBe(705032705); // (int)(v ^ (v >>> 32))
    expect(hashCodeOf(javaBool(true), ctx)).toBe(1231);
    expect(hashCodeOf(javaDouble(1.5), ctx)).toBe(1073217536);
    expect(hashCodeOf(javaNull(), ctx)).toBe(0);
    const list = newBuiltin('ArrayList', [], ctx)!;
    callInstanceMethod(list, 'add', [javaInt(1)], ctx);
    callInstanceMethod(list, 'add', [javaInt(2)], ctx);
    expect(hashCodeOf(list, ctx)).toBe(994); // 31 * (31 * 1 + 1) + 2
    const set = newBuiltin('HashSet', [list], ctx)!;
    expect(hashCodeOf(set, ctx)).toBe(3); // the sum
    const map = newBuiltin('HashMap', [], ctx)!;
    callInstanceMethod(map, 'put', [javaString('k'), javaString('v')], ctx);
    expect(hashCodeOf(map, ctx)).toBe(107 ^ 118);
  });

  it("uses a user class's hashCode(), else the identity hash", () => {
    const ctx = makeCtx();
    ctx.heap.set('u1', { className: 'Point', fields: new Map() });
    ctx.heap.set('u2', { className: 'Plain', fields: new Map() });
    ctx.invokeUserMethod = (ref, name) => (ref.kind === 'objectRef' && ref.className === 'Point' && name === 'hashCode' ? javaInt(42) : undefined);
    expect(hashCodeOf({ kind: 'objectRef', heapId: 'u1', className: 'Point' }, ctx)).toBe(42);
    const identity = hashCodeOf({ kind: 'objectRef', heapId: 'u2', className: 'Plain' }, ctx);
    expect(identity).toBeGreaterThan(0);
  });
});

describe("HashMap's table", () => {
  /** Insert keys whose hashes are the given numbers (into `keys`), and return them in iteration order. */
  function order(hashes: number[], bucketOrder = true, table = newTable(), keys: JavaValue[] = []): number[] {
    for (const h of hashes) hashInsert(table, [keys], [javaInt(h)], h, bucketOrder);
    return keys.map(k => (k as { value: number }).value);
  }

  it('iterates bucket by bucket, in insertion order within a bucket', () => {
    expect(order([17, 1, 33, 2])).toEqual([17, 1, 33, 2]); // 17, 1 and 33 share bucket 1 of 16
    expect(order([5, 3, 4])).toEqual([3, 4, 5]);
  });

  it('doubles past 0.75 of its capacity, keeping each new bucket in insertion order', () => {
    const table = newTable();
    const keys = order([32, 0, 16, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true, table);
    expect(table.capacity).toBe(32);
    expect(keys).toEqual([32, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 16]);
  });

  it('doubles instead of making a tree when a bucket reaches 9 keys in a table smaller than 64', () => {
    const table = newTable(), keys: JavaValue[] = [];
    order([0, 16, 32, 48, 64, 80, 96, 112], true, table, keys);
    expect(table.capacity).toBe(16);
    order([128], true, table, keys);
    expect(table.capacity).toBe(32);
  });

  it("keeps a LinkedHashMap's insertion order", () => {
    expect(order([5, 3, 4], false)).toEqual([5, 3, 4]);
  });

  it('sizes a table for the entries of a copy, as HashMap.putMapEntries does', () => {
    expect(tableSizeFor(0)).toBe(1);
    expect(tableSizeFor(17)).toBe(32);
    const fresh = newTable();
    presize(fresh, [], 12, true);
    expect(fresh.initialCapacity).toBe(16); // ceil(12 / 0.75)
    presize(fresh, [], 13, true);
    expect(fresh.initialCapacity).toBe(32);
    const used = newTable(), keys: JavaValue[] = [];
    order([1], true, used, keys);
    presize(used, [keys], 25, true);
    expect(used.capacity).toBe(64);
  });
});

describe('drawing collections', () => {
  it("draws a HashMap and a HashSet in Java's iteration order", () => {
    const { last } = runClean(program(`Map<String, Integer> m = new HashMap<>();
    m.put("banana", 3); m.put("apple", 1); m.put("cherry", 7); m.put("date", 2);
    Set<Integer> s = new HashSet<>(List.of(42, 7, 19, 3, 100));`));
    expect(drawn(last, 'm')).toBe('HashMap map [banana=3, date=2, apple=1, cherry=7]');
    expect(drawn(last, 's')).toBe('HashSet set [19, 3, 100, 7, 42]');
  });

  it('draws a PriorityQueue as its heap array', () => {
    const { last } = runClean(program(`PriorityQueue<Integer> pq = new PriorityQueue<>();
    pq.add(5); pq.add(1); pq.add(4); pq.add(2); pq.add(3);`));
    expect(drawn(last, 'pq')).toBe('PriorityQueue list [1, 2, 4, 5, 3]');
  });

  it("draws keySet(), values() and subList() views with what they show now, and an unmodifiable view with its list's contents", () => {
    const { last } = runClean(program(`Map<String, Integer> m = new TreeMap<>();
    Set<String> keys = m.keySet();
    Collection<Integer> vals = m.values();
    m.put("b", 2); m.put("a", 1);
    List<Integer> xs = new ArrayList<>(List.of(1, 2, 3, 4));
    List<Integer> mid = xs.subList(1, 3);
    List<Integer> ro = Collections.unmodifiableList(xs);
    xs.set(1, 20);`));
    expect(drawn(last, 'keys')).toBe('KeySet set [a, b]');
    expect(drawn(last, 'vals')).toBe('Values list [1, 2]');
    expect(drawn(last, 'mid')).toBe('SubList list [20, 3]');
    expect(drawn(last, 'ro')).toBe('ArrayList list [1, 20, 3, 4]');
  });

  it('draws the entries of entrySet() with the values setValue() gave them', () => {
    const { last } = runClean(program(`Map<String, Integer> m = new HashMap<>(Map.of("x", 1));
    Set<Map.Entry<String, Integer>> entries = m.entrySet();
    for (Map.Entry<String, Integer> e : entries) e.setValue(5);`));
    const set = target(last, variable(last, 'entries'))!;
    expect(set.objectType).toBe('set');
    const entry = target(last, set.properties[0].value)!;
    expect(entry.label).toBe('MapEntry');
    expect(entry.properties.map(p => `${p.key}=${(p.value as { value: unknown }).value}`)).toEqual(['key=x', 'value=5']);
    expect(last.stdout).toEqual([]);
  });

  it("draws an Iterator's collection and cursor, which goes back after remove()", () => {
    const { snapshots } = runClean(program(`List<Integer> xs = new ArrayList<>(List.of(1, 2, 3));
    Iterator<Integer> it = xs.iterator();
    it.next();
    it.next();
    it.remove();
    int done = 1;`));
    const cursorAt = (line: number) => {
      const step = snapshots.find(s => s.line === line)!; // a line's step shows the state after it ran
      const iterator = target(step, variable(step, 'it'))!;
      return iterator.properties.map(p => (p.key === 'cursor' ? `cursor=${(p.value as { value: number }).value}` : p.key));
    };
    expect(cursorAt(8)).toEqual(['collection', 'cursor=2']); // the second next()
    expect(cursorAt(9)).toEqual(['collection', 'cursor=1']); // remove()
  });
});

describe('iterators that fail fast', () => {
  it('stop a for-each loop whose list changed with ConcurrentModificationException, at the loop', () => {
    const result = run(program(`List<String> xs = new ArrayList<>(List.of("a", "b", "c"));
    for (String x : xs) {
      if (x.equals("a")) xs.remove(x);
    }`));
    expect(result.error).toBe('Exception in thread "main" java.util.ConcurrentModificationException');
    expect(result.failure?.line).toBe(6);
  });

  it("walk a PriorityQueue the JDK's way when remove() moves an element behind the cursor, and descending iterators remove too", () => {
    const { stdout } = runClean(program(`PriorityQueue<Integer> pq = new PriorityQueue<>(List.of(1, 5, 2, 6, 7, 3, 4));
    Iterator<Integer> it = pq.iterator();
    StringBuilder seen = new StringBuilder();
    while (it.hasNext()) {
      int n = it.next();
      seen.append(n).append(' ');
      if (n == 6 || n == 4) it.remove();
    }
    System.out.println(seen + "| " + pq);
    LinkedList<String> ll = new LinkedList<>(List.of("a", "b", "c", "d"));
    Iterator<String> di = ll.descendingIterator();
    while (di.hasNext()) if (di.next().equals("c")) di.remove();
    System.out.println(ll);
    ArrayDeque<Integer> dq = new ArrayDeque<>(List.of(1, 2, 3, 4, 5));
    Iterator<Integer> qi = dq.descendingIterator();
    StringBuilder back = new StringBuilder();
    while (qi.hasNext()) { int v = qi.next(); back.append(v); if (v % 2 == 0) qi.remove(); }
    System.out.println(back + " " + dq);`));
    expect(stdout).toEqual(['1 5 2 6 7 3 4 | [1, 3, 2, 5, 7]', '[a, b, d]', '54321 [1, 3, 5]']);
  });
});

describe('views', () => {
  it('are Sets, Collections and Lists as in Java', () => {
    const { stdout } = runClean(program(`Map<String, Integer> m = new HashMap<>(Map.of("a", 1));
    Object keys = m.keySet(), vals = m.values(), entries = m.entrySet(), sub = new ArrayList<>(List.of(1, 2)).subList(0, 1);
    System.out.println((keys instanceof Set) + " " + (vals instanceof Collection) + " " + (vals instanceof Set) + " " + (entries instanceof Set) + " " + (sub instanceof List));
    Set<String> ks = (Set<String>) keys;
    System.out.println(ks.contains("a"));`));
    expect(stdout).toEqual(['true true false true true', 'true']);
  });
});

describe('copies that stand in for views', () => {
  it('refuse changes as an error, since a change would not reach the original', () => {
    const result = run(program(`TreeMap<Integer, String> tm = new TreeMap<>(Map.of(1, "a", 2, "b"));
    SortedMap<Integer, String> head = tm.headMap(2);
    System.out.println(head);
    head.put(0, "z");`));
    expect(result.stdout).toEqual(['{1=a}']);
    expect(result.error).toBe("Line 8: Changing the result of headMap() isn't supported in JavaTutor yet, since it is a copy here, not a view");
  });
});

describe("Object's methods", () => {
  it('give a class without its own equals, hashCode and toString the identity versions', () => {
    const { stdout } = runClean(program(`P a = new P(), b = new P();
    System.out.println(a.equals(b) + " " + a.equals(a));
    System.out.println(a.hashCode() == a.hashCode());
    System.out.println(a.toString().equals("Main$P@" + Integer.toHexString(a.hashCode())));
    Set<P> set = new HashSet<>();
    set.add(a); set.add(b); set.add(a);
    System.out.println(set.size());`, '  static class P {}'));
    expect(stdout).toEqual(['false true', 'true', 'true', '2']);
  });
});

describe('the library outside a program', () => {
  it('prints a HashMap made from a LinkedHashMap in hash order', () => {
    const ctx = makeCtx();
    const source = newBuiltin('LinkedHashMap', [], ctx)!;
    for (const k of ['banana', 'apple', 'cherry', 'date']) callInstanceMethod(source, 'put', [javaString(k), javaInt(k.length)], ctx);
    expect(javaValueToString(newBuiltin('HashMap', [source], ctx)!, ctx.heap)).toBe('{banana=6, date=4, apple=5, cherry=6}');
  });
});
