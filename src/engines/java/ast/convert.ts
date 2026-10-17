/**
 * java-parser's concrete syntax tree → the AST in ast.ts (#12).
 *
 * One method per grammar rule (java-parser's rules follow the JLS chapters;
 * see node_modules/java-parser/src/productions). Chevrotain groups a node's
 * children by rule or token name, so where order matters (binary operators,
 * the parts of a qualified type) they are put back in source order by offset.
 *
 * - Binary expressions arrive flat (`a + b * c` is one node with three
 *   operands and two operators) and are rebuilt by precedence climbing,
 *   `instanceof` included. Shifts arrive as a `shiftOperator` node of
 *   adjacent `<`/`>` tokens; `<<=`, `>>=`, `>>>=` are single tokens.
 * - `a.b.c` stays one Name (and so does the target of `a.b.c(…)`); `super`
 *   in a name becomes a Super node.
 * - A construct this doesn't handle becomes an Unsupported node, never a gap.
 */

import { parse as javaParse } from 'java-parser';
import type * as A from './ast';

// ── java-parser's CST ──

interface CstLocation {
  startOffset: number;
  startLine: number;
  startColumn: number;
  endOffset: number;
  endLine: number;
  endColumn: number;
}

export interface CstToken extends CstLocation {
  image: string;
  tokenType: { name: string };
}

export interface CstNode {
  name: string;
  children: Record<string, CstElement[]>;
  location: CstLocation;
}

type CstElement = CstNode | CstToken;

const isNode = (e: CstElement): e is CstNode => 'children' in e;

function nodes(n: CstNode, key: string): CstNode[] {
  return (n.children[key] ?? []).filter(isNode);
}

function node(n: CstNode, key: string): CstNode | undefined {
  return nodes(n, key)[0];
}

function tokens(n: CstNode, key: string): CstToken[] {
  return (n.children[key] ?? []).filter((e): e is CstToken => !isNode(e));
}

function tok(n: CstNode, key: string): CstToken | undefined {
  return tokens(n, key)[0];
}

const has = (n: CstNode, key: string) => (n.children[key]?.length ?? 0) > 0;

const startOf = (e: CstElement) => (isNode(e) ? e.location.startOffset : e.startOffset);

/** All of a node's children, in source order, with the key each is filed under. */
function ordered(n: CstNode): { key: string; el: CstElement }[] {
  const all: { key: string; el: CstElement }[] = [];
  for (const [key, list] of Object.entries(n.children)) for (const el of list) all.push({ key, el });
  return all.sort((a, b) => startOf(a.el) - startOf(b.el));
}

/** Parse Java source to the CST (java-parser throws on a syntax error). */
export function parseCst(source: string): CstNode {
  return javaParse(source) as unknown as CstNode;
}

/** Parse Java source straight to the AST. */
export function parseAst(source: string): A.CompilationUnit {
  return toAst(parseCst(source), source);
}

/** Convert a compilation unit's CST to the AST. `source` is the text it was parsed from. */
export function toAst(cst: CstNode, source: string): A.CompilationUnit {
  return new Converter(source).compilationUnit(cst);
}

// ── Ranges ──

/**
 * java-parser reads a member record with an empty body, `record P(int x) {}`,
 * as a method named P returning a type named `record` (which can't exist:
 * `record` is a restricted type name since Java 16). Such a method is that
 * record; a record with members parses as one already.
 */
function recordFromMethod(m: A.MethodDecl): A.MethodDecl | A.RecordDecl {
  const r = m.result;
  if (r.kind !== 'ClassType' || r.parts.length !== 1 || r.parts[0].name !== 'record' || r.parts[0].typeArgs) return m;
  if (m.typeParams.length || m.dims || m.throws.length || m.receiver || !m.body || m.body.statements.length) return m;
  return { kind: 'RecordDecl', modifiers: m.modifiers, name: m.name, typeParams: [], components: m.params, interfaces: [], members: [], range: m.range };
}

function rangeOf(e: CstElement | CstLocation): A.Range {
  const l = isNodeLike(e) ? e.location : e;
  return { start: l.startOffset, end: l.endOffset + 1, line: l.startLine, column: l.startColumn, endLine: l.endLine, endColumn: l.endColumn };
}

function isNodeLike(e: CstElement | CstLocation): e is CstNode {
  return 'children' in e;
}

/** From the start of `a` to the end of `b`. */
function span(a: A.Range, b: A.Range): A.Range {
  return { start: a.start, end: b.end, line: a.line, column: a.column, endLine: b.endLine, endColumn: b.endColumn };
}

// ── Operators ──

const BINARY_PRECEDENCE: Record<A.BinaryOp, number> = {
  '||': 3, '&&': 4, '|': 5, '^': 6, '&': 7, '==': 8, '!=': 8,
  '<': 9, '>': 9, '<=': 9, '>=': 9, '<<': 10, '>>': 10, '>>>': 10,
  '+': 11, '-': 11, '*': 12, '/': 12, '%': 12,
};
/** `instanceof` binds like the relational operators. */
const INSTANCEOF_PRECEDENCE = 9;

const MODIFIERS = new Set<A.Modifier>([
  'public', 'protected', 'private', 'static', 'final', 'abstract', 'default',
  'synchronized', 'native', 'transient', 'volatile', 'strictfp', 'sealed', 'non-sealed',
]);

/** One operator of a flat binaryExpression, between (or, for instanceof and assignment, after) its operands. */
type Step =
  | { kind: 'binary'; op: A.BinaryOp; operand: A.Expr }
  | { kind: 'instanceof'; type?: A.TypeNode; pattern?: A.Pattern; range: A.Range }
  | { kind: 'assign'; op: A.AssignOp; value: A.Expr };

/** A part of a dotted name in an expression (`fqnOrRefType`), before it is known to be a name, a type or a call. */
interface NamePiece {
  name: string;
  range: A.Range;
  /** `Collections.<String>emptyList`: type arguments of a method call. */
  methodTypeArgs?: A.TypeNode[];
  /** `List<String>::size`: type arguments of a type. */
  typeArgs?: A.TypeNode[];
}

class Converter {
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  private text(range: A.Range): string {
    return this.source.slice(range.start, range.end);
  }

  private unsupported(construct: string, e: CstElement | A.Range): A.Unsupported {
    const range = 'start' in e && 'end' in e && !('image' in e) ? (e as A.Range) : rangeOf(e as CstElement);
    return { kind: 'Unsupported', construct, source: this.text(range), range };
  }

  // ── Compilation unit ──

  compilationUnit(cst: CstNode): A.CompilationUnit {
    const range = rangeOf(cst);
    const modular = node(cst, 'modularCompilationUnit');
    if (modular) return { kind: 'CompilationUnit', imports: [], types: [this.unsupported('module declaration', modular)], range };
    const unit = node(cst, 'ordinaryCompilationUnit');
    if (!unit) return { kind: 'CompilationUnit', imports: [], types: [], range };
    const pkg = node(unit, 'packageDeclaration');
    const types: (A.TypeDecl | A.Unsupported)[] = [];
    for (const t of nodes(unit, 'typeDeclaration')) {
      const cls = node(t, 'classDeclaration');
      const iface = node(t, 'interfaceDeclaration');
      if (cls) types.push(this.classDeclaration(cls));
      else if (iface) types.push(this.interfaceDeclaration(iface));
      else if (!has(t, 'Semicolon')) types.push(this.unsupported('Methods and fields outside a class', t));
    }
    return {
      kind: 'CompilationUnit',
      package: pkg ? this.qualifiedName(tokens(pkg, 'Identifier'), rangeOf(pkg)) : undefined,
      imports: nodes(unit, 'importDeclaration').filter(i => has(i, 'Import')).map(i => this.importDeclaration(i)),
      types,
      range,
    };
  }

