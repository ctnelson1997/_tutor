/**
 * The Java AST (#12): convert.ts turns java-parser's concrete syntax tree
 * into ast.ts's tree, and print.ts prints it back.
 *
 * - Precedence, associativity, unary and postfix operators, casts,
 *   instanceof, assignment, shifts and the conditional build the tree Java
 *   defines (shown as S-expressions).
 * - Names stay ambiguous, `this`/`super` are kept, and every node has its range.
 * - A construct the conversion doesn't handle becomes an Unsupported node.
 * - Every corpus case and shipped example converts with no Unsupported node,
 *   prints back to the tokens it was written with, and re-parses to the same
 *   tree. The printer adds only the parentheses the tree needs, so a tree with
 *   the wrong shape wouldn't print the original tokens.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseAst, parseCst, toAst, type CstNode } from '../ast/convert';
import { printAst, type } from '../ast/print';
import type * as A from '../ast/ast';
import { examples } from '../examples';

/** An expression as an S-expression, operators first. */
function sx(e: A.Expr): string {
  switch (e.kind) {
    case 'Literal': return e.text;
    case 'Name': return e.parts.map(p => p.name).join('.');
    case 'This': return e.qualifier ? `${sx(e.qualifier)}.this` : 'this';
    case 'Super': return e.qualifier ? `${sx(e.qualifier)}.super` : 'super';
    case 'Parens': return `(paren ${sx(e.expr)})`;
    case 'Binary': return `(${e.op} ${sx(e.left)} ${sx(e.right)})`;
    case 'Unary': return `(${e.op} ${sx(e.operand)})`;
    case 'IncDec': return e.prefix ? `(${e.op}pre ${sx(e.operand)})` : `(post${e.op} ${sx(e.operand)})`;
    case 'Assign': return `(${e.op} ${sx(e.target)} ${sx(e.value)})`;
    case 'Conditional': return `(? ${sx(e.cond)} ${sx(e.then)} ${sx(e.else)})`;
    case 'InstanceOf': return `(instanceof ${sx(e.expr)} ${e.pattern ? `${type((e.pattern as A.TypePattern).type)} ${(e.pattern as A.TypePattern).name}` : type(e.type!)})`;
    case 'Cast': return `(cast ${type(e.type)} ${sx(e.expr)})`;
    case 'FieldAccess': return `(. ${sx(e.target)} ${e.name})`;
    case 'ArrayAccess': return `([] ${sx(e.array)} ${sx(e.index)})`;
    case 'MethodCall': return `(call ${e.target ? `${sx(e.target)} ` : ''}${e.name}${e.args.map(a => ` ${sx(a)}`).join('')})`;
    case 'MethodRef': return `(:: ${'kind' in e.target && ['Name', 'This', 'Super'].includes(e.target.kind) ? sx(e.target as A.Expr) : type(e.target as A.TypeNode)} ${e.name})`;
    case 'Lambda': return `(lambda (${e.params.map(p => p.name).join(' ')}) ${e.body.kind === 'Block' ? '{…}' : sx(e.body)})`;
    case 'NewObject': return `(new ${type(e.type)}${e.args.map(a => ` ${sx(a)}`).join('')})`;
    case 'NewArray': return `(new-array ${type(e.elementType)} [${e.dimExprs.map(sx).join(' ')}] +${e.extraDims}${e.init ? ' {…}' : ''})`;
    case 'ClassLiteral': return `(class ${type(e.type)})`;
    case 'SwitchExpr': return `(switch ${sx(e.selector)})`;
    default: return `<${e.kind}>`;
  }
}

const program = (body: string, members = '') => `class M {\n${members}\n  void f() {\n    ${body}\n  }\n}`;

/** The statements of f() in a program. */
function statements(body: string, members = ''): A.Stmt[] {
  const unit = parseAst(program(body, members));
  const cls = unit.types[0] as A.ClassDecl;
  const f = cls.members.find((m): m is A.MethodDecl => m.kind === 'MethodDecl' && m.name === 'f')!;
  return f.body!.statements;
}

