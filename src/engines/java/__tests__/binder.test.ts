/**
 * Name resolution and static types (#13): what the binder decides about a
 * program, shown as S-expressions of the bound tree.
 *
 * - The rows of #13's table, as binding decisions: overloads chosen by type,
 *   constructors by type, varargs packed into an array, the type of `?:`,
 *   `Integer.toString(42)` as the library's static method, `==` on boxed
 *   Integers as identity, and `list.remove(Integer.valueOf(40))` as
 *   remove(Object). (#14 runs them.)
 * - Names classified as JLS §6.5 does; generics flowing through the
 *   library's signatures; conversions made explicit; constants folded.
 * - Programs javac rejects get javac's message; every valid corpus program
 *   binds without an error, and names only library methods the stubs lack
 *   dynamically.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseAst } from '../ast/convert';
import { bindProgram, type Diagnostic } from '../semantic/binder';
import type * as B from '../semantic/bound';
import { typeName } from '../semantic/types';
import { examples } from '../examples';

/** A bound expression as an S-expression: types where they matter. */
function sx(e: B.BExpr): string {
  switch (e.kind) {
    case 'Const': return e.value === null ? 'null' : typeof e.value === 'string' ? JSON.stringify(e.value) : `${String(e.value)}:${typeName(e.type)}`;
    case 'Local': return e.local.name;
    case 'StaticField': return `${e.field.owner.name}.${e.field.name}`;
    case 'Field': return `(. ${sx(e.target)} ${e.field.name})`;
    case 'This': return 'this';
    case 'ArrayLength': return `(length ${sx(e.array)})`;
    case 'ArrayElement': return `([] ${sx(e.array)} ${sx(e.index)})`;
    case 'Call': return `(call ${e.method.owner.name}.${e.method.signature}${e.target ? ` ${sx(e.target)}` : ''}${e.args.map(a => ` ${sx(a)}`).join('')})`;
    case 'DynamicCall': return `(dynamic ${e.name})`;
    case 'New': return `(new ${typeName(e.type)}${e.ctor ? ` ${e.ctor.signature}` : ''}${e.args.map(a => ` ${sx(a)}`).join('')})`;
    case 'NewArray': return `(new-array ${typeName(e.type)}${e.dims.map(d => ` ${sx(d)}`).join('')})`;
    case 'ArrayLiteral': return `{${e.elements.map(sx).join(' ')}}:${typeName(e.type)}`;
    case 'Unary': return `(${e.op} ${sx(e.operand)})`;
    case 'IncDec': return `(${e.prefix ? `${e.op}pre` : `post${e.op}`} ${sx(e.target)})`;
    case 'Binary': return `(${e.op} ${sx(e.left)} ${sx(e.right)}):${typeName(e.type)}`;
    case 'Logical': return `(${e.op} ${sx(e.left)} ${sx(e.right)})`;
    case 'RefEquals': return `(ref${e.negate ? '!=' : '=='} ${sx(e.left)} ${sx(e.right)})`;
    case 'Concat': return `(concat ${sx(e.left)} ${sx(e.right)})`;
    case 'Assign': return `(= ${sx(e.target)} ${sx(e.value)})`;
    case 'CompoundAssign': return `(${e.op}=${e.concat ? 'concat' : ''} ${sx(e.target)} ${sx(e.value)})`;
    case 'Conditional': return `(? ${sx(e.cond)} ${sx(e.then)} ${sx(e.else)}):${typeName(e.type)}`;
    case 'Convert': return `(${e.conversion}:${typeName(e.type)} ${sx(e.expr)})`;
    case 'InstanceOf': return `(instanceof ${sx(e.expr)} ${typeName(e.target)}${e.binding ? ` ${e.binding.name}` : ''})`;
    case 'SwitchExpr': return `(switch ${sx(e.switch.selector)}):${typeName(e.type)}`;
    case 'OuterThis': return `${e.cls.name}.this`;
    case 'ClassLiteral': return `(class ${e.name})`;
    case 'Lambda': {
      const body = 'statements' in e.body ? '{…}' : sx(e.body as B.BExpr);
      const captures = e.captures.length ? ` captures:${e.captures.map(c => c.name).join(',')}` : '';
      return e.methodRef ? `(ref ${typeName(e.type)} ${body})` : `(lambda ${typeName(e.type)} (${e.params.map(p => `${p.name}:${typeName(p.type)}`).join(' ')})${captures} ${body})`;
    }
    case 'Unsupported': return `(unsupported ${e.construct})`;
  }
}

