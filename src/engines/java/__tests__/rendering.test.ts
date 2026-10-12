/**
 * How objects are drawn and dispatched when a user class shares a library
 * class's name (#8). A student's LinkedList, Stack or HashMap is an ordinary
 * object with its declared fields and its own methods; only objects the
 * standard library made are drawn as lists, sets and maps.
 */
import { describe, it, expect } from 'vitest';
import { parseJava, child, children, token, type CstNode } from '../parser';
import { JavaInterpreter } from '../interpreter';
import { examples as javaExamples } from '../examples';
import type { ExecutionSnapshot, HeapObject } from '../../../types/snapshot';

function run(source: string): { snapshots: ExecutionSnapshot[]; error?: string; stdout: string } {
  const result = new JavaInterpreter().execute(parseJava(source));
  return { ...result, stdout: result.snapshots.at(-1)?.stdout.join('\n') ?? '' };
}

const finalHeap = (source: string): HeapObject[] => {
  const result = run(source);
  expect(result.error, 'interpreter error').toBeUndefined();
  return result.snapshots[result.snapshots.length - 1].heap;
};

/** Each class declared in a source, with its instance fields in declaration order. */
function declaredInstanceFields(source: string): Map<string, string[]> {
  const classes = new Map<string, string[]>();
  const visit = (node: CstNode) => {
    if (node.name === 'normalClassDeclaration') {
      const name = token(child(node, 'typeIdentifier')!, 'Identifier')!.image;
      const fields: string[] = [];
      for (const decl of children(child(node, 'classBody')!, 'classBodyDeclaration')) {
        const field = child(child(decl, 'classMemberDeclaration') ?? decl, 'fieldDeclaration');
        if (!field || children(field, 'fieldModifier').some(m => m.children.Static)) continue;
        for (const d of children(child(field, 'variableDeclaratorList')!, 'variableDeclarator')) {
          fields.push(token(child(d, 'variableDeclaratorId')!, 'Identifier')!.image);
        }
      }
      classes.set(name, fields);
    }
    for (const items of Object.values(node.children)) {
      for (const item of items) if ('children' in item) visit(item);
    }
  };
  visit(parseJava(source));
  return classes;
}

describe('shipped examples draw user classes as objects with their declared fields', () => {
  for (const example of javaExamples) {
    it(example.slug, () => {
      const classes = declaredInstanceFields(example.code);
      const heap = finalHeap(example.code);
      for (const obj of heap.filter(h => h.label !== undefined && classes.has(h.label))) {
        expect(obj.objectType, `${obj.label} #${obj.id}`).toBe('object');
        expect(obj.properties.map(p => p.key), `${obj.label} #${obj.id}`).toEqual(classes.get(obj.label!));
      }
    });
  }

  it('shows the Linked List example with head and tail pointing at its nodes', () => {
    const example = javaExamples.find(e => e.slug === 'linked-list')!;
    const heap = finalHeap(example.code);
    const list = heap.find(h => h.label === 'LinkedList')!;
    expect(list.objectType).toBe('object');
    const target = (key: string) => {
      const value = list.properties.find(p => p.key === key)!.value;
      return value.type === 'ref' ? heap.find(h => h.id === value.heapId) : undefined;
    };
    expect(target('head')?.properties.find(p => p.key === 'value')?.value).toEqual({ type: 'number', value: 10 });
    expect(target('tail')?.properties.find(p => p.key === 'value')?.value).toEqual({ type: 'number', value: 30 });
  });
});