/** The expression in `Object x = <source>;`. */
function exprOf(source: string): A.Expr {
  const decl = statements(`Object x = ${source};`)[0] as A.LocalVarDecl;
  return decl.declarators[0].init as A.Expr;
}

const shape = (source: string) => sx(exprOf(source));

describe('expressions: precedence and associativity', () => {
  it.each([
    ['a + b * c', '(+ a (* b c))'],
    ['a * b + c', '(+ (* a b) c)'],
    ['a - b - c', '(- (- a b) c)'],
    ['a / b * c % d', '(% (* (/ a b) c) d)'],
    ['a << 1 + 2', '(<< a (+ 1 2))'],
    ['1 << 4', '(<< 1 4)'],
    ['a >> b >>> c', '(>>> (>> a b) c)'],
    ['a < b == c > d', '(== (< a b) (> c d))'],
    ['a & b ^ c | d', '(| (^ (& a b) c) d)'],
    ['a == b & c', '(& (== a b) c)'],
    ['a || b && c', '(|| a (&& b c))'],
    ['a && b || c && d', '(|| (&& a b) (&& c d))'],
    ['a + b instanceof String', '(instanceof (+ a b) String)'],
    ['o instanceof String s && s.isEmpty()', '(&& (instanceof o String s) (call s isEmpty))'],
    ['a == b instanceof Integer', '(== a (instanceof b Integer))'],
    ['c ? a : b', '(? c a b)'],
    ['c ? a : d ? e : f', '(? c a (? d e f))'],
    ['a || b ? 1 : 2', '(? (|| a b) 1 2)'],
    ['(a + b) * c', '(* (paren (+ a b)) c)'],
  ])('%s', (source, expected) => {
    expect(shape(source)).toBe(expected);
  });
});

describe('expressions: unary, postfix, casts and assignment', () => {
  it.each([
    ['-a * b', '(* (- a) b)'],
    ['-x++', '(- (post++ x))'],
    ['++x + y--', '(+ (++pre x) (post-- y))'],
    ['!a && b', '(&& (! a) b)'],
    ['- -x', '(- (- x))'],
    ['~a & b', '(& (~ a) b)'],
    ['(int) x + 1', '(+ (cast int x) 1)'],
    ['(int) -x', '(cast int (- x))'],
    ['(double) a / b', '(/ (cast double a) b)'],
    ['(String) o', '(cast String o)'],
    ['(List<String>) o', '(cast List<String> o)'],
  ])('%s', (source, expected) => {
    expect(shape(source)).toBe(expected);
  });

  it('builds assignments right to left, with each compound operator', () => {
    const [chain, compound, shiftAssign, field] = statements('a = b = c + 1; total += x * 2; bits >>>= 2; this.n = n;').map(s => sx((s as A.ExprStmt).expr));
    expect(chain).toBe('(= a (= b (+ c 1)))');
    expect(compound).toBe('(+= total (* x 2))');
    expect(shiftAssign).toBe('(>>>= bits 2)');
    expect(field).toBe('(= (. this n) n)');
  });
});