  private qualifiedName(ids: CstToken[], range: A.Range): A.QualifiedName {
    return { kind: 'QualifiedName', parts: ids.map(t => t.image), range };
  }

  private importDeclaration(n: CstNode): A.ImportDecl {
    const name = node(n, 'packageOrTypeName')!;
    return {
      kind: 'Import',
      isStatic: has(n, 'Static'),
      name: this.qualifiedName(tokens(name, 'Identifier'), rangeOf(name)),
      onDemand: has(n, 'Star'),
      range: rangeOf(n),
    };
  }

  // ── Modifiers, annotations ──

  /** The modifiers and annotations of a list of `*Modifier` nodes, in source order. */
  private modifiers(list: CstNode[]): A.ModifierItem[] {
    return list.map(m => {
      const annotation = node(m, 'annotation');
      if (annotation) return this.annotation(annotation);
      const keyword = ordered(m)[0].el as CstToken;
      const word = keyword.image as A.Modifier;
      return MODIFIERS.has(word) ? word : this.annotationLike(keyword);
    });
  }

  /** A modifier token this doesn't know, kept as an annotation-like item so it isn't lost. */
  private annotationLike(t: CstToken): A.Annotation {
    return { kind: 'Annotation', name: t.image, source: t.image, range: rangeOf(t) };
  }

  private annotation(n: CstNode): A.Annotation {
    const range = rangeOf(n);
    return { kind: 'Annotation', name: tokens(node(n, 'typeName')!, 'Identifier').map(t => t.image).join('.'), source: this.text(range), range };
  }

  private annotations(list: CstNode[]): A.Annotation[] {
    return list.map(a => this.annotation(a));
  }

  // ── Types ──

  private primitiveName(n: CstNode): A.PrimitiveName {
    // unannPrimitiveType / primitiveType: numericType (integralType | floatingPointType) | Boolean
    const numeric = node(n, 'numericType');
    const t = numeric ? (ordered(node(numeric, 'integralType') ?? node(numeric, 'floatingPointType')!)[0].el as CstToken) : tok(n, 'Boolean')!;
    return t.image as A.PrimitiveName;
  }

  private primitiveType(n: CstNode): A.PrimitiveType {
    return { kind: 'PrimitiveType', name: this.primitiveName(n), range: rangeOf(n) };
  }

  /** Wrap a type in `dims` array dimensions, the range growing to `range`. */
  private withDims(type: A.TypeNode, dims: CstNode | undefined): A.TypeNode {
    if (!dims) return type;
    let result = type;
    for (const close of tokens(dims, 'RSquare')) result = { kind: 'ArrayType', component: result, range: span(type.range, rangeOf(close)) };
    return result;
  }

  private dimCount(dims: CstNode | undefined): number {
    return dims ? tokens(dims, 'LSquare').length : 0;
  }

  /** unannType: a primitive or class type, with dimensions. */
  private unannType(n: CstNode): A.TypeNode {
    const prim = node(n, 'unannPrimitiveTypeWithOptionalDimsSuffix');
    if (prim) return this.withDims(this.primitiveType(node(prim, 'unannPrimitiveType')!), node(prim, 'dims'));
    const ref = node(n, 'unannReferenceType')!;
    const cls = node(node(ref, 'unannClassOrInterfaceType')!, 'unannClassType')!;
    return this.withDims(this.classTypeOf(cls), node(ref, 'dims'));
  }

  /** unannClassType or classType: `Identifier typeArguments? (. Identifier typeArguments?)*`, parts put together by position. */
  private classTypeOf(n: CstNode): A.ClassType {
    const parts: A.ClassTypePart[] = [];
    for (const { key, el } of ordered(n)) {
      if (key === 'Identifier') parts.push({ name: (el as CstToken).image, range: rangeOf(el) });
      else if (key === 'typeArguments') {
        const last = parts[parts.length - 1];
        last.typeArgs = this.typeArguments(el as CstNode);
        last.range = span(last.range, rangeOf(el));
      }
    }
    return { kind: 'ClassType', parts, range: rangeOf(n) };
  }

  /** classOrInterfaceType / interfaceType / exceptionType, which all hold a classType. */
  private classType(n: CstNode): A.ClassType {
    return this.classTypeOf(n.name === 'classType' ? n : node(n, 'classType')!);
  }

  /** typeName (`A.B`, in `permits`): a class type without type arguments. */
  private typeName(n: CstNode): A.ClassType {
    return { kind: 'ClassType', parts: tokens(n, 'Identifier').map(t => ({ name: t.image, range: rangeOf(t) })), range: rangeOf(n) };
  }

  private referenceType(n: CstNode): A.TypeNode {
    const prim = node(n, 'primitiveType');
    if (prim) return this.withDims(this.primitiveType(prim), node(n, 'dims'));
    return this.withDims(this.classType(node(n, 'classOrInterfaceType')!), node(n, 'dims'));
  }

  private typeArguments(n: CstNode): A.TypeNode[] {
    return nodes(node(n, 'typeArgumentList')!, 'typeArgument').map(a => {
      const ref = node(a, 'referenceType');
      if (ref) return this.referenceType(ref);
      const w = node(a, 'wildcard')!;
      const bounds = node(w, 'wildcardBounds');
      const wildcard: A.Wildcard = { kind: 'Wildcard', range: rangeOf(w) };
      if (bounds) wildcard.bound = { kind: has(bounds, 'Extends') ? 'extends' : 'super', type: this.referenceType(node(bounds, 'referenceType')!) };
      return wildcard;
    });
  }

  private typeParameters(n: CstNode | undefined): A.TypeParam[] {
    if (!n) return [];
    return nodes(node(n, 'typeParameterList')!, 'typeParameter').map(p => {
      const bound = node(p, 'typeBound');
      const bounds = bound ? [this.classType(node(bound, 'classOrInterfaceType')!), ...nodes(bound, 'additionalBound').map(b => this.classType(node(b, 'interfaceType')!))] : [];
      return {
        kind: 'TypeParam' as const,
        annotations: this.annotations(nodes(p, 'typeParameterModifier').map(m => node(m, 'annotation')!)),
        name: tok(node(p, 'typeIdentifier')!, 'Identifier')!.image,
        bounds,
        range: rangeOf(p),
      };
    });
  }

  /** localVariableType or lambdaParameterType: a type, or `var`. */
  private localType(n: CstNode): A.TypeNode {
    const varTok = tok(n, 'Var');
    if (varTok) return { kind: 'VarType', range: rangeOf(varTok) };
    const t = this.unannType(node(n, 'unannType')!);
    // java-parser reads `var` as a class named var, which no type can be called.
    const isVar = t.kind === 'ClassType' && t.parts.length === 1 && t.parts[0].name === 'var' && !t.parts[0].typeArgs;
    return isVar ? { kind: 'VarType', range: t.range } : t;
  }