describe('printing arrays and objects (#19)', () => {
  it('prints identity strings as Object.toString does, and a char[] as its characters', () => {
    const result = run(`public class Main {
  static class Pt { int x; }
  public static void main(String[] args) {
    int[] a = {1, 2};
    char[] cs = {'h', 'i'};
    System.out.println("" + a);
    System.out.println(new Pt[1]);
    System.out.println(new Pt());
    System.out.println(new String[2][2]);
    System.out.println(new Object());
    System.out.println(cs);
    System.out.println(String.valueOf(cs) + new StringBuilder().append(cs));
    System.out.println(("" + a).equals("" + a));
  }
}`);
    const [array, pts, pt, grid, object, chars, both, stable] = result.stdout.split('\n');
    expect(array).toMatch(/^\[I@[0-9a-f]{8}$/);
    expect(pts).toMatch(/^\[LMain\$Pt;@[0-9a-f]{8}$/);
    expect(pt).toMatch(/^Main\$Pt@[0-9a-f]{8}$/);
    expect(grid).toMatch(/^\[\[Ljava\.lang\.String;@[0-9a-f]{8}$/);
    expect(object).toMatch(/^java\.lang\.Object@[0-9a-f]{8}$/);
    expect([chars, both, stable]).toEqual(['hi', 'hihi', 'true']);
  });

  it("formats %s with the object's own toString()", () => {
    const result = run(`public class Main {
  static class Pt { public String toString() { return "(1, 2)"; } }
  public static void main(String[] args) {
    System.out.printf("p=%s%n", new Pt());
    System.out.println(String.format("%s", new Pt()) + String.valueOf(new Pt()));
  }
}`);
    expect(result.stdout).toBe('p=(1, 2)\n(1, 2)(1, 2)');
  });
});

describe('a user class named after a library class', () => {
  it('is drawn as an object, and its own methods run', () => {
    const source = `public class Main {
  static class Stack {
    int[] data = new int[4];
    int top;
    void push(int x) { data[top++] = x; }
    int pop() { return data[--top]; }
  }
  public static void main(String[] args) {
    Stack s = new Stack();
    s.push(7);
    s.push(8);
    System.out.println(s.pop());
  }
}`;
    const result = run(source);
    expect(result.stdout).toBe('8');
    const stack = result.snapshots.at(-1)!.heap.find(h => h.label === 'Stack')!;
    expect(stack.objectType).toBe('object');
    expect(stack.properties.map(p => p.key)).toEqual(['data', 'top']);
    expect(stack.properties[1].value).toEqual({ type: 'number', value: 1 });
  });

  it("isn't printed, iterated or type-checked as the library class", () => {
    const source = `public class Main {
  static class HashMap { int size; }
  static class ArrayList { int count; }
  static class StringBuilder {
    String text = "";
    StringBuilder append(String s) { text = text + "<" + s + ">"; return this; }
  }
  public static void main(String[] args) {
    HashMap m = new HashMap();
    System.out.println(String.valueOf(m).startsWith("Main$HashMap@"));
    StringBuilder sb = new StringBuilder();
    sb.append("a").append("b");
    System.out.println(sb.text);
    Object list = new ArrayList();
    System.out.println(list instanceof java.util.List);
  }
}`;
    const result = run(source);
    expect(result.stdout).toBe('true\n<a><b>\nfalse');
    expect(result.error).toBeUndefined();
    // Iterating over it is javac's error, since the class isn't Iterable.
    const loop = run(source.replace('System.out.println(list instanceof java.util.List);', 'for (Object x : new ArrayList()) { }'));
    expect(loop.error).toBe('Line 15: for-each not applicable to expression type\n  required: array or java.lang.Iterable\n  found:    ArrayList');
  });

  it('shows every declared field, including ones that start with __', () => {
    const heap = finalHeap(`public class Main {
  static class Box { int __secret = 4; int shown = 5; }
  public static void main(String[] args) { Box b = new Box(); }
}`);
    expect(heap.find(h => h.label === 'Box')!.properties.map(p => p.key)).toEqual(['__secret', 'shown']);
  });

  it('leaves library collections drawn as collections', () => {
    const heap = finalHeap(`import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<Integer> list = new ArrayList<>(List.of(1, 2));
    Map<String, Integer> map = new HashMap<>();
    map.put("a", 1);
    Set<String> set = new TreeSet<>(List.of("x"));
  }
}`);
    expect(heap.find(h => h.label === 'ArrayList')?.objectType).toBe('list');
    expect(heap.find(h => h.label === 'HashMap')?.objectType).toBe('map');
    expect(heap.find(h => h.label === 'TreeSet')?.objectType).toBe('set');
  });
});