describe('primaries: names, calls, fields, this and super', () => {
  it('keeps a dotted name as one ambiguous Name, and splits off the method name of a call', () => {
    const name = exprOf('a.b.c') as A.Name;
    expect(name.kind).toBe('Name');
    expect(name.parts.map(p => p.name)).toEqual(['a', 'b', 'c']);
    expect(shape('System.out.println("hi")')).toBe('(call System.out println "hi")');
    expect(shape('Math.max(a, b)')).toBe('(call Math max a b)');
    expect(shape('helper(1)')).toBe('(call helper 1)');
    expect(shape('java.util.Arrays.toString(arr)')).toBe('(call java.util.Arrays toString arr)');
  });

  it('chains calls, fields and array accesses left to right', () => {
    expect(shape('sb.append("a").append("b").toString()')).toBe('(call (call (call sb append "a") append "b") toString)');
    expect(shape('head.next.getVal()')).toBe('(call head.next getVal)');
    expect(shape('grid[i][j].value')).toBe('(. ([] ([] grid i) j) value)');
    expect(shape('people[1].age')).toBe('(. ([] people 1) age)');
    expect(shape('list.get(0).name')).toBe('(. (call list get 0) name)');
    expect(shape('this.data[this.size]')).toBe('([] (. this data) (. this size))');
  });

  it('keeps this and super, qualified or not', () => {
    expect(shape('Outer.this.x')).toBe('(. Outer.this x)');
    expect(shape('super.toString()')).toBe('(call super toString)');
    expect(shape('Outer.super.m()')).toBe('(call Outer.super m)');
    expect(shape('super.x')).toBe('(. super x)');
    expect(shape('this.next')).toBe('(. this next)');
  });

  it('reads method references, class literals and explicit type arguments', () => {
    expect(shape('System.out::println')).toBe('(:: System.out println)');
    expect(shape('String[]::new')).toBe('(:: String[] new)');
    expect(shape('List<String>::size')).toBe('(:: List<String> size)');
    expect(shape('this::helper')).toBe('(:: this helper)');
    expect(shape('int[].class')).toBe('(class int[])');
    expect(shape('String.class')).toBe('(class String)');
    expect(shape('void.class')).toBe('(class void)');
    const call = exprOf('Collections.<String>emptyList()') as A.MethodCall;
    expect(call.typeArgs?.map(type)).toEqual(['String']);
  });

  it('reads object and array creation', () => {
    expect(shape('new Node(1, null)')).toBe('(new Node 1 null)');
    expect((exprOf('new ArrayList<>()') as A.NewObject).diamond).toBe(true);
    expect(shape('new int[3][]')).toBe('(new-array int [3] +1)');
    expect(shape('new int[2][3]')).toBe('(new-array int [2 3] +0)');
    expect(shape('new String[] {"a", "b"}')).toBe('(new-array String [] +1 {…})');
    const anon = exprOf('new Runnable() { public void run() {} }') as A.NewObject;
    expect(anon.body?.[0].kind).toBe('MethodDecl');
    const inner = exprOf('outer.new Inner()') as A.NewObject;
    expect(inner.outer && sx(inner.outer)).toBe('outer');
  });

  it('reads lambdas with untyped, typed and no parameters', () => {
    expect(shape('x -> x * 2')).toBe('(lambda (x) (* x 2))');
    expect(shape('(a, b) -> a + b')).toBe('(lambda (a b) (+ a b))');
    expect(shape('() -> { return 1; }')).toBe('(lambda () {…})');
    const typed = exprOf('(int a, var b) -> a') as A.Lambda;
    expect(typed.params.map(p => p.type && type(p.type))).toEqual(['int', 'var']);
  });

  it('reads literals with their types', () => {
    const types = ['1', '1L', '0xFF', '1.5', '2f', '1e3', "'a'", '"s"', 'true', 'null', '0b101', '1_000'].map(s => (exprOf(s) as A.Literal).type);
    expect(types).toEqual(['int', 'long', 'int', 'double', 'float', 'double', 'char', 'String', 'boolean', 'null', 'int', 'int']);
    const block = exprOf('"""\n      hi\n      """') as A.Literal;
    expect(block.textBlock).toBe(true);
  });
});