  private interfaceTypeList(n: CstNode | undefined): A.ClassType[] {
    return n ? nodes(node(n, 'interfaceTypeList')!, 'interfaceType').map(t => this.classType(t)) : [];
  }

  // ── Declarations ──

  classDeclaration(n: CstNode): A.TypeDecl {
    const outer = this.modifiers(nodes(n, 'classModifier'));
    const normal = node(n, 'normalClassDeclaration');
    if (normal) {
      const ext = node(normal, 'classExtends');
      const permits = node(normal, 'classPermits');
      return {
        kind: 'ClassDecl',
        modifiers: outer,
        name: tok(node(normal, 'typeIdentifier')!, 'Identifier')!.image,
        typeParams: this.typeParameters(node(normal, 'typeParameters')),
        superclass: ext ? this.classType(node(ext, 'classType')!) : undefined,
        interfaces: this.interfaceTypeList(node(normal, 'classImplements')),
        permits: permits ? nodes(permits, 'typeName').map(t => this.typeName(t)) : [],
        members: this.classBody(node(normal, 'classBody')!),
        range: rangeOf(n),
      };
    }
    const en = node(n, 'enumDeclaration');
    if (en) return this.enumDeclaration(en, outer, rangeOf(n));
    return this.recordDeclaration(node(n, 'recordDeclaration')!, outer, rangeOf(n));
  }

  private enumDeclaration(n: CstNode, outer: A.ModifierItem[], range: A.Range): A.EnumDecl {
    const body = node(n, 'enumBody')!;
    const list = node(body, 'enumConstantList');
    const decls = node(body, 'enumBodyDeclarations');
    return {
      kind: 'EnumDecl',
      modifiers: [...outer, ...this.modifiers(nodes(n, 'classModifier'))],
      name: tok(node(n, 'typeIdentifier')!, 'Identifier')!.image,
      interfaces: this.interfaceTypeList(node(n, 'classImplements')),
      constants: list ? nodes(list, 'enumConstant').map(c => this.enumConstant(c)) : [],
      members: decls ? this.bodyDeclarations(nodes(decls, 'classBodyDeclaration')) : [],
      range,
    };
  }

  private enumConstant(n: CstNode): A.EnumConstant {
    const body = node(n, 'classBody');
    const argList = node(n, 'argumentList');
    return {
      kind: 'EnumConstant',
      annotations: this.annotations(nodes(n, 'enumConstantModifier').map(m => node(m, 'annotation')!)),
      name: tok(n, 'Identifier')!.image,
      args: has(n, 'LBrace') ? (argList ? this.argumentList(argList) : []) : undefined,
      body: body ? this.classBody(body) : undefined,
      range: rangeOf(n),
    };
  }

  private recordDeclaration(n: CstNode, outer: A.ModifierItem[], range: A.Range): A.RecordDecl {
    const list = node(node(n, 'recordHeader')!, 'recordComponentList');
    const members: A.Member[] = [];
    for (const d of nodes(node(n, 'recordBody')!, 'recordBodyDeclaration')) {
      const compact = node(d, 'compactConstructorDeclaration');
      if (compact) members.push(this.compactConstructor(compact));
      else members.push(...this.bodyDeclarations([node(d, 'classBodyDeclaration')!]));
    }
    return {
      kind: 'RecordDecl',
      modifiers: outer,
      name: tok(node(n, 'typeIdentifier')!, 'Identifier')!.image,
      typeParams: this.typeParameters(node(n, 'typeParameters')),
      components: list ? nodes(list, 'recordComponent').map(c => this.recordComponent(c)) : [],
      interfaces: this.interfaceTypeList(node(n, 'classImplements')),
      members,
      range,
    };
  }

  private recordComponent(n: CstNode): A.Param {
    const varargs = node(n, 'variableArityRecordComponent');
    return {
      kind: 'Param',
      modifiers: this.modifiers(nodes(n, 'recordComponentModifier')),
      type: this.unannType(node(n, 'unannType')!),
      varargs: varargs !== undefined,
      varargsAnnotations: varargs ? this.annotations(nodes(varargs, 'annotation')) : [],
      name: (varargs ? tok(varargs, 'Identifier') : tok(n, 'Identifier'))!.image,
      dims: 0,
      range: rangeOf(n),
    };
  }

  private compactConstructor(n: CstNode): A.ConstructorDecl {
    const { explicitCall, body } = this.constructorBody(node(n, 'constructorBody')!);
    return {
      kind: 'ConstructorDecl',
      modifiers: this.modifiers(nodes(n, 'constructorModifier')),
      typeParams: [],
      name: tok(node(node(n, 'simpleTypeName')!, 'typeIdentifier')!, 'Identifier')!.image,
      params: [],
      throws: [],
      compact: true,
      explicitCall,
      body,
      range: rangeOf(n),
    };
  }

  interfaceDeclaration(n: CstNode): A.TypeDecl {
    const modifiers = this.modifiers(nodes(n, 'interfaceModifier'));
    const normal = node(n, 'normalInterfaceDeclaration');
    if (!normal) {
      const annotationType = node(n, 'annotationInterfaceDeclaration')!;
      const range = rangeOf(n);
      return {
        kind: 'AnnotationTypeDecl',
        modifiers,
        name: tok(node(annotationType, 'typeIdentifier')!, 'Identifier')!.image,
        source: this.text(range),
        range,
      };
    }
    const ext = node(normal, 'interfaceExtends');
    const permits = node(normal, 'interfacePermits');
    const members: A.Member[] = [];
    for (const m of nodes(node(normal, 'interfaceBody')!, 'interfaceMemberDeclaration')) {
      const constant = node(m, 'constantDeclaration');
      const method = node(m, 'interfaceMethodDeclaration');
      const cls = node(m, 'classDeclaration');
      const iface = node(m, 'interfaceDeclaration');
      if (constant) members.push(this.field(constant, 'constantModifier'));
      else if (method) members.push(this.method(method, 'interfaceMethodModifier'));
      else if (cls) members.push(this.classDeclaration(cls));
      else if (iface) members.push(this.interfaceDeclaration(iface));
    }
    return {
      kind: 'InterfaceDecl',
      modifiers,
      name: tok(node(normal, 'typeIdentifier')!, 'Identifier')!.image,
      typeParams: this.typeParameters(node(normal, 'typeParameters')),
      extends: ext ? nodes(node(ext, 'interfaceTypeList')!, 'interfaceType').map(t => this.classType(t)) : [],
      permits: permits ? nodes(permits, 'typeName').map(t => this.typeName(t)) : [],
      members,
      range: rangeOf(n),
    };
  }

  private classBody(n: CstNode): A.Member[] {
    return this.bodyDeclarations(nodes(n, 'classBodyDeclaration'));
  }