function bind(source: string): { program: B.BProgram; diagnostics: Diagnostic[] } {
  return bindProgram(parseAst(source));
}

/** main's statements in a program (`members` go in the class Main). */
function mainOf(body: string, members = '', extra = ''): B.BStmt[] {
  const { program, diagnostics } = bind(`import java.util.*;\npublic class Main {\n${members}\n  public static void main(String[] args) {\n${body}\n  }\n}\n${extra}`);
  expect(diagnostics.map(d => d.message)).toEqual([]);
  const main = program.classes[0].methods.find(m => m.symbol.name === 'main')!;
  return main.body!.statements;
}

/** The expression statements and initializers of main, as S-expressions. */
function shapes(body: string, members = '', extra = ''): string[] {
  return mainOf(body, members, extra).flatMap(s => {
    if (s.kind === 'ExprStmt') return [sx(s.expr)];
    if (s.kind === 'LocalDecl') return s.declarators.map(d => `${d.local.name}:${typeName(d.local.type)} = ${d.init ? sx(d.init) : '?'}`);
    return [];
  });
}


describe("#13's table, as binding decisions", () => {
  it('chooses overloads by argument type, not count', () => {
    const calls = shapes('describe(5); describe("hi"); describe(2.5); describe(\'c\'); describe(5L);',
      '  static void describe(int x) {}\n  static void describe(String s) {}\n  static void describe(double d) {}');
    expect(calls).toEqual([
      '(call Main.describe(int) 5:int)',
      '(call Main.describe(String) "hi")',
      '(call Main.describe(double) 2.5:double)',
      "(call Main.describe(int) 99:int)", // 'c' widens to int, the most specific
      '(call Main.describe(double) 5:double)', // a long widens to double, not int
    ]);
  });

  it('chooses constructors by argument type', () => {
    const [f, c] = shapes('Temp f = new Temp("F"); Temp c = new Temp(21.5);', '', `class Temp {
  Temp(double degrees) {}
  Temp(String unit) {}
}`);
    expect(f).toBe('f:Temp = (new Temp Temp(String) "F")');
    expect(c).toBe('c:Temp = (new Temp Temp(double) 21.5:double)');
  });

  it('packs variable-arity arguments into an array, even none', () => {
    const calls = shapes('sum(1, 2, 3); sum(); sum(new int[] {4});', '  static int sum(int... nums) { return 0; }');
    expect(calls).toEqual([
      '(call Main.sum(int...) {1:int 2:int 3:int}:int[])',
      '(call Main.sum(int...) {}:int[])',
      '(call Main.sum(int...) {4:int}:int[])', // an array is passed as the array
    ]);
  });

  it('types a conditional by both its operands: t ? 1 : 2.0 is a double', () => {
    const [x] = shapes('boolean t = args.length == 0; Object x = t ? 1 : 2.0;').slice(1);
    expect(x).toBe('x:Object = (widen:Object (box:Double (? t 1:double 2:double):double))');
  });

  it('calls the library\'s static Integer.toString(int) even in a class with an instance toString()', () => {
    const [s] = shapes('String s = Integer.toString(42);', '  public String toString() { return "M"; }');
    expect(s).toBe('s:String = (call Integer.toString(int) 42:int)');
  });

  it('compares boxed Integers by identity, after boxing their values', () => {
    const [c, , eq, num] = shapes('Integer c = 1000, d = 1000; boolean same = c == d; boolean value = c == 1000;');
    expect(c).toBe('c:Integer = (box:Integer 1000:int)');
    expect(eq).toBe('same:boolean = (ref== c d)');
    expect(num).toBe('value:boolean = (== (unbox:int c) 1000:int):boolean');
  });

  it('removes by value for list.remove(Integer.valueOf(40)), by index for remove(1)', () => {
    const [, byValue, byIndex] = shapes('List<Integer> nums = new ArrayList<>(); nums.remove(Integer.valueOf(40)); nums.remove(1);');
    expect(byValue).toBe('(call Collection.remove(Object) nums (widen:Object (call Integer.valueOf(int) 40:int)))');
    expect(byIndex).toBe('(call List.remove(int) nums 1:int)');
  });
});