describe('statements and declarations', () => {
  it('reads switch rules, groups, patterns and guards', () => {
    const [rules, groups] = statements(`switch (k) { case 1, 2 -> f(); case 3 -> { g(); } default -> throw new X(); }
    switch (s) { case "a": case "b": f(); break; default: g(); }`) as A.SwitchStmt[];
    expect(rules.body.kind).toBe('rules');
    const r = (rules.body as { rules: A.SwitchRule[] }).rules;
    expect(r.map(x => [x.label.constants.map(sx), x.label.isDefault, x.body.kind])).toEqual([[['1', '2'], false, 'MethodCall'], [['3'], false, 'Block'], [[], true, 'Throw']]);
    const g = (groups.body as { groups: A.SwitchGroup[] }).groups;
    expect(g.map(x => x.statements.length)).toEqual([0, 2, 1]);
    const sw = exprOf('switch (o) { case Integer i when i > 0 -> 1; case null, default -> 0; }') as A.SwitchExpr;
    const labels = (sw.body as { rules: A.SwitchRule[] }).rules.map(x => x.label);
    expect(labels[0].patterns[0]).toMatchObject({ kind: 'TypePattern', name: 'i' });
    expect(labels[0].guard && sx(labels[0].guard)).toBe('(> i 0)');
    expect(labels[1]).toMatchObject({ isNull: true, nullDefault: true, isDefault: false });
  });

  it('reads loops, try, labels and local declarations', () => {
    const [loop, each, labeled, tried, local] = statements(`for (int i = 0, j = 9; i < j; i++, j--) {}
    for (final String s : list) {}
    outer: while (true) break outer;
    try (Scanner sc = new Scanner(System.in)) {} catch (IOException | RuntimeException e) {} finally {}
    var x = 1;`);
    expect((loop as A.For).update.map(sx)).toEqual(['(post++ i)', '(post-- j)']);
    expect(((loop as A.For).init as A.LocalVarDecl).declarators.map(d => d.name)).toEqual(['i', 'j']);
    expect((each as A.ForEach).variable.modifiers).toEqual(['final']);
    expect((labeled as A.Labeled).label).toBe('outer');
    expect((tried as A.Try).resources).toHaveLength(1);
    expect((tried as A.Try).catches[0].types.map(type)).toEqual(['IOException', 'RuntimeException']);
    expect((local as A.LocalVarDecl).type.kind).toBe('VarType');
  });

  it('reads classes, enums, records, interfaces and constructors', () => {
    const unit = parseAst(`import java.util.*;
public class Main<T extends Comparable<T>> extends Base implements Runnable, Cloneable {
  private static final int MAX = 10, MIN;
  int[] data, grid[];
  Main(int n) { this(n, 0); }
  Main(int n, int m) { super(n); }
  static { MIN = 1; }
  public <U> U id(U u, int... rest) throws Exception { return u; }
  enum Suit { CLUBS, HEARTS("h") { }; private String s; }
  record Point(int x, int y) { Point { } }
  interface Shape { double PI = 3.14; double area(); default String name() { return "shape"; } }
}`);
    expect(unit.imports[0]).toMatchObject({ isStatic: false, onDemand: true, name: { parts: ['java', 'util'] } });
    const main = unit.types[0] as A.ClassDecl;
    expect(main.typeParams[0].bounds.map(type)).toEqual(['Comparable<T>']);
    expect(main.superclass && type(main.superclass)).toBe('Base');
    const [fields, arrays, ctor1, ctor2, init, method, en, rec, iface] = main.members;
    expect((fields as A.FieldDecl).modifiers).toEqual(['private', 'static', 'final']);
    expect((arrays as A.FieldDecl).declarators.map(d => [d.name, d.dims])).toEqual([['data', 0], ['grid', 1]]);
    expect((ctor1 as A.ConstructorDecl).explicitCall).toMatchObject({ target: 'this' });
    expect((ctor2 as A.ConstructorDecl).explicitCall).toMatchObject({ target: 'super' });
    expect(init).toMatchObject({ kind: 'Initializer', isStatic: true });
    expect((method as A.MethodDecl).params.map(p => [p.name, p.varargs])).toEqual([['u', false], ['rest', true]]);
    expect((method as A.MethodDecl).throws.map(type)).toEqual(['Exception']);
    expect((en as A.EnumDecl).constants.map(c => [c.name, c.args?.length, c.body !== undefined])).toEqual([['CLUBS', undefined, false], ['HEARTS', 1, true]]);
    expect((rec as A.RecordDecl).components.map(c => c.name)).toEqual(['x', 'y']);
    expect((rec as A.RecordDecl).members[0]).toMatchObject({ kind: 'ConstructorDecl', compact: true });
    expect((iface as A.InterfaceDecl).members.map(m => m.kind)).toEqual(['FieldDecl', 'MethodDecl', 'MethodDecl']);
  });
});