  private bodyDeclarations(list: CstNode[]): A.Member[] {
    const members: A.Member[] = [];
    for (const d of list) {
      const member = node(d, 'classMemberDeclaration');
      if (member) {
        const field = node(member, 'fieldDeclaration');
        const method = node(member, 'methodDeclaration');
        const cls = node(member, 'classDeclaration');
        const iface = node(member, 'interfaceDeclaration');
        if (field) members.push(this.field(field, 'fieldModifier'));
        else if (method) members.push(recordFromMethod(this.method(method, 'methodModifier')));
        else if (cls) members.push(this.classDeclaration(cls));
        else if (iface) members.push(this.interfaceDeclaration(iface));
        continue; // a lone `;`
      }
      const instanceInit = node(d, 'instanceInitializer');
      const staticInit = node(d, 'staticInitializer');
      const ctor = node(d, 'constructorDeclaration');
      if (instanceInit) members.push({ kind: 'Initializer', isStatic: false, body: this.block(node(instanceInit, 'block')!), range: rangeOf(d) });
      else if (staticInit) members.push({ kind: 'Initializer', isStatic: true, body: this.block(node(staticInit, 'block')!), range: rangeOf(d) });
      else if (ctor) members.push(this.constructor_(ctor));
    }
    return members;
  }

  /** fieldDeclaration or constantDeclaration (an interface's). */
  private field(n: CstNode, modifierKey: string): A.FieldDecl {
    return {
      kind: 'FieldDecl',
      modifiers: this.modifiers(nodes(n, modifierKey)),
      type: this.unannType(node(n, 'unannType')!),
      declarators: this.declarators(node(n, 'variableDeclaratorList')!),
      range: rangeOf(n),
    };
  }

  private declarators(n: CstNode): A.VarDeclarator[] {
    return nodes(n, 'variableDeclarator').map(d => {
      const id = node(d, 'variableDeclaratorId')!;
      const init = node(d, 'variableInitializer');
      return {
        kind: 'VarDeclarator' as const,
        name: (tok(id, 'Identifier') ?? tok(id, 'Underscore'))!.image,
        dims: this.dimCount(node(id, 'dims')),
        init: init ? this.variableInitializer(init) : undefined,
        range: rangeOf(d),
      };
    });
  }

  private variableInitializer(n: CstNode): A.Expr | A.ArrayInit {
    const arr = node(n, 'arrayInitializer');
    return arr ? this.arrayInitializer(arr) : this.expression(node(n, 'expression')!);
  }

  private arrayInitializer(n: CstNode): A.ArrayInit {
    const list = node(n, 'variableInitializerList');
    return {
      kind: 'ArrayInit',
      elements: list ? nodes(list, 'variableInitializer').map(v => this.variableInitializer(v)) : [],
      trailingComma: has(n, 'Comma'),
      range: rangeOf(n),
    };
  }

  /** methodDeclaration or interfaceMethodDeclaration. */
  private method(n: CstNode, modifierKey: string): A.MethodDecl {
    const header = node(n, 'methodHeader')!;
    const declarator = node(header, 'methodDeclarator')!;
    const result = node(header, 'result')!;
    const voidTok = tok(result, 'Void');
    const body = node(node(n, 'methodBody')!, 'block');
    const throws = node(header, 'throws');
    return {
      kind: 'MethodDecl',
      modifiers: this.modifiers(nodes(n, modifierKey)),
      typeParams: this.typeParameters(node(header, 'typeParameters')),
      resultAnnotations: this.annotations(nodes(header, 'annotation')),
      result: voidTok ? { kind: 'VoidType', range: rangeOf(voidTok) } : this.unannType(node(result, 'unannType')!),
      name: tok(declarator, 'Identifier')!.image,
      receiver: this.receiver(node(declarator, 'receiverParameter')),
      params: this.formalParameters(node(declarator, 'formalParameterList')),
      dims: this.dimCount(node(declarator, 'dims')),
      throws: throws ? this.throwsList(throws) : [],
      body: body ? this.block(body) : undefined,
      range: rangeOf(n),
    };
  }

  private throwsList(n: CstNode): A.ClassType[] {
    return nodes(node(n, 'exceptionTypeList')!, 'exceptionType').map(t => this.classType(t));
  }

  private receiver(n: CstNode | undefined): A.ReceiverParam | undefined {
    if (!n) return undefined;
    return {
      kind: 'ReceiverParam',
      annotations: this.annotations(nodes(n, 'annotation')),
      type: this.unannType(node(n, 'unannType')!),
      qualifier: tok(n, 'Identifier')?.image,
      range: rangeOf(n),
    };
  }

  private formalParameters(n: CstNode | undefined): A.Param[] {
    if (!n) return [];
    return nodes(n, 'formalParameter').map(p => {
      const regular = node(p, 'variableParaRegularParameter');
      if (regular) {
        const id = node(regular, 'variableDeclaratorId')!;
        return {
          kind: 'Param' as const,
          modifiers: this.modifiers(nodes(regular, 'variableModifier')),
          type: this.unannType(node(regular, 'unannType')!),
          varargs: false,
          varargsAnnotations: [],
          name: (tok(id, 'Identifier') ?? tok(id, 'Underscore'))!.image,
          dims: this.dimCount(node(id, 'dims')),
          range: rangeOf(p),
        };
      }
      return this.varargsParameter(node(p, 'variableArityParameter')!);
    });
  }

  private varargsParameter(v: CstNode): A.Param {
    return {
      kind: 'Param',
      modifiers: this.modifiers(nodes(v, 'variableModifier')),
      type: this.unannType(node(v, 'unannType')!),
      varargs: true,
      varargsAnnotations: this.annotations(nodes(v, 'annotation')),
      name: tok(v, 'Identifier')!.image,
      dims: 0,
      range: rangeOf(v),
    };
  }

  private constructor_(n: CstNode): A.ConstructorDecl {
    const declarator = node(n, 'constructorDeclarator')!;
    const throws = node(n, 'throws');
    const { explicitCall, body } = this.constructorBody(node(n, 'constructorBody')!);
    return {
      kind: 'ConstructorDecl',
      modifiers: this.modifiers(nodes(n, 'constructorModifier')),
      typeParams: this.typeParameters(node(declarator, 'typeParameters')),
      name: tok(node(node(declarator, 'simpleTypeName')!, 'typeIdentifier')!, 'Identifier')!.image,
      receiver: this.receiver(node(declarator, 'receiverParameter')),
      params: this.formalParameters(node(declarator, 'formalParameterList')),
      throws: throws ? this.throwsList(throws) : [],
      compact: false,
      explicitCall,
      body,
      range: rangeOf(n),
    };
  }

  private constructorBody(n: CstNode): { explicitCall?: A.ExplicitConstructorCall; body: A.Block } {
    const call = node(n, 'explicitConstructorInvocation');
    const statements = node(n, 'blockStatements');
    return {
      explicitCall: call ? this.explicitConstructorCall(call) : undefined,
      body: { kind: 'Block', statements: statements ? this.blockStatements(statements) : [], range: rangeOf(n) },
    };
  }

  private explicitConstructorCall(n: CstNode): A.ExplicitConstructorCall {
    const unqualified = node(n, 'unqualifiedExplicitConstructorInvocation');
    const c = unqualified ?? node(n, 'qualifiedExplicitConstructorInvocation')!;
    const typeArgs = node(c, 'typeArguments');
    const args = node(c, 'argumentList');
    const qualifier = node(c, 'expressionName');
    return {
      kind: 'ExplicitConstructorCall',
      target: has(c, 'This') ? 'this' : 'super',
      qualifier: qualifier ? this.nameOf(tokens(qualifier, 'Identifier')) : undefined,
      typeArgs: typeArgs ? this.typeArguments(typeArgs) : undefined,
      args: args ? this.argumentList(args) : [],
      range: rangeOf(n),
    };
  }