describe('names (JLS §6.5)', () => {
  it('finds locals before fields, fields through this, and statics of other classes', () => {
    const calls = shapes('Counter c = new Counter(); c.bump(); int n = Counter.created; Counter.created++;', '', `class Counter {
  static int created;
  int count;
  void bump() { count++; int count = 5; count--; }
}`);
    expect(calls.slice(2)).toEqual(['n:int = Counter.created', '(post++ Counter.created)']);
    const { program } = bind(`class Counter { int count; void bump() { count++; int count = 5; count--; } public static void main(String[] a) {} }`);
    const body = program.classes[0].methods.find(m => m.symbol.name === 'bump')!.body!.statements;
    expect(sx((body[0] as B.BExprStmt).expr)).toBe('(post++ (. this count))');
    expect(sx((body[2] as B.BExprStmt).expr)).toBe('(post-- count)');
  });

  it('reads dotted names left to right: variables, fields, types, packages', () => {
    const calls = shapes('double pi = Math.PI; String a = java.util.Arrays.toString(args); int len = args.length; System.out.println(len);');
    expect(calls).toEqual([
      'pi:double = Math.PI',
      'a:String = (call Arrays.toString(Object) args)',
      'len:int = (length args)',
      '(call PrintStream.println(int) System.out len)',
    ]);
  });

  it('reports a name that is nothing, as javac does', () => {
    const { diagnostics } = bind('class M { public static void main(String[] a) { int x = y + 1; } }');
    expect(diagnostics.map(d => d.message.split('\n'))).toEqual([['cannot find symbol', '  symbol:   variable y', '  location: class M']]);
  });
});