describe('ranges', () => {
  it('give each node its first and last character', () => {
    const source = 'class M {\n  int f() {\n    return a.b + count;\n  }\n}';
    const ret = ((parseAst(source).types[0] as A.ClassDecl).members[0] as A.MethodDecl).body!.statements[0] as A.Return;
    expect(ret.range).toMatchObject({ line: 3, column: 5, endLine: 3, endColumn: 23 });
    const sum = ret.value as A.Binary;
    expect(source.slice(sum.range.start, sum.range.end)).toBe('a.b + count');
    expect(source.slice(sum.right.range.start, sum.right.range.end)).toBe('count');
    const name = sum.left as A.Name;
    expect(name.parts.map(p => source.slice(p.range.start, p.range.end))).toEqual(['a', 'b']);
  });
});

describe('unsupported constructs', () => {
  it('become Unsupported nodes with their source, not gaps', () => {
    const unit = parseAst('module m { }');
    expect(unit.types[0]).toMatchObject({ kind: 'Unsupported', construct: 'module declaration' });
    const template = exprOf('STR."x \\{y}"');
    expect(template).toMatchObject({ kind: 'Unsupported', construct: 'string templates' });
    const implicit = parseAst('void main() { }');
    expect(implicit.types[0]).toMatchObject({ kind: 'Unsupported' });
  });
});

// ── The corpus ──

const ROOT = join(__dirname, 'jdk', 'cases');

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
  return out;
}

/** Every token of a CST, in source order. */
function tokenImages(cst: CstNode): string[] {
  const found: { offset: number; image: string }[] = [];
  const walk = (n: CstNode) => {
    for (const list of Object.values(n.children)) {
      for (const el of list) {
        if ('children' in el) walk(el);
        else found.push({ offset: el.startOffset, image: el.image });
      }
    }
  };
  walk(cst);
  return found.sort((a, b) => a.offset - b.offset).map(t => t.image);
}

/** Without the tokens that can be left out: a stray `;` and a trailing `,` (as in `enum E { A, B; }`). */
function essentialTokens(images: string[]): string[] {
  const out: string[] = [];
  images.forEach((t, k) => {
    const next = images[k + 1], prev = out[out.length - 1];
    if (t === ';' && (next === '}' || prev === '{' || prev === '}' || prev === ';')) return;
    if (t === ',' && (next === '}' || next === ';')) return;
    out.push(t);
  });
  return out;
}

const withoutRanges = (unit: A.CompilationUnit) => JSON.stringify(unit, (k, v) => (k === 'range' || k === 'nameRange' ? undefined : v));

function unsupportedIn(x: unknown, found: string[] = []): string[] {
  if (x && typeof x === 'object') {
    const n = x as { kind?: string; construct?: string; source?: string };
    if (n.kind === 'Unsupported') found.push(`${n.construct}: ${n.source}`);
    for (const v of Object.values(x)) unsupportedIn(v, found);
  }
  return found;
}

describe('the corpus', () => {
  const cases = corpus().filter(([id, source]) => {
    // A compile-error case that doesn't even parse has no tree.
    if (!id.startsWith('compile-errors/')) return true;
    try { parseCst(source); return true; } catch { return false; }
  });

  it('has the cases', () => {
    expect(cases.length).toBeGreaterThan(280);
  });

  it.each(cases)('%s converts completely, prints back as written, and round-trips', (_id, source) => {
    const cst = parseCst(source);
    const unit = toAst(cst, source);
    expect(unsupportedIn(unit)).toEqual([]);
    const printed = printAst(unit);
    const reparsed = parseCst(printed);
    expect(essentialTokens(tokenImages(reparsed))).toEqual(essentialTokens(tokenImages(cst)));
    expect(withoutRanges(toAst(reparsed, printed))).toBe(withoutRanges(unit));
  });
});