  // ── Statements ──

  block(n: CstNode): A.Block {
    const statements = node(n, 'blockStatements');
    return { kind: 'Block', statements: statements ? this.blockStatements(statements) : [], range: rangeOf(n) };
  }

  private blockStatements(n: CstNode): A.Stmt[] {
    return nodes(n, 'blockStatement').map(b => this.blockStatement(b));
  }

  private blockStatement(n: CstNode): A.Stmt {
    const local = node(n, 'localVariableDeclarationStatement');
    if (local) return { ...this.localVariableDeclaration(node(local, 'localVariableDeclaration')!), range: rangeOf(n) };
    const cls = node(n, 'classDeclaration');
    if (cls) return { kind: 'LocalClassDecl', decl: this.classDeclaration(cls), range: rangeOf(n) };
    const iface = node(n, 'interfaceDeclaration');
    if (iface) return { kind: 'LocalClassDecl', decl: this.interfaceDeclaration(iface), range: rangeOf(n) };
    return this.statement(node(n, 'statement')!);
  }

  private localVariableDeclaration(n: CstNode): A.LocalVarDecl {
    return {
      kind: 'LocalVarDecl',
      modifiers: this.modifiers(nodes(n, 'variableModifier')),
      type: this.localType(node(n, 'localVariableType')!),
      declarators: this.declarators(node(n, 'variableDeclaratorList')!),
      range: rangeOf(n),
    };
  }

  private statement(n: CstNode): A.Stmt {
    const range = rangeOf(n);
    const without = node(n, 'statementWithoutTrailingSubstatement');
    if (without) return this.simpleStatement(without);
    const labeled = node(n, 'labeledStatement');
    if (labeled) return { kind: 'Labeled', label: tok(labeled, 'Identifier')!.image, body: this.statement(node(labeled, 'statement')!), range };
    const ifs = node(n, 'ifStatement');
    if (ifs) {
      const [then, otherwise] = nodes(ifs, 'statement');
      return { kind: 'If', cond: this.expression(node(ifs, 'expression')!), then: this.statement(then), else: otherwise ? this.statement(otherwise) : undefined, range };
    }
    const whiles = node(n, 'whileStatement');
    if (whiles) return { kind: 'While', cond: this.expression(node(whiles, 'expression')!), body: this.statement(node(whiles, 'statement')!), range };
    const fors = node(n, 'forStatement')!;
    const basic = node(fors, 'basicForStatement');
    if (basic) {
      const init = node(basic, 'forInit');
      const cond = node(basic, 'expression');
      const update = node(basic, 'forUpdate');
      const decl = init ? node(init, 'localVariableDeclaration') : undefined;
      return {
        kind: 'For',
        init: init ? (decl ? this.localVariableDeclaration(decl) : this.statementExpressions(node(init, 'statementExpressionList')!)) : undefined,
        cond: cond ? this.expression(cond) : undefined,
        update: update ? this.statementExpressions(node(update, 'statementExpressionList')!) : [],
        body: this.statement(node(basic, 'statement')!),
        range,
      };
    }
    const each = node(fors, 'enhancedForStatement')!;
    return {
      kind: 'ForEach',
      variable: this.localVariableDeclaration(node(each, 'localVariableDeclaration')!),
      iterable: this.expression(node(each, 'expression')!),
      body: this.statement(node(each, 'statement')!),
      range,
    };
  }

  private statementExpressions(n: CstNode): A.Expr[] {
    return nodes(n, 'statementExpression').map(s => this.expression(node(s, 'expression')!));
  }

  private simpleStatement(n: CstNode): A.Stmt {
    const range = rangeOf(n);
    const [{ key, el }] = ordered(n);
    const s = el as CstNode;
    switch (key) {
      case 'block': return this.block(s);
      case 'yieldStatement': return { kind: 'Yield', value: this.expression(node(s, 'expression')!), range };
      case 'emptyStatement': return { kind: 'Empty', range };
      case 'expressionStatement': return { kind: 'ExprStmt', expr: this.expression(node(node(s, 'statementExpression')!, 'expression')!), range };
      case 'assertStatement': {
        const [cond, message] = nodes(s, 'expression');
        return { kind: 'Assert', cond: this.expression(cond), message: message ? this.expression(message) : undefined, range };
      }
      case 'switchStatement': return { kind: 'SwitchStmt', ...this.switchParts(s), range };
      case 'doStatement': return { kind: 'DoWhile', body: this.statement(node(s, 'statement')!), cond: this.expression(node(s, 'expression')!), range };
      case 'breakStatement': return { kind: 'Break', label: tok(s, 'Identifier')?.image, range };
      case 'continueStatement': return { kind: 'Continue', label: tok(s, 'Identifier')?.image, range };
      case 'returnStatement': {
        const value = node(s, 'expression');
        return { kind: 'Return', value: value ? this.expression(value) : undefined, range };
      }
      case 'synchronizedStatement': return { kind: 'Synchronized', lock: this.expression(node(s, 'expression')!), body: this.block(node(s, 'block')!), range };
      case 'throwStatement': return this.throwStatement(s);
      case 'tryStatement': return this.tryStatement(s);
    }
    return this.unsupported('this statement', n);
  }

  private throwStatement(n: CstNode): A.Throw {
    return { kind: 'Throw', value: this.expression(node(n, 'expression')!), range: rangeOf(n) };
  }

  private tryStatement(n: CstNode): A.Try {
    const withResources = node(n, 'tryWithResourcesStatement');
    const t = withResources ?? n;
    const catches = node(t, 'catches');
    const fin = node(t, 'finally');
    const spec = withResources ? node(withResources, 'resourceSpecification') : undefined;
    const resources = spec ? nodes(node(spec, 'resourceList')!, 'resource').map(r => {
      const decl = node(r, 'localVariableDeclaration');
      return decl ? this.localVariableDeclaration(decl) : this.primary(node(node(r, 'variableAccess')!, 'primary')!);
    }) : [];
    return {
      kind: 'Try',
      resources,
      resourcesTrailingSemicolon: spec ? has(spec, 'Semicolon') : false,
      block: this.block(node(t, 'block')!),
      catches: catches ? nodes(catches, 'catchClause').map(c => this.catchClause(c)) : [],
      finally: fin ? this.block(node(fin, 'block')!) : undefined,
      range: rangeOf(n),
    };
  }

  private catchClause(n: CstNode): A.Catch {
    const param = node(n, 'catchFormalParameter')!;
    const type = node(param, 'catchType')!;
    const id = node(param, 'variableDeclaratorId')!;
    return {
      kind: 'Catch',
      modifiers: this.modifiers(nodes(param, 'variableModifier')),
      types: [this.classTypeOf(node(type, 'unannClassType')!), ...nodes(type, 'classType').map(t => this.classTypeOf(t))],
      name: (tok(id, 'Identifier') ?? tok(id, 'Underscore'))!.image,
      body: this.block(node(n, 'block')!),
      range: rangeOf(n),
    };
  }

  private switchParts(n: CstNode): { selector: A.Expr; body: A.SwitchBody } {
    const block = node(n, 'switchBlock')!;
    const rules = nodes(block, 'switchRule');
    const body: A.SwitchBody = rules.length
      ? { kind: 'rules', rules: rules.map(r => this.switchRule(r)) }
      : { kind: 'groups', groups: nodes(block, 'switchBlockStatementGroup').map(g => this.switchGroup(g)) };
    return { selector: this.expression(node(n, 'expression')!), body };
  }