describe('generics through the library\'s signatures', () => {
  it('gives element types to gets, iteration and map entries', () => {
    const calls = shapes(`List<Student> xs = new ArrayList<>();
    String n = xs.get(0).name;
    Map<String, List<Integer>> m = new HashMap<>();
    int first = m.get("a").get(0);
    for (Map.Entry<String, List<Integer>> e : m.entrySet()) { String k = e.getKey(); }`, '', 'class Student { String name; }');
    expect(calls[0]).toBe('xs:List<Student> = (widen:List<Student> (new ArrayList<Student> ArrayList()))');
    expect(calls[1]).toBe('n:String = (. (call List.get(int) xs 0:int) name)');
    expect(calls[3]).toBe('first:int = (unbox:int (call List.get(int) (call Map.get(Object) m (widen:Object "a")) 0:int))');
  });

  it('infers generic methods\' type arguments, and a diamond\'s from its arguments', () => {
    const calls = shapes(`List<Integer> a = Arrays.asList(3, 1, 2);
    int best = Collections.max(a);
    var copy = new ArrayList<>(a);
    List<String> none = Collections.emptyList();
    Comparator<String> desc = Comparator.<String>naturalOrder().reversed();`);
    expect(calls[0]).toBe('a:List<Integer> = (call Arrays.asList(T...) {(box:Integer 3:int) (box:Integer 1:int) (box:Integer 2:int)}:Integer[])');
    expect(calls[1]).toBe('best:int = (unbox:int (call Collections.max(Collection<? extends T>) (widen:Collection<? extends Integer> a)))');
    expect(calls[2]).toMatch(/^copy:ArrayList<Integer> = \(new ArrayList<Integer> ArrayList\(Collection<\? extends E>\)/);
    expect(calls[3]).toBe('none:List<String> = (call Collections.emptyList())');
    expect(calls[4]).toBe('desc:Comparator<String> = (call Comparator.reversed() (call Comparator.naturalOrder()))');
  });
});

describe('conversions and constants', () => {
  it('makes widening, narrowing, boxing and unboxing explicit, and folds constants', () => {
    const calls = shapes(`int i = 7;
    double d = 5;
    long x = i * 2;
    byte b = 10;
    char c = 'a' + 1;
    Character ch = 'x';
    Integer boxed = i;
    int back = boxed;
    final int K = 3;
    int k = K * 2;
    String hi = "h" + "i" + 1 + 'c';
    int div = 1 / 0;`);
    expect(calls).toEqual([
      'i:int = 7:int',
      'd:double = 5:double',
      'x:long = (widen:long (* i 2:int):int)',
      'b:byte = 10:byte',
      'c:char = 98:char',
      'ch:Character = (box:Character 120:char)',
      'boxed:Integer = (box:Integer i)',
      'back:int = (unbox:int boxed)',
      'K:int = 3:int',
      'k:int = 6:int',
      'hi:String = "hi1c"',
      'div:int = (/ 1:int 0:int):int', // throws when run, so not folded
    ]);
  });

  it('keeps compound assignment\'s narrowing and string concatenation for the evaluator', () => {
    const calls = shapes('byte b = 1; b += 300; String s = "x"; s += 1; s += \'c\';');
    expect(calls.slice(1, 2)).toEqual(['(+= b 300:int)']);
    expect(calls.slice(3)).toEqual(['(+=concat s 1:int)', "(+=concat s 99:char)"]);
  });
});

describe('what javac rejects', () => {
  const firstLine = (source: string) => bind(source).diagnostics.map(d => d.message.split('\n')[0]);
  it.each([
    ['int x = "hello";', 'incompatible types: String cannot be converted to int'],
    ['double d = 3.7; int n = d;', 'incompatible types: possible lossy conversion from double to int'],
    ['int n = "5" - 1;', "bad operand types for binary operator '-'"],
    ['Integer i = 5L;', 'incompatible types: long cannot be converted to Integer'],
  ])('%s', (body, message) => {
    expect(firstLine(`class M { public static void main(String[] a) { ${body} } }`)).toEqual([message]);
  });

  it('reports a call with the wrong arguments as javac does', () => {
    const lines = bind('class M { static int add(int a, int b) { return a + b; } public static void main(String[] x) { add(1); } }').diagnostics[0].message.split('\n');
    expect(lines).toEqual(['method add in class M cannot be applied to given types;', '  required: int,int', '  found:    int', '  reason: actual and formal argument lists differ in length']);
  });
});

describe('constructs JavaTutor can\'t run yet', () => {
  it('rejects unsupported declarations before anything runs, with the old messages', () => {
    const messages = (s: string) => bind(s).diagnostics.filter(d => d.kind === 'unsupported').map(d => d.message);
    expect(messages('enum E { A } class M { public static void main(String[] a) {} }')).toEqual([]);
    expect(messages('@interface Tag {} class M { public static void main(String[] a) {} }')).toEqual(["Annotation types (@interface) aren't supported in JavaTutor yet"]);
    expect(messages('class A {} class B extends A { public static void main(String[] a) {} }')).toEqual([]);
    expect(messages('class N extends java.util.ArrayList<String> { public static void main(String[] a) {} }')).toEqual(["Inheritance (class N extends ArrayList) isn't supported in JavaTutor yet"]);
    expect(messages('class E extends RuntimeException { public static void main(String[] a) {} }')).toEqual([]);
  });

  it('leaves unsupported expressions for when they are reached', () => {
    const calls = shapes('double d = 0x1.8p1; Object o = new java.util.ArrayList<String>() {};');
    expect(calls).toEqual(['d:double = (unsupported Hexadecimal floating-point literals)', 'o:Object = (unsupported Anonymous subclasses of library classes (ArrayList))']);
  });
});

// ── The corpus ──

const ROOT = join(__dirname, 'jdk', 'cases');
const known = JSON.parse(readFileSync(join(__dirname, 'jdk', 'known-failures.json'), 'utf8')) as { output: Record<string, { issues: number[] }> };

function corpus(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.java')) out.push([relative(ROOT, p).replace(/\\/g, '/').replace(/\.java$/, ''), readFileSync(p, 'utf8')]);
    }
  };
  walk(ROOT);
  for (const e of examples) out.push([`examples/${e.slug}`, e.code]);
  return out.filter(([id, source]) => {
    if (!id.startsWith('compile-errors/')) return true;
    try { parseAst(source); return true; } catch { return false; }
  });
}