  private switchRule(n: CstNode): A.SwitchRule {
    const thrown = node(n, 'throwStatement');
    const block = node(n, 'block');
    const expr = node(n, 'expression');
    return {
      kind: 'SwitchRule',
      label: this.switchLabel(node(n, 'switchLabel')!),
      body: thrown ? this.throwStatement(thrown) : block ? this.block(block) : this.expression(expr!),
      range: rangeOf(n),
    };
  }

  private switchGroup(n: CstNode): A.SwitchGroup {
    const statements = node(n, 'blockStatements');
    return { kind: 'SwitchGroup', label: this.switchLabel(node(n, 'switchLabel')!), statements: statements ? this.blockStatements(statements) : [], range: rangeOf(n) };
  }

  private switchLabel(n: CstNode): A.SwitchLabel {
    const guard = node(n, 'guard');
    return {
      kind: 'SwitchLabel',
      isDefault: has(n, 'Default') && !has(n, 'Null'),
      isNull: has(n, 'Null'),
      nullDefault: has(n, 'Null') && has(n, 'Default'),
      constants: nodes(n, 'caseConstant').map(c => this.conditionalExpression(node(c, 'conditionalExpression')!)),
      patterns: nodes(n, 'casePattern').map(p => this.pattern(node(p, 'pattern')!)),
      guard: guard ? this.expression(node(guard, 'expression')!) : undefined,
      range: rangeOf(n),
    };
  }

  // ── Expressions ──

  expression(n: CstNode): A.Expr {
    const lambda = node(n, 'lambdaExpression');
    return lambda ? this.lambda(lambda) : this.conditionalExpression(node(n, 'conditionalExpression')!);
  }

  private argumentList(n: CstNode): A.Expr[] {
    return nodes(n, 'expression').map(e => this.expression(e));
  }

  private conditionalExpression(n: CstNode): A.Expr {
    const test = this.binaryExpression(node(n, 'binaryExpression')!);
    const branches = nodes(n, 'expression');
    if (!branches.length) return test;
    return { kind: 'Conditional', cond: test, then: this.expression(branches[0]), else: this.expression(branches[1]), range: rangeOf(n) };
  }

  /** A flat binaryExpression, rebuilt as a tree by precedence climbing. */
  private binaryExpression(n: CstNode): A.Expr {
    const first = this.unaryExpression(nodes(n, 'unaryExpression')[0]);
    const steps: Step[] = [];
    const items = ordered(n).slice(1); // after the first operand
    for (let i = 0; i < items.length; i++) {
      const { key, el } = items[i];
      if (key === 'BinaryOperator') {
        steps.push({ kind: 'binary', op: (el as CstToken).image as A.BinaryOp, operand: this.unaryExpression(items[++i].el as CstNode) });
      } else if (key === 'shiftOperator') {
        const op = ordered(el as CstNode).map(t => (t.el as CstToken).image).join('') as A.BinaryOp;
        steps.push({ kind: 'binary', op, operand: this.unaryExpression(items[++i].el as CstNode) });
      } else if (key === 'Instanceof') {
        const target = items[++i];
        const range = span(rangeOf(el), rangeOf(target.el));
        steps.push(target.key === 'pattern'
          ? { kind: 'instanceof', pattern: this.pattern(target.el as CstNode), range }
          : { kind: 'instanceof', type: this.referenceType(target.el as CstNode), range });
      } else if (key === 'AssignmentOperator') {
        steps.push({ kind: 'assign', op: (el as CstToken).image as A.AssignOp, value: this.expression(items[++i].el as CstNode) });
      }
    }
    // An assignment's right side is a whole expression, so it is always the last step.
    const last = steps[steps.length - 1];
    if (last?.kind === 'assign') {
      const target = climb(first, steps.slice(0, -1));
      return { kind: 'Assign', op: last.op, target, value: last.value, range: span(target.range, last.value.range) };
    }
    return climb(first, steps);
  }

  private unaryExpression(n: CstNode): A.Expr {
    let e = this.primary(node(n, 'primary')!);
    for (const t of tokens(n, 'UnarySuffixOperator')) {
      e = { kind: 'IncDec', op: t.image as '++' | '--', prefix: false, operand: e, range: span(e.range, rangeOf(t)) };
    }
    const prefixes = [...tokens(n, 'UnaryPrefixOperator'), ...tokens(n, 'UnaryPrefixOperatorNotPlusMinus')];
    for (let i = prefixes.length - 1; i >= 0; i--) {
      const t = prefixes[i];
      const range = span(rangeOf(t), e.range);
      e = t.image === '++' || t.image === '--'
        ? { kind: 'IncDec', op: t.image, prefix: true, operand: e, range }
        : { kind: 'Unary', op: t.image as A.UnaryOp, operand: e, range };
    }
    return e;
  }

  // ── Primaries: a prefix, then suffixes (.name, (args), [index], .class, ::name) ──

  primary(n: CstNode): A.Expr {
    const prefixNode = node(n, 'primaryPrefix')!;
    const suffixes = nodes(n, 'primarySuffix');
    const start = rangeOf(prefixNode);
    let i = 0;
    let cur: A.Expr | A.TypeNode;

    const fqn = node(prefixNode, 'fqnOrRefType');
    if (fqn) {
      const pieces = this.namePieces(fqn);
      const dims = node(fqn, 'dims');
      const first = suffixes[0];
      if (!dims && first && has(first, 'methodInvocationSuffix')) {
        // `a.b.c(x)`: the last part is the method's name, the rest its target.
        const method = pieces[pieces.length - 1];
        const target = pieces.length > 1 ? this.piecesExpr(pieces.slice(0, -1)) : undefined;
        if (method.name === 'super' || method.name === 'this') return this.unsupported(`${method.name}(…) outside a constructor's first statement`, n);
        cur = {
          kind: 'MethodCall', target, typeArgs: method.methodTypeArgs, name: method.name, nameRange: method.range,
          args: this.invocationArgs(first), range: span(start, rangeOf(first)),
        };
        i = 1;
      } else if (dims || pieces.some(p => p.typeArgs)) {
        // `String[]::new`, `List<String>::size`, `String[].class`: a type.
        cur = this.withDims(this.piecesType(pieces, rangeOf(fqn)), dims);
      } else {
        cur = this.piecesExpr(pieces);
      }
    } else {
      cur = this.primaryPrefix(prefixNode);
    }

    for (; i < suffixes.length; i++) {
      const s = suffixes[i];
      const range = span(start, rangeOf(s));
      if (has(s, 'Dot')) {
        if (has(s, 'This')) {
          cur = cur.kind === 'Name' ? { kind: 'This', qualifier: cur, range } : this.unsupported('.this after an expression that isn\'t a class name', range);
        } else if (has(s, 'unqualifiedClassInstanceCreationExpression')) {
          if (!isExpr(cur)) return this.unsupported('.new after a type', range);
          cur = { ...this.newObject(node(s, 'unqualifiedClassInstanceCreationExpression')!), outer: cur, range };
        } else if (has(s, 'Identifier')) {
          const id = tok(s, 'Identifier')!;
          const typeArgs = node(s, 'typeArguments');
          if (!isExpr(cur)) return this.unsupported('a member of a type that isn\'t a simple name', range);
          const next = suffixes[i + 1];
          if (next && has(next, 'methodInvocationSuffix')) {
            cur = {
              kind: 'MethodCall', target: cur, typeArgs: typeArgs ? this.typeArguments(typeArgs) : undefined, name: id.image,
              nameRange: rangeOf(id), args: this.invocationArgs(next), range: span(start, rangeOf(next)),
            };
            i++;
          } else {
            cur = { kind: 'FieldAccess', target: cur, name: id.image, nameRange: rangeOf(id), range };
          }
        } else {
          return this.unsupported('string templates', range);
        }
      } else if (has(s, 'arrayAccessSuffix')) {
        const access = node(s, 'arrayAccessSuffix')!;
        if (!isExpr(cur)) return this.unsupported('[] after a type', range);
        cur = { kind: 'ArrayAccess', array: cur, index: this.expression(node(access, 'expression')!), range };
      } else if (has(s, 'classLiteralSuffix')) {
        const lit = node(s, 'classLiteralSuffix')!;
        let type = this.asType(cur);
        if (!type) return this.unsupported('.class after an expression', range);
        for (const close of tokens(lit, 'RSquare')) type = { kind: 'ArrayType', component: type, range: span(type.range, rangeOf(close)) };
        cur = { kind: 'ClassLiteral', type, range };
      } else if (has(s, 'methodReferenceSuffix')) {
        const ref = node(s, 'methodReferenceSuffix')!;
        const typeArgs = node(ref, 'typeArguments');
        cur = {
          kind: 'MethodRef', target: cur, typeArgs: typeArgs ? this.typeArguments(typeArgs) : undefined,
          name: tok(ref, 'New') ? 'new' : tok(ref, 'Identifier')!.image, range,
        };
      } else {
        return this.unsupported('a call of something that isn\'t a method', range);
      }
    }
    return isExpr(cur) ? cur : this.unsupported('a type where a value belongs', cur.range);
  }

  private invocationArgs(suffix: CstNode): A.Expr[] {
    const list = node(node(suffix, 'methodInvocationSuffix')!, 'argumentList');
    return list ? this.argumentList(list) : [];
  }

  private primaryPrefix(n: CstNode): A.Expr | A.TypeNode {
    const range = rangeOf(n);
    const literal = node(n, 'literal');
    if (literal) return this.literal(literal);
    if (has(n, 'This')) return { kind: 'This', range };
    if (has(n, 'Void')) return { kind: 'VoidType', range };
    const prim = node(n, 'unannPrimitiveTypeWithOptionalDimsSuffix');
    if (prim) return this.withDims(this.primitiveType(node(prim, 'unannPrimitiveType')!), node(prim, 'dims'));
    const cast = node(n, 'castExpression');
    if (cast) return this.cast(cast);
    const parens = node(n, 'parenthesisExpression');
    if (parens) return { kind: 'Parens', expr: this.expression(node(parens, 'expression')!), range };
    const created = node(n, 'newExpression');
    if (created) {
      const arr = node(created, 'arrayCreationExpression');
      return arr ? this.newArray(arr) : this.newObject(node(created, 'unqualifiedClassInstanceCreationExpression')!);
    }
    const sw = node(n, 'switchStatement');
    if (sw) return { kind: 'SwitchExpr', ...this.switchParts(sw), range };
    return this.unsupported('this expression', n);
  }

  /** The parts of an fqnOrRefType: `a`, `b`, `super`, `c` in `a.b.super.c`. */
  private namePieces(fqn: CstNode): NamePiece[] {
    const parts = [node(fqn, 'fqnOrRefTypePartFirst')!, ...nodes(fqn, 'fqnOrRefTypePartRest')];
    return parts.map(p => {
      const common = node(p, 'fqnOrRefTypePartCommon')!;
      const id = tok(common, 'Identifier') ?? tok(common, 'Super')!;
      const methodTypeArgs = node(p, 'typeArguments');
      const typeArgs = node(common, 'typeArguments');
      return {
        name: id.image,
        range: rangeOf(id),
        methodTypeArgs: methodTypeArgs ? this.typeArguments(methodTypeArgs) : undefined,
        typeArgs: typeArgs ? this.typeArguments(typeArgs) : undefined,
      };
    });
  }

  /** A name, or with `super`: `super.x` is a field access of Super, `Outer.super.x` with a qualifier. */
  private piecesExpr(pieces: NamePiece[]): A.Expr {
    const superAt = pieces.findIndex(p => p.name === 'super');
    if (superAt < 0) return this.nameOfPieces(pieces);
    const superRange = pieces[superAt].range;
    let e: A.Expr = {
      kind: 'Super',
      qualifier: superAt > 0 ? this.nameOfPieces(pieces.slice(0, superAt)) : undefined,
      range: superAt > 0 ? span(pieces[0].range, superRange) : superRange,
    };
    for (const p of pieces.slice(superAt + 1)) e = { kind: 'FieldAccess', target: e, name: p.name, nameRange: p.range, range: span(e.range, p.range) };
    return e;
  }

  private nameOfPieces(pieces: NamePiece[]): A.Name {
    return {
      kind: 'Name',
      parts: pieces.map(p => ({ name: p.name, range: p.range })),
      range: span(pieces[0].range, pieces[pieces.length - 1].range),
    };
  }

  private piecesType(pieces: NamePiece[], range: A.Range): A.ClassType {
    return { kind: 'ClassType', parts: pieces.map(p => ({ name: p.name, typeArgs: p.typeArgs, range: p.range })), range };
  }

  private nameOf(ids: CstToken[]): A.Name {
    return this.nameOfPieces(ids.map(t => ({ name: t.image, range: rangeOf(t) })));
  }

  /** What `.class` or `::` follows, as a type: a name is read as a class type. */
  private asType(e: A.Expr | A.TypeNode): A.TypeNode | undefined {
    if (e.kind === 'Name') return { kind: 'ClassType', parts: e.parts.map(p => ({ name: p.name, range: p.range })), range: e.range };
    return isExpr(e) ? undefined : e;
  }

  private literal(n: CstNode): A.Literal {
    const range = rangeOf(n);
    const int = node(n, 'integerLiteral');
    const float = node(n, 'floatingPointLiteral');
    const bool = node(n, 'booleanLiteral');
    const t = (int ? ordered(int)[0].el : float ? ordered(float)[0].el : bool ? ordered(bool)[0].el : ordered(n)[0].el) as CstToken;
    const text = t.image;
    let type: A.LiteralType;
    if (int) type = /[lL]$/.test(text) ? 'long' : 'int';
    else if (float) type = /[fF]$/.test(text) ? 'float' : 'double';
    else if (bool) type = 'boolean';
    else if (t.tokenType.name === 'CharLiteral') type = 'char';
    else if (t.tokenType.name === 'Null') type = 'null';
    else type = 'String';
    return { kind: 'Literal', type, text, textBlock: t.tokenType.name === 'TextBlock', range };
  }