/** Every DynamicCall in a bound program. */
function dynamicCalls(x: unknown, found: string[] = [], seen = new WeakSet<object>()): string[] {
  if (!x || typeof x !== 'object' || seen.has(x)) return found;
  seen.add(x);
  const n = x as { kind?: string; name?: string; owner?: { name: string; isLibrary: boolean } };
  if (n.kind === 'DynamicCall') found.push(`${n.owner?.name ?? '?'}.${n.name}`);
  for (const [k, v] of Object.entries(x)) {
    if (['symbol', 'method', 'field', 'cls', 'local', 'ctor', 'type', 'owner', 'binding', 'elementSource', 'target'].includes(k) && v && typeof v === 'object' && !('kind' in v)) continue;
    if (Array.isArray(v)) v.forEach(i => dynamicCalls(i, found, seen));
    else dynamicCalls(v, found, seen);
  }
  return found;
}

/** Library methods that are dynamic for now: they take lambdas or are streams (#16), or clone/getClass (#15). */
const EXPECTED_DYNAMIC = /\.(stream|forEach|computeIfAbsent|merge|filter|map|mapToInt|collect|sum|count|chars|clone|getClass|getSimpleName|add)$/;

describe('the corpus', () => {
  const cases = corpus();

  it.each(cases)('%s binds as javac would', (id, source) => {
    const { diagnostics } = bind(source);
    const issues = known.output[id]?.issues ?? [];
    const errors = diagnostics.filter(d => d.kind === 'error').map(d => d.message.split('\n')[0]);
    const unsupported = diagnostics.filter(d => d.kind === 'unsupported');
    if (id.startsWith('compile-errors/')) {
      // javac rejects these; the binder reports what needs only types (#23 does flow analysis).
      return;
    }
    expect(errors).toEqual([]);
    // A declaration JavaTutor rejects is one whose case waits on inheritance or enums/records (#15, #16).
    if (unsupported.length) expect(issues.some(i => i === 15 || i === 16)).toBe(true);
    for (const call of dynamicCalls(bind(source).program)) expect(call).toMatch(EXPECTED_DYNAMIC);
  });

  it('reports javac\'s error for the compile-error cases that need only types', () => {
    const errors = (id: string) => bind(cases.find(([c]) => c === id)![1]).diagnostics.map(d => d.message.split('\n')[0]);
    expect(errors('compile-errors/ce-lossy-conversion')).toEqual(['incompatible types: possible lossy conversion from double to int']);
    expect(errors('compile-errors/ce-string-minus')).toEqual(["bad operand types for binary operator '-'"]);
    expect(errors('compile-errors/ce-type-mismatch')).toEqual(['incompatible types: String cannot be converted to int']);
    expect(errors('compile-errors/ce-undeclared-var-late')).toEqual(['cannot find symbol']);
    expect(errors('compile-errors/ce-wrong-arg-count')).toEqual(['method add in class Main cannot be applied to given types;']);
  });
});