  private cast(n: CstNode): A.Expr {
    const range = rangeOf(n);
    const prim = node(n, 'primitiveCastExpression');
    if (prim) {
      return { kind: 'Cast', type: this.primitiveType(node(prim, 'primitiveType')!), extraBounds: [], expr: this.unaryExpression(node(prim, 'unaryExpression')!), range };
    }
    const ref = node(n, 'referenceTypeCastExpression')!;
    const lambda = node(ref, 'lambdaExpression');
    return {
      kind: 'Cast',
      type: this.referenceType(node(ref, 'referenceType')!),
      extraBounds: nodes(ref, 'additionalBound').map(b => this.classType(node(b, 'interfaceType')!)),
      expr: lambda ? this.lambda(lambda) : this.unaryExpression(node(ref, 'unaryExpressionNotPlusMinus')!),
      range,
    };
  }

  private newObject(n: CstNode): A.NewObject {
    const typeNode = node(n, 'classOrInterfaceTypeToInstantiate')!;
    const parts: A.ClassTypePart[] = tokens(typeNode, 'Identifier').map(t => ({ name: t.image, range: rangeOf(t) }));
    const argsOrDiamond = node(typeNode, 'typeArgumentsOrDiamond');
    const typeArgs = argsOrDiamond ? node(argsOrDiamond, 'typeArguments') : undefined;
    if (typeArgs) {
      const last = parts[parts.length - 1];
      last.typeArgs = this.typeArguments(typeArgs);
      last.range = span(last.range, rangeOf(typeArgs));
    }
    const ctorTypeArgs = node(n, 'typeArguments');
    const args = node(n, 'argumentList');
    const body = node(n, 'classBody');
    return {
      kind: 'NewObject',
      typeArgs: ctorTypeArgs ? this.typeArguments(ctorTypeArgs) : undefined,
      type: { kind: 'ClassType', parts, range: rangeOf(typeNode) },
      diamond: argsOrDiamond ? has(argsOrDiamond, 'diamond') : false,
      args: args ? this.argumentList(args) : [],
      body: body ? this.classBody(body) : undefined,
      range: rangeOf(n),
    };
  }

  private newArray(n: CstNode): A.NewArray {
    const prim = node(n, 'primitiveType');
    const elementType = prim ? this.primitiveType(prim) : this.classType(node(n, 'classOrInterfaceType')!);
    const withoutInit = node(n, 'arrayCreationExpressionWithoutInitializerSuffix');
    if (withoutInit) {
      return {
        kind: 'NewArray',
        elementType,
        dimExprs: nodes(node(withoutInit, 'dimExprs')!, 'dimExpr').map(d => this.expression(node(d, 'expression')!)),
        extraDims: this.dimCount(node(withoutInit, 'dims')),
        range: rangeOf(n),
      };
    }
    const withInit = node(n, 'arrayCreationWithInitializerSuffix')!;
    return {
      kind: 'NewArray',
      elementType,
      dimExprs: [],
      extraDims: this.dimCount(node(withInit, 'dims')),
      init: this.arrayInitializer(node(withInit, 'arrayInitializer')!),
      range: rangeOf(n),
    };
  }

  private lambda(n: CstNode): A.Lambda {
    const paramsNode = node(n, 'lambdaParameters')!;
    const body = node(n, 'lambdaBody')!;
    const block = node(body, 'block');
    const withBraces = node(paramsNode, 'lambdaParametersWithBraces');
    let params: A.LambdaParam[];
    if (!withBraces) {
      const id = (tok(paramsNode, 'Identifier') ?? tok(paramsNode, 'Underscore'))!;
      params = [this.untypedLambdaParam(id)];
    } else {
      const list = node(withBraces, 'lambdaParameterList');
      const concise = list ? node(list, 'conciseLambdaParameterList') : undefined;
      const normal = list ? node(list, 'normalLambdaParameterList') : undefined;
      if (concise) {
        params = nodes(concise, 'conciseLambdaParameter').map(p => this.untypedLambdaParam((tok(p, 'Identifier') ?? tok(p, 'Underscore'))!));
      } else if (normal) {
        params = nodes(normal, 'normalLambdaParameter').map(p => {
          const regular = node(p, 'regularLambdaParameter');
          if (!regular) {
            const v = this.varargsParameter(node(p, 'variableArityParameter')!);
            return { kind: 'LambdaParam' as const, modifiers: v.modifiers, type: v.type, varargs: true, name: v.name, dims: 0, range: v.range };
          }
          const id = node(regular, 'variableDeclaratorId')!;
          return {
            kind: 'LambdaParam' as const,
            modifiers: this.modifiers(nodes(regular, 'variableModifier')),
            type: this.localType(node(regular, 'lambdaParameterType')!),
            varargs: false,
            name: (tok(id, 'Identifier') ?? tok(id, 'Underscore'))!.image,
            dims: this.dimCount(node(id, 'dims')),
            range: rangeOf(p),
          };
        });
      } else {
        params = [];
      }
    }
    return {
      kind: 'Lambda',
      params,
      parenthesized: withBraces !== undefined,
      body: block ? this.block(block) : this.expression(node(body, 'expression')!),
      range: rangeOf(n),
    };
  }

  private untypedLambdaParam(id: CstToken): A.LambdaParam {
    return { kind: 'LambdaParam', modifiers: [], varargs: false, name: id.image, dims: 0, range: rangeOf(id) };
  }

  // ── Patterns ──

  private pattern(n: CstNode): A.Pattern {
    const typed = node(n, 'typePattern');
    if (typed) {
      const decl = this.localVariableDeclaration(node(typed, 'localVariableDeclaration')!);
      return { kind: 'TypePattern', modifiers: decl.modifiers, type: decl.type, name: decl.declarators[0].name, range: rangeOf(n) };
    }
    const rec = node(n, 'recordPattern')!;
    const list = node(rec, 'componentPatternList');
    return {
      kind: 'RecordPattern',
      type: this.referenceType(node(rec, 'referenceType')!),
      components: list ? nodes(list, 'componentPattern').map(c => {
        const p = node(c, 'pattern');
        return p ? this.pattern(p) : { kind: 'MatchAllPattern' as const, range: rangeOf(c) };
      }) : [],
      range: rangeOf(n),
    };
  }
}

const TYPE_KINDS = new Set(['PrimitiveType', 'ClassType', 'ArrayType', 'VarType', 'VoidType', 'Wildcard']);

function isExpr(e: A.Expr | A.TypeNode): e is A.Expr {
  return !TYPE_KINDS.has(e.kind);
}

/** Precedence climbing over the operators of a flat binaryExpression (all left-associative). */
function climb(first: A.Expr, steps: Step[]): A.Expr {
  let pos = 0;
  const precedence = (s: Step) => (s.kind === 'binary' ? BINARY_PRECEDENCE[s.op] : INSTANCEOF_PRECEDENCE);
  const parse = (left: A.Expr, min: number): A.Expr => {
    while (pos < steps.length && precedence(steps[pos]) >= min) {
      const step = steps[pos++];
      if (step.kind === 'instanceof') {
        left = { kind: 'InstanceOf', expr: left, type: step.type, pattern: step.pattern, range: span(left.range, step.range) };
      } else if (step.kind === 'binary') {
        const right = parse(step.operand, BINARY_PRECEDENCE[step.op] + 1);
        left = { kind: 'Binary', op: step.op, left, right, range: span(left.range, right.range) };
      }
    }
    return left;
  };
  return parse(first, 0);
}

