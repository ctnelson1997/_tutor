/**
 * Name resolution and static types (#13): binds a program's AST into the
 * bound tree (bound.ts) that the evaluator runs.
 *
 * 1. The library: stubs.ts parsed into ClassSymbols, once.
 * 2. Declarations: a ClassSymbol per class (nested ones too), then their
 *    type parameters, supertypes, fields, methods and constructors.
 * 3. Bodies: every name classified as JLS §6.5 does (a local, a field of
 *    which class, a type, a package), every expression typed, overloads
 *    chosen as JLS §15.12.2 does (strict, then loose, then variable arity;
 *    the most specific wins), and conversions made explicit (§5).
 *
 * Problems are diagnostics: `error` is what javac would reject (the program
 * doesn't run), `unsupported` a declaration JavaTutor can't run yet (also
 * before anything runs). A construct inside code that JavaTutor can't run yet
 * becomes an Unsupported node instead, so the steps before it still show.
 */

import type * as A from '../ast/ast';
import { parseAst } from '../ast/convert';
import { libraryStubs } from './stubs';
import { ClassSymbol, FieldSymbol, MethodSymbol, LocalSymbol, type ClassKind, type ConstValue, type LocalKind } from './symbols';
import {
  type JType, type ClassT, type ArrayT, type PrimitiveT, type TypeVarT, type Builtins,
  primitive, classType, arrayOf, INT, LONG, BOOLEAN, CHAR, NULL, VOID, DYNAMIC, ERROR,
  isPrimitive, isNumeric, isIntegral, isReference, isLoose, unboxedType, primitiveOf, typeName,
  erasure, sameType, substitute, typeArgMap, asSuper, readType, isSubtype, invocable, assignable,
  castable, unaryPromote, binaryPromote, widensTo, BOX_OF,
} from './types';
import type * as B from './bound';
import { integerLiteralValue, floatingLiteralValue, stringLiteralValue, charLiteralValue, textBlockValue } from '../literals';
import { binaryOperation, unaryOperation, castPrimitive, doubleToString, floatToString } from '../numeric';
import type { JavaPrimitive, JavaPrimitiveType } from '../types';

export interface Diagnostic {
  kind: 'error' | 'unsupported';
  message: string;
  range: A.Range;
  /** For `unsupported`: the construct, and whether its message is singular ("isn't supported"). */
  construct?: string;
  singular?: boolean;
}

export interface BindResult {
  program: B.BProgram;
  diagnostics: Diagnostic[];
}

// ── Packages and the library ──

/** Packages a program can name; their classes come from the stubs. */
const LIBRARY_PACKAGES = ['java.lang', 'java.util', 'java.io'];
const PACKAGE_PREFIXES = new Set(['java', ...LIBRARY_PACKAGES]);

export interface Library {
  packages: Map<string, Map<string, ClassSymbol>>;
  builtins: Builtins;
  /** A library class by simple name, from any package (java.lang first). */
  byName(name: string): ClassSymbol | undefined;
}

let cachedLibrary: Library | undefined;

/** The library's ClassSymbols, built from the stubs the first time. */
export function library(): Library {
  if (cachedLibrary) return cachedLibrary;
  const packages = new Map<string, Map<string, ClassSymbol>>();
  const parsed = libraryStubs().map(({ packageName, source }) => ({ packageName, unit: parseAst(source) }));
  const byName = (name: string): ClassSymbol | undefined => {
    for (const p of LIBRARY_PACKAGES) {
      const found = packages.get(p)?.get(name);
      if (found) return found;
    }
    return undefined;
  };
  // Builtins resolve lazily, since the type system needs them while the library itself is being declared.
  const builtins: Builtins = {
    get object() { return byName('Object')!; },
    get string() { return byName('String')!; },
    get cloneable() { return byName('Cloneable')!; },
    get serializable() { return byName('Serializable')!; },
    box: p => byName(BOX_OF[p])!,
  };
  const lib: Library = { packages, builtins, byName };
  const declarer = new Declarer(lib, [], true);
  for (const { packageName, unit } of parsed) {
    const classes = new Map<string, ClassSymbol>();
    packages.set(packageName, classes);
    for (const t of unit.types) {
      if (t.kind !== 'Unsupported') classes.set(t.name, declarer.enter(t, packageName, undefined));
    }
  }
  for (const { packageName } of parsed) for (const sym of packages.get(packageName)!.values()) declarer.resolveHeaders(sym, { packageName });
  for (const { packageName } of parsed) for (const sym of packages.get(packageName)!.values()) declarer.resolveMembers(sym, { packageName });
  cachedLibrary = lib;
  return lib;
}

// ── Where a type name is looked up ──

interface Imports {
  /** `import java.util.List;`: simple name → class. */
  single: Map<string, ClassSymbol>;
  /** `import java.util.*;`: packages. */
  onDemand: string[];
}

interface TypeContext {
  cls?: ClassSymbol;
  method?: MethodSymbol;
  /** For a library stub: its package, whose classes come first. */
  packageName?: string;
  imports?: Imports;
}

let nextTypeVarId = 1;

/** Builds ClassSymbols from declarations: the library's (from the stubs) and the program's. */
class Declarer {
  readonly lib: Library;
  readonly diagnostics: Diagnostic[];
  readonly isLibrary: boolean;
  /** The program's top-level classes, by name. */
  readonly topLevel = new Map<string, ClassSymbol>();
  /** Every class of the program by simple name: JavaTutor knows classes by simple name, so two can't share one. */
  readonly allUserClasses = new Map<string, ClassSymbol>();

  constructor(lib: Library, diagnostics: Diagnostic[], isLibrary: boolean) {
    this.lib = lib;
    this.diagnostics = diagnostics;
    this.isLibrary = isLibrary;
  }

  enter(decl: A.TypeDecl, packageName: string, outer: ClassSymbol | undefined): ClassSymbol {
    const kind: ClassKind = decl.kind === 'ClassDecl' ? 'class' : decl.kind === 'InterfaceDecl' ? 'interface'
      : decl.kind === 'EnumDecl' ? 'enum' : decl.kind === 'RecordDecl' ? 'record' : 'annotation';
    const sym = new ClassSymbol(decl.name, kind, packageName, this.isLibrary, outer);
    sym.decl = decl;
    for (const m of decl.modifiers) if (typeof m === 'string') sym.modifiers.add(m);
    // Members of an interface are implicitly static.
    if (outer?.isInterface) sym.modifiers.add('static');
    if (!this.isLibrary) {
      if (this.allUserClasses.has(decl.name)) this.unsupported(`Two classes named ${decl.name}`, decl.range);
      else this.allUserClasses.set(decl.name, sym);
    }
    if (decl.kind !== 'AnnotationTypeDecl') {
      for (const m of decl.members) {
        if (m.kind === 'ClassDecl' || m.kind === 'InterfaceDecl' || m.kind === 'EnumDecl' || m.kind === 'RecordDecl' || m.kind === 'AnnotationTypeDecl') {
          sym.memberTypes.set(m.name, this.enter(m, packageName, sym));
        }
      }
    }
    return sym;
  }

  unsupported(construct: string, range: A.Range, singular = false): void {
    this.diagnostics.push({ kind: 'unsupported', construct, singular, range, message: `${construct} ${singular ? "isn't" : "aren't"} supported in JavaTutor yet` });
  }

  error(message: string, range: A.Range): void {
    this.diagnostics.push({ kind: 'error', message, range });
  }

  /** Type parameters and supertypes of a class and its member classes. */
  resolveHeaders(sym: ClassSymbol, where: TypeContext): void {
    const decl = sym.decl!;
    const ctx: TypeContext = { ...where, cls: sym };
    if ('typeParams' in decl) sym.typeParams = this.declareTypeParams(decl.typeParams, ctx);
    const object = this.lib.builtins.object;
    if (decl.kind === 'ClassDecl') {
      if (decl.superclass) {
        const sup = this.resolveType(decl.superclass, ctx);
        if (sup.tag === 'dynamic') {
          this.unsupported(`Inheritance (class ${decl.name} extends ${decl.superclass.parts[decl.superclass.parts.length - 1].name})`, decl.superclass.range, true);
          sym.superclass = classType(object);
        } else if (sup.tag === 'class') {
          // A class may extend a library exception class; extending anything else is #15.
          if (!this.isLibrary && !(sup.symbol.isLibrary && isThrowableClass(sup.symbol)) && sup.symbol !== object) {
            this.unsupported(`Inheritance (class ${decl.name} extends ${decl.superclass.parts[decl.superclass.parts.length - 1].name})`, decl.superclass.range, true);
          }
          sym.superclass = sup;
        }
      } else if (sym !== object) {
        sym.superclass = classType(object);
      }
      sym.interfaces = this.classTypes(decl.interfaces, ctx);
    } else if (decl.kind === 'InterfaceDecl') {
      sym.interfaces = this.classTypes(decl.extends, ctx);
    } else if (!this.isLibrary) {
      if (decl.kind === 'EnumDecl') this.unsupported('Enums', decl.range);
      else if (decl.kind === 'RecordDecl') this.unsupported('Records', decl.range);
      else this.unsupported('Annotation types (@interface)', decl.range);
      sym.superclass = classType(object);
    }
    for (const m of sym.memberTypes.values()) this.resolveHeaders(m, where);
  }

  private classTypes(list: A.ClassType[], ctx: TypeContext): ClassT[] {
    return list.map(t => this.resolveType(t, ctx)).filter((t): t is ClassT => t.tag === 'class');
  }

  declareTypeParams(params: A.TypeParam[], ctx: TypeContext): TypeVarT[] {
    const vars = params.map(p => ({ tag: 'typevar' as const, name: p.name, bound: classType(this.lib.builtins.object) as JType, id: nextTypeVarId++ }));
    // Bounds may mention the parameters themselves (T extends Comparable<T>).
    const scoped: TypeContext = { ...ctx, method: ctx.method };
    const extra = new Map(vars.map(v => [v.name, v]));
    params.forEach((p, i) => {
      if (p.bounds.length) vars[i].bound = this.resolveType(p.bounds[0], scoped, extra);
    });
    return vars;
  }

  /** Fields, methods and constructors of a class and its member classes. */
  resolveMembers(sym: ClassSymbol, where: TypeContext): void {
    const decl = sym.decl!;
    const ctx: TypeContext = { ...where, cls: sym };
    if (decl.kind === 'AnnotationTypeDecl') return;
    for (const m of decl.members) {
      if (m.kind === 'FieldDecl') {
        const isStatic = sym.isInterface || m.modifiers.includes('static');
        const isFinal = sym.isInterface || m.modifiers.includes('final');
        const base = this.resolveType(m.type, ctx);
        for (const d of m.declarators) {
          let t = base;
          for (let i = 0; i < d.dims; i++) t = arrayOf(t);
          sym.fields.set(d.name, new FieldSymbol(d.name, sym, t, isStatic, isFinal, d));
        }
      } else if (m.kind === 'MethodDecl') {
        sym.addMethod(this.method(sym, m, ctx));
      } else if (m.kind === 'ConstructorDecl') {
        sym.constructors.push(this.constructor_(sym, m, ctx));
      }
    }
    // A class without a constructor gets the default one.
    if (!sym.isInterface && sym.constructors.length === 0 && (decl.kind === 'ClassDecl')) {
      const ctor = new MethodSymbol('<init>', sym, VOID, true);
      ctor.modifiers.add('public');
      sym.constructors.push(ctor);
    }
    for (const m of sym.memberTypes.values()) this.resolveMembers(m, where);
  }

  private method(sym: ClassSymbol, m: A.MethodDecl, ctx: TypeContext): MethodSymbol {
    const method = new MethodSymbol(m.name, sym, VOID, false, m);
    // java-parser reads `record P(int x) {}` in a class as a method named P returning `record`.
    if (!this.isLibrary && m.result.kind === 'ClassType' && m.result.parts.length === 1 && m.result.parts[0].name === 'record') {
      this.unsupported('Records', m.range);
      return method;
    }
    for (const mod of m.modifiers) if (typeof mod === 'string') method.modifiers.add(mod);
    if (sym.isInterface && !method.modifiers.has('static') && !method.modifiers.has('private') && !method.modifiers.has('default')) method.modifiers.add('abstract');
    if (sym.isInterface && !this.isLibrary && method.modifiers.has('default')) this.unsupported('Default methods in interfaces', m.range);
    const mctx: TypeContext = { ...ctx, method };
    method.typeParams = this.declareTypeParams(m.typeParams, mctx);
    let result = this.resolveType(m.result, mctx);
    for (let i = 0; i < m.dims; i++) result = arrayOf(result);
    method.returnType = result;
    this.params(method, m.params, mctx);
    return method;
  }

  private constructor_(sym: ClassSymbol, c: A.ConstructorDecl, ctx: TypeContext): MethodSymbol {
    const ctor = new MethodSymbol('<init>', sym, VOID, true, c);
    for (const mod of c.modifiers) if (typeof mod === 'string') ctor.modifiers.add(mod);
    const mctx: TypeContext = { ...ctx, method: ctor };
    ctor.typeParams = this.declareTypeParams(c.typeParams, mctx);
    this.params(ctor, c.params, mctx);
    return ctor;
  }

  private params(method: MethodSymbol, params: A.Param[], ctx: TypeContext): void {
    method.params = params.map(p => {
      let t = this.resolveType(p.type, ctx);
      for (let i = 0; i < p.dims; i++) t = arrayOf(t);
      if (p.varargs) t = arrayOf(t);
      return { name: p.name, type: t };
    });
    method.varargs = params.length > 0 && params[params.length - 1].varargs;
  }

  // ── Type names ──

  /** A type as declared. Unknown names are reported (once) and become the error type. */
  resolveType(t: A.TypeNode, ctx: TypeContext, extraVars?: Map<string, TypeVarT>): JType {
    switch (t.kind) {
      case 'PrimitiveType': return primitive(t.name);
      case 'VoidType': return VOID;
      case 'VarType': return DYNAMIC;
      case 'ArrayType': return arrayOf(this.resolveType(t.component, ctx, extraVars));
      case 'Wildcard':
        return t.bound
          ? { tag: 'wildcard', kind: t.bound.kind, bound: this.resolveType(t.bound.type, ctx, extraVars) }
          : { tag: 'wildcard', kind: 'unbounded' };
      case 'ClassType': {
        const resolved = this.resolveClassType(t, ctx, extraVars);
        if (resolved) return resolved;
        // A library class JavaTutor knows of but lacks (Thread, BinaryOperator, …): what uses it is reported when it runs.
        if (UNSUPPORTED_LIBRARY.has(t.parts[t.parts.length - 1].name)) return DYNAMIC;
        this.error(`cannot find symbol\n  symbol:   class ${t.parts.map(p => p.name).join('.')}`, t.range);
        return ERROR;
      }
    }
  }

  private resolveClassType(t: A.ClassType, ctx: TypeContext, extraVars?: Map<string, TypeVarT>): JType | undefined {
    const first = t.parts[0];
    if (t.parts.length === 1) {
      if (first.name === '$any') return DYNAMIC;
      const v = extraVars?.get(first.name) ?? this.typeVar(first.name, ctx);
      if (v) return v;
    }
    let sym: ClassSymbol | undefined = this.findType(first.name, ctx);
    let pkg: string | undefined = sym ? undefined : first.name;
    let i = 1;
    if (!sym) {
      // A package name, then a class in it: java.util.List.
      for (; i < t.parts.length && !sym; i++) {
        const cls = this.lib.packages.get(pkg!)?.get(t.parts[i].name);
        if (cls) sym = cls;
        else pkg = `${pkg}.${t.parts[i].name}`;
      }
      if (!sym) return undefined;
    }
    let argsAt = sym === undefined ? undefined : t.parts[i - 1];
    for (; i < t.parts.length; i++) {
      const member: ClassSymbol | undefined = this.memberType(sym!, t.parts[i].name);
      if (!member) return undefined;
      sym = member;
      argsAt = t.parts[i];
    }
    const args = argsAt?.typeArgs?.map(a => this.resolveType(a, ctx, extraVars)) ?? [];
    return classType(sym!, args);
  }

  private typeVar(name: string, ctx: TypeContext): TypeVarT | undefined {
    const fromMethod = ctx.method?.typeParams.find(v => v.name === name);
    if (fromMethod) return fromMethod;
    for (let c: ClassSymbol | undefined = ctx.cls; c; c = c.outer) {
      const v = c.typeParams.find(p => p.name === name);
      if (v) return v;
      if (c.modifiers.has('static')) break;
    }
    return undefined;
  }

  /** A member class of a class or of its supertypes. */
  memberType(sym: ClassSymbol, name: string): ClassSymbol | undefined {
    const seen = new Set<ClassSymbol>();
    const search = (c: ClassSymbol): ClassSymbol | undefined => {
      if (seen.has(c)) return undefined;
      seen.add(c);
      const own = c.memberTypes.get(name);
      if (own) return own;
      for (const s of [c.superclass, ...c.interfaces]) {
        const found = s && search(s.symbol);
        if (found) return found;
      }
      return undefined;
    };
    return search(sym);
  }

  /** A simple type name (JLS §6.5.5.1): member classes in scope, the program's classes, imports, java.lang, then the library. */
  findType(name: string, ctx: TypeContext): ClassSymbol | undefined {
    for (let c: ClassSymbol | undefined = ctx.cls; c; c = c.outer) {
      const member = this.memberType(c, name);
      if (member) return member;
      if (c.name === name) return c;
    }
    if (ctx.packageName) {
      const same = this.lib.packages.get(ctx.packageName)?.get(name);
      if (same) return same;
    }
    const top = this.topLevel.get(name);
    if (top) return top;
    const imported = ctx.imports?.single.get(name);
    if (imported) return imported;
    const lang = this.lib.packages.get('java.lang')?.get(name);
    if (lang) return lang;
    for (const p of ctx.imports?.onDemand ?? []) {
      const found = this.lib.packages.get(p)?.get(name);
      if (found) return found;
    }
    // JavaTutor is lenient: a library class needs no import.
    return this.lib.byName(name);
  }
}

function isThrowableClass(sym: ClassSymbol): boolean {
  for (let c: ClassSymbol | undefined = sym; c; c = c.superclass?.symbol) if (c.name === 'Throwable' && c.isLibrary) return true;
  return false;
}

// ── Binding a program ──

/** Bind a program: its classes, then every body. */
export function bindProgram(unit: A.CompilationUnit): BindResult {
  return new Binder(unit).bind();
}

/** A conversion's kind, for BConvert. */
type ConversionKind = B.BConvert['conversion'];

class Scope {
  readonly parent?: Scope;
  readonly vars = new Map<string, LocalSymbol>();
  constructor(parent?: Scope) {
    this.parent = parent;
  }
  lookup(name: string): LocalSymbol | undefined {
    return this.vars.get(name) ?? this.parent?.lookup(name);
  }
}

/** Where code is being bound: its class, its method, and whether `this` exists. */
interface CodeContext {
  cls: ClassSymbol;
  method?: MethodSymbol;
  isStatic: boolean;
  returnType: JType;
  locals: LocalSymbol[];
}

/** What a name means (JLS §6.5.2). */
type NameMeaning =
  | { kind: 'expr'; expr: B.BExpr }
  | { kind: 'type'; type: ClassT }
  | { kind: 'package'; name: string }
  | { kind: 'error' };

class Binder {
  private readonly unit: A.CompilationUnit;
  private readonly diagnostics: Diagnostic[] = [];
  private readonly lib = library();
  private readonly declarer = new Declarer(this.lib, this.diagnostics, false);
  private readonly b = this.lib.builtins;
  private imports: Imports = { single: new Map(), onDemand: [] };
  private ctx!: CodeContext;
  private scope = new Scope();

  constructor(unit: A.CompilationUnit) {
    this.unit = unit;
  }

  bind(): BindResult {
    for (const i of this.unit.imports) this.addImport(i);
    const classes: ClassSymbol[] = [];
    for (const t of this.unit.types) {
      if (t.kind === 'Unsupported') {
        this.declarer.unsupported(t.construct, t.range);
        continue;
      }
      const sym = this.declarer.enter(t, '', undefined);
      this.declarer.topLevel.set(t.name, sym);
      classes.push(sym);
    }
    const where: TypeContext = { imports: this.imports };
    for (const c of classes) this.declarer.resolveHeaders(c, where);
    for (const c of classes) this.declarer.resolveMembers(c, where);
    const program: B.BProgram = { classes: [] };
    if (this.diagnostics.some(d => d.kind === 'unsupported')) return { program, diagnostics: this.diagnostics };
    const all: ClassSymbol[] = [];
    const collect = (c: ClassSymbol) => { all.push(c); for (const m of c.memberTypes.values()) collect(m); };
    classes.forEach(collect);
    for (const c of all) program.classes.push(this.bindClass(c));
    for (const c of classes) {
      const main = (c.methods.get('main') ?? []).find(m => m.isStatic && (m.arity === 0 || (m.arity === 1 && m.params[0].type.tag === 'array')));
      if (main) {
        program.entry = c;
        program.main = main;
        break;
      }
    }
    return { program, diagnostics: this.diagnostics };
  }

  private addImport(i: A.ImportDecl): void {
    const parts = i.name.parts;
    if (i.isStatic) {
      // `import static java.lang.Math.*;` or `import static java.lang.Math.max;`
      const cls = this.libraryClass(i.onDemand ? parts : parts.slice(0, -1));
      if (cls) this.staticImports.push({ cls, member: i.onDemand ? undefined : parts[parts.length - 1] });
      return;
    }
    if (i.onDemand) {
      this.imports.onDemand.push(parts.join('.'));
      return;
    }
    const cls = this.libraryClass(parts);
    if (cls) this.imports.single.set(cls.name, cls);
  }

  private readonly staticImports: { cls: ClassSymbol; member?: string }[] = [];

  /** A library class by qualified name: java.util.Map.Entry. */
  private libraryClass(parts: string[]): ClassSymbol | undefined {
    for (let i = parts.length - 1; i > 0; i--) {
      const pkg = this.lib.packages.get(parts.slice(0, i).join('.'));
      if (!pkg) continue;
      let sym = pkg.get(parts[i]);
      for (let j = i + 1; sym && j < parts.length; j++) sym = sym.memberTypes.get(parts[j]);
      return sym;
    }
    return undefined;
  }

  // ── Diagnostics ──

  private error(message: string, range: A.Range): void {
    this.diagnostics.push({ kind: 'error', message, range });
  }

  /** A construct the evaluator can't run yet, reported when (and only if) it is reached. */
  private unsupportedExpr(construct: string, range: A.Range, singular = false): B.BUnsupportedExpr {
    return { kind: 'Unsupported', construct, singular, type: ERROR, range } as B.BUnsupportedExpr;
  }

  private errorExpr(range: A.Range): B.BExpr {
    return { kind: 'Const', value: null, type: ERROR, range };
  }

  // ── Types ──

  private typeContext(): TypeContext {
    return { cls: this.ctx?.cls, method: this.ctx?.method, imports: this.imports };
  }

  private resolveType(t: A.TypeNode): JType {
    return this.declarer.resolveType(t, this.typeContext());
  }

  private get objectType(): ClassT {
    return classType(this.b.object);
  }

  private get stringType(): ClassT {
    return classType(this.b.string);
  }

  private isString(t: JType): boolean {
    return t.tag === 'class' && t.symbol === this.b.string;
  }

  /** `this`'s type inside a class: the class with its own type parameters as arguments. */
  private thisType(cls: ClassSymbol): ClassT {
    return classType(cls, cls.typeParams);
  }

  // ── Classes ──

  private bindClass(sym: ClassSymbol): B.BClass {
    const decl = sym.decl!;
    const result: B.BClass = { symbol: sym, staticInit: [], instanceInit: [], methods: [], constructors: [] };
    if (decl.kind === 'AnnotationTypeDecl') return result;
    for (const m of decl.members) {
      if (m.kind === 'FieldDecl') {
        const isStatic = sym.isInterface || m.modifiers.includes('static');
        for (const d of m.declarators) {
          const field = sym.fields.get(d.name)!;
          this.enterCode(sym, undefined, isStatic, VOID);
          if (d.init) {
            const value = this.initializer(d.init, field.type, d.range);
            if (field.isFinal) field.constant = constantOf(value);
            (isStatic ? result.staticInit : result.instanceInit).push({ kind: 'field', field, value, range: d.range });
          }
        }
      } else if (m.kind === 'Initializer') {
        this.enterCode(sym, undefined, m.isStatic, VOID);
        const body = this.block(m.body);
        (m.isStatic ? result.staticInit : result.instanceInit).push({ kind: 'block', body, range: m.range });
      }
    }
    for (const list of sym.methods.values()) for (const method of list) result.methods.push(this.bindMethod(method));
    for (const ctor of sym.constructors) result.constructors.push(this.bindMethod(ctor));
    return result;
  }

  private enterCode(cls: ClassSymbol, method: MethodSymbol | undefined, isStatic: boolean, returnType: JType): void {
    this.ctx = { cls, method, isStatic, returnType, locals: method?.locals ?? [] };
    this.scope = new Scope();
  }

  private bindMethod(method: MethodSymbol): B.BMethod {
    this.enterCode(method.owner, method, method.isStatic, method.returnType);
    const decl = method.decl;
    const params = method.params.map((p, i) => this.declareLocal(p.name, p.type, 'param', decl?.params[i]?.modifiers.includes('final') ?? false, decl?.params[i]?.range ?? method.owner.decl!.range));
    const result: B.BMethod = { symbol: method, params };
    if (!decl) return result;
    if (decl.kind === 'ConstructorDecl') {
      if (decl.explicitCall) result.explicitCall = this.explicitCall(decl.explicitCall);
      result.body = this.block(decl.body);
    } else if (decl.body) {
      result.body = this.block(decl.body);
    }
    return result;
  }

  private explicitCall(c: A.ExplicitConstructorCall): B.BMethod['explicitCall'] {
    const args = c.args.map(a => this.expr(a));
    if (c.qualifier) {
      this.error('qualified superclass constructor calls are not supported', c.range);
      return { target: c.target, args, range: c.range };
    }
    const cls = c.target === 'this' ? this.ctx.cls : this.ctx.cls.superclass?.symbol;
    if (!cls) return { target: c.target, args, range: c.range };
    const chosen = this.chooseMethod(cls.constructors, args, c.range, `constructor ${cls.name}`, c.target === 'this' ? this.thisType(cls) : this.ctx.cls.superclass);
    if (!chosen) return { target: c.target, args, range: c.range };
    return { target: c.target, ctor: chosen.method, args: chosen.args, range: c.range };
  }

  private declareLocal(name: string, type: JType, kind: LocalKind, isFinal: boolean, range: A.Range): LocalSymbol {
    const local = new LocalSymbol(name, type, kind, isFinal, range);
    if (name !== '_') {
      if (this.scope.lookup(name) && kind !== 'pattern') this.error(`variable ${name} is already defined in method ${this.ctx.method?.name ?? 'initializer'}`, range);
      this.scope.vars.set(name, local);
    }
    this.ctx.locals.push(local);
    return local;
  }

  private inScope<T>(f: () => T): T {
    const saved = this.scope;
    this.scope = new Scope(saved);
    try {
      return f();
    } finally {
      this.scope = saved;
    }
  }

  // ── Statements ──

  private block(b: A.Block): B.BBlock {
    return this.inScope(() => ({ kind: 'Block', statements: b.statements.map(s => this.stmt(s)), range: b.range }));
  }

  private stmt(s: A.Stmt): B.BStmt {
    const range = s.range;
    switch (s.kind) {
      case 'Block': return this.block(s);
      case 'LocalVarDecl': return this.localDecl(s);
      case 'LocalClassDecl': {
        const d = s.decl;
        const what = d.kind === 'InterfaceDecl' ? 'Interfaces' : d.kind === 'EnumDecl' ? 'Enums' : d.kind === 'RecordDecl' ? 'Records' : 'Classes';
        return { kind: 'Unsupported', construct: `${what} declared inside a method`, range } as B.BUnsupportedStmt;
      }
      case 'ExprStmt': return { kind: 'ExprStmt', expr: this.expr(s.expr), range };
      case 'If': return this.ifStmt(s);
      case 'While': return this.inScope(() => ({ kind: 'While', cond: this.condition(s.cond), body: this.inScope(() => this.stmt(s.body)), range }));
      case 'DoWhile': return { kind: 'DoWhile', body: this.inScope(() => this.stmt(s.body)), cond: this.inScope(() => this.condition(s.cond)), range };
      case 'For': return this.inScope(() => {
        const init: B.BStmt[] = s.init === undefined ? []
          : Array.isArray(s.init) ? s.init.map(e => ({ kind: 'ExprStmt' as const, expr: this.expr(e), range: e.range }))
          : [this.localDecl(s.init)];
        return {
          kind: 'For', init, cond: s.cond ? this.condition(s.cond) : undefined,
          update: s.update.map(e => this.expr(e)), body: this.inScope(() => this.stmt(s.body)), range,
        };
      });
      case 'ForEach': return this.forEach(s);
      case 'Labeled': return { kind: 'Labeled', label: s.label, body: this.stmt(s.body), range };
      case 'SwitchStmt': return { kind: 'SwitchStmt', switch: this.switch_(s.selector, s.body, false, range).sw, range };
      case 'Break': return { kind: 'Break', label: s.label, range };
      case 'Continue': return { kind: 'Continue', label: s.label, range };
      case 'Return': return this.returnStmt(s);
      case 'Throw': return { kind: 'Throw', value: this.throwable(s.value), range };
      case 'Yield': return { kind: 'Yield', value: this.expr(s.value), range };
      case 'Try': return this.tryStmt(s);
      case 'Synchronized': return { kind: 'Synchronized', lock: this.expr(s.lock), body: this.block(s.body), range };
      case 'Assert': return { kind: 'Assert', cond: this.condition(s.cond), message: s.message ? this.expr(s.message) : undefined, range };
      case 'Empty': return { kind: 'Empty', range };
      case 'Unsupported': return { kind: 'Unsupported', construct: s.construct, range } as B.BUnsupportedStmt;
    }
  }

  private ifStmt(s: A.If): B.BStmt {
    // A pattern in the condition (o instanceof T t) is scoped to the if; after `if (!(o instanceof T t)) return;` it stays (JLS §6.3.2).
    const outer = this.scope;
    const ifScope = new Scope(outer);
    this.scope = ifScope;
    const cond = this.condition(s.cond);
    const then = this.inScope(() => this.stmt(s.then));
    const otherwise = s.else ? this.inScope(() => this.stmt(s.else!)) : undefined;
    this.scope = outer;
    if (!s.else && isNegatedPattern(s.cond) && !canCompleteNormally(s.then)) {
      for (const [name, local] of ifScope.vars) outer.vars.set(name, local);
    }
    return { kind: 'If', cond, then, else: otherwise, range: s.range };
  }

  private localDecl(s: A.LocalVarDecl): B.BLocalDecl {
    const isFinal = s.modifiers.includes('final');
    const declarators = s.declarators.map(d => {
      let declared: JType = s.type.kind === 'VarType' ? DYNAMIC : this.resolveType(s.type);
      for (let i = 0; i < d.dims; i++) declared = arrayOf(declared);
      if (s.type.kind === 'VarType') {
        if (!d.init) this.error("cannot infer type for local variable " + d.name + "\n  (cannot use 'var' on variable without initializer)", d.range);
        if (d.init?.kind === 'ArrayInit') this.error(`cannot infer type for local variable ${d.name}\n  (array initializer needs an explicit target-type)`, d.range);
      }
      // A variable is in scope in its own initializer (where reading it is javac's "might not have been initialized").
      const local = this.declareLocal(d.name, declared, 'local', isFinal, d.range);
      let init: B.BExpr | undefined;
      if (d.init) {
        if (s.type.kind === 'VarType' && d.init.kind !== 'ArrayInit') {
          init = this.expr(d.init);
          local.type = init.type.tag === 'null' ? ERROR : init.type;
        } else {
          init = this.initializer(d.init, declared, d.range);
        }
        if (isFinal) local.constant = constantOf(init);
      }
      return { local, init, range: d.range };
    });
    return { kind: 'LocalDecl', declarators, range: s.range };
  }

  /** A variable's initializer: an array initializer, or an expression converted to the variable's type. */
  private initializer(init: A.Expr | A.ArrayInit, type: JType, range: A.Range): B.BExpr {
    if (init.kind === 'ArrayInit') return this.arrayLiteral(init, type, range);
    return this.assignConvert(this.expr(init, type), type, init.range, 'assignment');
  }

  private arrayLiteral(init: A.ArrayInit, type: JType, range: A.Range): B.BExpr {
    if (type.tag !== 'array') {
      if (!isLoose(type)) this.error(`illegal initializer for ${typeName(type)}`, range);
      return this.errorExpr(init.range);
    }
    const elements = init.elements.map(e => (e.kind === 'ArrayInit' ? this.arrayLiteral(e, type.component, e.range) : this.assignConvert(this.expr(e, type.component), type.component, e.range, 'assignment')));
    return { kind: 'ArrayLiteral', type, elements, range: init.range };
  }

  private forEach(s: A.ForEach): B.BStmt {
    return this.inScope(() => {
      const iterable = this.expr(s.iterable);
      const t = iterable.type;
      let element: JType;
      let overArray = false;
      if (t.tag === 'array') {
        element = t.component;
        overArray = true;
      } else if (isLoose(t)) {
        element = DYNAMIC;
      } else {
        const it = asSuper(t, this.lib.byName('Iterable')!);
        if (!it) {
          this.error(`for-each not applicable to expression type\n  required: array or java.lang.Iterable\n  found:    ${typeName(t)}`, s.iterable.range);
          element = ERROR;
        } else {
          if (t.tag === 'class' && !t.symbol.isLibrary) {
            return { kind: 'Unsupported', construct: 'For-each loops over your own Iterable classes', range: s.range } as B.BUnsupportedStmt;
          }
          element = it.args.length ? readType(it.args[0], this.objectType) : this.objectType;
        }
      }
      const d = s.variable.declarators[0];
      let declared: JType = s.variable.type.kind === 'VarType' ? element : this.resolveType(s.variable.type);
      for (let i = 0; i < d.dims; i++) declared = arrayOf(declared);
      const source = new LocalSymbol('$element', element, 'foreach', false, s.iterable.range);
      const conv = this.assignConvert({ kind: 'Local', local: source, type: element, range: d.range }, declared, d.range, 'assignment');
      const local = this.declareLocal(d.name, declared, 'foreach', s.variable.modifiers.includes('final'), d.range);
      const body = this.inScope(() => this.stmt(s.body));
      return { kind: 'ForEach', local, iterable, overArray, element: conv, elementSource: source, body, range: s.range };
    });
  }

  private returnStmt(s: A.Return): B.BStmt {
    const expected = this.ctx.returnType;
    if (!s.value) {
      if (expected.tag !== 'void' && !isLoose(expected)) this.error('missing return value', s.range);
      return { kind: 'Return', range: s.range };
    }
    if (expected.tag === 'void') {
      this.error('incompatible types: unexpected return value', s.value.range);
      return { kind: 'Return', value: this.expr(s.value), range: s.range };
    }
    return { kind: 'Return', value: this.assignConvert(this.expr(s.value, expected), expected, s.value.range, 'return'), range: s.range };
  }

  private throwable(e: A.Expr): B.BExpr {
    const value = this.expr(e);
    const throwable = this.lib.byName('Throwable')!;
    if (!isLoose(value.type) && value.type.tag !== 'null' && !isSubtype(value.type, classType(throwable), this.b)) {
      this.error(`incompatible types: ${typeName(value.type)} cannot be converted to Throwable`, e.range);
    }
    return value;
  }

  private tryStmt(s: A.Try): B.BStmt {
    return this.inScope(() => {
      const resources = s.resources.map(r => ('declarators' in r ? this.localDecl(r) : this.expr(r)));
      const block = this.block(s.block);
      const catches = s.catches.map(c => this.inScope(() => {
        const types = c.types.map(t => this.resolveType(t)).filter((t): t is ClassT => t.tag === 'class');
        const caught = types.length === 1 ? types[0] : this.lub(types);
        const local = this.declareLocal(c.name, caught, 'catch', c.modifiers.includes('final'), c.range);
        return { types: types.map(t => t.symbol), local, body: this.block(c.body), range: c.range };
      }));
      return { kind: 'Try', resources, block, catches, finally: s.finally ? this.block(s.finally) : undefined, range: s.range };
    });
  }

  private switch_(selectorNode: A.Expr, body: A.SwitchBody, isExpression: boolean, range: A.Range): { sw: B.BSwitch; type: JType } {
    return this.inScope(() => {
      let selector = this.expr(selectorNode);
      const st = selector.type;
      const labels = body.kind === 'rules' ? body.rules.map(r => r.label) : body.groups.map(g => g.label);
      const patterns = labels.some(l => l.patterns.length > 0 || l.isNull);
      let selectorKind: B.BSwitch['selectorKind'];
      const unboxed = primitiveOf(st);
      if (this.isString(st)) selectorKind = 'string';
      else if (!patterns && unboxed && ['int', 'char', 'short', 'byte'].includes(unboxed.name)) {
        selectorKind = 'number';
        selector = this.convertTo(selector, unboxed, 'unbox');
      } else if (st.tag === 'class' && st.symbol.kind === 'enum') selectorKind = 'enum';
      else if (isLoose(st) && !patterns) selectorKind = 'number';
      else selectorKind = 'pattern';
      const caseOf = (label: A.SwitchLabel): { labels: B.BCaseLabel[]; guard?: B.BExpr } => {
        const out: B.BCaseLabel[] = [];
        if (label.isDefault) out.push({ kind: 'default' });
        if (label.isNull) out.push({ kind: 'null' });
        if (label.nullDefault) out.push({ kind: 'default' });
        for (const c of label.constants) {
          if (selectorKind === 'enum' && c.kind === 'Name' && c.parts.length === 1) {
            out.push({ kind: 'enum', name: c.parts[0].name });
            continue;
          }
          const bound = this.expr(c, selectorKind === 'number' && unboxed ? unboxed : undefined);
          const value = constantOf(bound);
          if (value === undefined) this.error('constant expression required', c.range);
          else out.push({ kind: 'constant', value });
        }
        for (const p of label.patterns) {
          if (p.kind === 'RecordPattern') {
            out.push({ kind: 'unsupported', construct: 'Record patterns' });
            continue;
          }
          const type = p.type.kind === 'VarType' ? st : this.resolveType(p.type);
          const binding = this.declareLocal(p.name, type, 'pattern', false, p.range);
          out.push({ kind: 'pattern', type, binding });
        }
        return { labels: out, guard: label.guard ? this.condition(label.guard) : undefined };
      };
      const cases: B.BSwitchCase[] = [];
      const values: B.BExpr[] = [];
      if (body.kind === 'rules') {
        for (const r of body.rules) {
          this.inScope(() => {
            const { labels: ls, guard } = caseOf(r.label);
            if (r.body.kind === 'Block') {
              cases.push({ labels: ls, guard, body: [this.block(r.body)], range: r.range });
            } else if (r.body.kind === 'Throw') {
              cases.push({ labels: ls, guard, body: [{ kind: 'Throw', value: this.throwable(r.body.value), range: r.body.range }], range: r.range });
            } else {
              const value = this.expr(r.body);
              if (isExpression) {
                values.push(value);
                cases.push({ labels: ls, guard, body: [], value, range: r.range });
              } else {
                cases.push({ labels: ls, guard, body: [{ kind: 'ExprStmt', expr: value, range: r.body.range }], range: r.range });
              }
            }
          });
        }
      } else {
        // A switch block's groups share one scope.
        for (const g of body.groups) {
          const { labels: ls, guard } = caseOf(g.label);
          cases.push({ labels: ls, guard, body: g.statements.map(st2 => this.stmt(st2)), range: g.range });
        }
      }
      // A switch expression's type: its values', as for ?: (yields are typed when bound).
      let type: JType = VOID;
      if (isExpression) {
        const yielded = collectYields(cases);
        const all = [...values, ...yielded];
        type = all.length ? all.slice(1).reduce<JType>((t, v) => this.conditionalType(t, v.type, undefined), all[0].type) : ERROR;
        for (const c of cases) if (c.value) c.value = this.assignConvert(c.value, type, c.value.range, 'assignment');
        convertYields(cases, v => this.assignConvert(v, type, v.range, 'assignment'));
      }
      return { sw: { selector, selectorKind, arrow: body.kind === 'rules', cases, range }, type };
    });
  }


  // ── Expressions ──

  /** A boolean condition (a Boolean is unboxed). */
  private condition(e: A.Expr): B.BExpr {
    const bound = this.expr(e, BOOLEAN);
    return this.assignConvert(bound, BOOLEAN, e.range, 'condition');
  }

  /** Bind an expression; `expected` is the type its context wants (for `new ArrayList<>()` and generic results). */
  expr(e: A.Expr, expected?: JType): B.BExpr {
    const range = e.range;
    switch (e.kind) {
      case 'Literal': return this.literal(e);
      case 'Name': {
        const m = this.name(e);
        if (m.kind === 'expr') return m.expr;
        if (m.kind !== 'error') this.error(`cannot find symbol\n  symbol:   variable ${e.parts[e.parts.length - 1].name}`, range);
        return this.errorExpr(range);
      }
      case 'This':
        if (e.qualifier) return this.unsupportedExpr('Qualified this (Outer.this)', range, true);
        if (this.ctx.isStatic) {
          this.error('non-static variable this cannot be referenced from a static context', range);
          return this.errorExpr(range);
        }
        return { kind: 'This', cls: this.ctx.cls, type: this.thisType(this.ctx.cls), range };
      case 'Super': return this.unsupportedExpr("Members reached through 'super' (super.name)", range);
      case 'Parens': return this.expr(e.expr, expected);
      case 'FieldAccess': return this.fieldAccess(e);
      case 'ArrayAccess': {
        const array = this.expr(e.array);
        const index = this.index(e.index);
        if (array.type.tag !== 'array') {
          if (!isLoose(array.type)) this.error(`array required, but ${typeName(array.type)} found`, e.array.range);
          return { kind: 'ArrayElement', array, index, type: isLoose(array.type) ? DYNAMIC : ERROR, range };
        }
        return { kind: 'ArrayElement', array, index, type: array.type.component, range };
      }
      case 'MethodCall': return this.call(e, expected);
      case 'NewObject': return this.newObject(e, expected);
      case 'NewArray': return this.newArray(e);
      case 'ArrayInit':
        if (expected && expected.tag === 'array') return this.arrayLiteral(e, expected, range);
        this.error('illegal start of expression', range);
        return this.errorExpr(range);
      case 'Unary': return this.unary(e);
      case 'IncDec': return this.incDec(e);
      case 'Binary': return this.binary(e);
      case 'Assign': return this.assign(e);
      case 'Conditional': return this.conditional(e, expected);
      case 'Cast': return this.cast(e);
      case 'InstanceOf': return this.instanceOf(e);
      case 'Lambda': return this.unsupportedExpr('Lambda expressions', range);
      case 'MethodRef': return this.unsupportedExpr('Method references (::)', range);
      case 'ClassLiteral': return this.unsupportedExpr('Class literals (.class)', range);
      case 'SwitchExpr': {
        const { sw, type } = this.switch_(e.selector, e.body, true, range);
        return { kind: 'SwitchExpr', switch: sw, type, range };
      }
      case 'Unsupported': return this.unsupportedExpr(e.construct === 'string templates' ? 'String templates' : e.construct, range);
    }
  }

  private literal(e: A.Literal): B.BExpr {
    const range = e.range;
    switch (e.type) {
      case 'int': case 'long': {
        const parsed = integerLiteralValue(e.text);
        if (!parsed) {
          this.error(`integer number too large`, range);
          return this.errorExpr(range);
        }
        return { kind: 'Const', value: parsed.value, type: parsed.type === 'int' ? INT : LONG, range };
      }
      case 'float': case 'double': {
        if (/^0[xX]/.test(e.text)) return this.unsupportedExpr('Hexadecimal floating-point literals', range);
        const parsed = floatingLiteralValue(e.text);
        if (!parsed) {
          // Out of range: infinite as a float or double, or a nonzero literal that rounds to zero.
          const large = Math.abs(Number(e.text.replace(/_/g, '').replace(/[fFdD]$/, ''))) >= 1;
          this.error(`floating-point number too ${large ? 'large' : 'small'}`, range);
          return this.errorExpr(range);
        }
        return { kind: 'Const', value: parsed.value, type: primitive(parsed.type), range };
      }
      case 'boolean': return { kind: 'Const', value: e.text === 'true', type: BOOLEAN, range };
      case 'char': return { kind: 'Const', value: charLiteralValue(e.text), type: CHAR, range };
      case 'String': return { kind: 'Const', value: e.textBlock ? textBlockValue(e.text) : stringLiteralValue(e.text), type: this.stringType, range };
      case 'null': return { kind: 'Const', value: null, type: NULL, range };
    }
  }

  private index(e: A.Expr): B.BExpr {
    return this.assignConvert(this.expr(e), INT, e.range, 'index');
  }

  // ── Names ──

  /** Classify a (possibly dotted) name, JLS §6.5.2: left to right, each part a variable, a field, a type or a package. */
  private name(n: A.Name): NameMeaning {
    let meaning = this.simpleName(n.parts[0]);
    for (let i = 1; i < n.parts.length && meaning.kind !== 'error'; i++) {
      const part = n.parts[i];
      const range = { ...n.range, end: part.range.end, endLine: part.range.endLine, endColumn: part.range.endColumn };
      meaning = this.memberOf(meaning, part, range);
    }
    return meaning;
  }

  private simpleName(part: A.NamePart): NameMeaning {
    const range = part.range;
    const local = this.scope.lookup(part.name);
    if (local) return { kind: 'expr', expr: { kind: 'Local', local, type: local.type, range } };
    const field = this.fieldInScope(part.name, range);
    if (field) return field;
    for (const imp of this.staticImports) {
      if (imp.member && imp.member !== part.name) continue;
      const f = imp.cls.fields.get(part.name);
      if (f?.isStatic) return { kind: 'expr', expr: { kind: 'StaticField', field: f, type: f.type, range } };
    }
    const type = this.declarer.findType(part.name, this.typeContext());
    if (type) return { kind: 'type', type: classType(type) };
    if (PACKAGE_PREFIXES.has(part.name)) return { kind: 'package', name: part.name };
    this.error(`cannot find symbol\n  symbol:   variable ${part.name}`, range);
    return { kind: 'error' };
  }

  /** A field named by a simple name: of this class (or a supertype), else of an enclosing class. */
  private fieldInScope(name: string, range: A.Range): NameMeaning | undefined {
    for (let c: ClassSymbol | undefined = this.ctx.cls; c; c = c.outer) {
      const field = findField(c, name);
      if (!field) continue;
      if (field.isStatic) return { kind: 'expr', expr: { kind: 'StaticField', field, type: field.type, range } };
      if (c !== this.ctx.cls) {
        return { kind: 'expr', expr: this.unsupportedExpr(`Inner classes using a field of the enclosing object ('${name}')`, range) };
      }
      if (this.ctx.isStatic) {
        this.error(`non-static variable ${name} cannot be referenced from a static context`, range);
        return { kind: 'error' };
      }
      const self: B.BThis = { kind: 'This', cls: c, type: this.thisType(c), range };
      return { kind: 'expr', expr: { kind: 'Field', target: self, field, type: this.memberType(self.type, field.owner, field.type), range } };
    }
    return undefined;
  }

  /** `part` as a member of what came before it in a name. */
  private memberOf(prefix: NameMeaning, part: A.NamePart, range: A.Range): NameMeaning {
    if (prefix.kind === 'package') {
      const cls = this.lib.packages.get(prefix.name)?.get(part.name);
      if (cls) return { kind: 'type', type: classType(cls) };
      return { kind: 'package', name: `${prefix.name}.${part.name}` };
    }
    if (prefix.kind === 'type') {
      const field = findField(prefix.type.symbol, part.name);
      if (field) {
        if (!field.isStatic) {
          this.error(`non-static variable ${part.name} cannot be referenced from a static context`, range);
          return { kind: 'error' };
        }
        return { kind: 'expr', expr: { kind: 'StaticField', field, type: field.type, range } };
      }
      const member = this.declarer.memberType(prefix.type.symbol, part.name);
      if (member) return { kind: 'type', type: classType(member) };
      this.error(`cannot find symbol\n  symbol:   variable ${part.name}\n  location: class ${prefix.type.symbol.name}`, range);
      return { kind: 'error' };
    }
    if (prefix.kind === 'expr') return { kind: 'expr', expr: this.fieldOfValue(prefix.expr, part.name, range, part.range) };
    return prefix;
  }

  /** `value.name`: an array's length, or a field of the value's class. */
  private fieldOfValue(target: B.BExpr, name: string, range: A.Range, nameRange: A.Range): B.BExpr {
    const t = target.type;
    if (t.tag === 'array') {
      if (name === 'length') return { kind: 'ArrayLength', array: target, type: INT, range };
    } else if (t.tag === 'class' || t.tag === 'typevar') {
      const cls = t.tag === 'class' ? t.symbol : (erasure(t) as ClassT).symbol;
      const field = findField(cls, name);
      if (field) {
        if (field.isStatic) return { kind: 'StaticField', field, type: field.type, range };
        return { kind: 'Field', target, field, type: this.memberType(t, field.owner, field.type), range };
      }
    } else if (isLoose(t)) {
      return this.unsupportedExpr('Fields of a value whose type JavaTutor doesn\'t know', range);
    }
    this.error(`cannot find symbol\n  symbol:   variable ${name}\n  location: ${t.tag === 'array' ? 'array' : `class ${typeName(t)}`}`, nameRange);
    return this.errorExpr(range);
  }

  /** A member's declared type as seen through a receiver type (type arguments substituted). */
  private memberType(receiver: JType, owner: ClassSymbol, declared: JType): JType {
    const sup = asSuper(receiver, owner);
    if (!sup) return declared;
    if (sup.args.length === 0 && owner.typeParams.length > 0) return erasure(declared);
    return substitute(declared, typeArgMap(sup));
  }

  private fieldAccess(e: A.FieldAccess): B.BExpr {
    if (e.target.kind === 'Super') return this.unsupportedExpr("Members reached through 'super' (super.name)", e.range);
    if (e.target.kind === 'This' && e.target.qualifier) return this.unsupportedExpr('Qualified this (Outer.this)', e.target.range, true);
    return this.fieldOfValue(this.expr(e.target), e.name, e.range, e.nameRange);
  }

  // ── Method calls ──

  private call(e: A.MethodCall, expected?: JType): B.BExpr {
    const range = e.range;
    const options: CallOptions = { typeArgs: e.typeArgs?.map(t => this.resolveType(t)) };
    if (e.target?.kind === 'Super') return this.unsupportedExpr("Members reached through 'super' (super.name)", e.target.range);
    if (e.target?.kind === 'This' && e.target.qualifier) return this.unsupportedExpr('Qualified this (Outer.this)', e.target.range, true);
    const args = e.args.map(a => this.expr(a));

    // Unqualified: the innermost class (this one, then enclosing ones) with a method of that name.
    if (!e.target) {
      for (let c: ClassSymbol | undefined = this.ctx.cls; c; c = c.outer) {
        const candidates = methodsNamed(c, e.name);
        if (!candidates.length) continue;
        const receiverType = this.thisType(c);
        const chosen = this.chooseMethod(candidates, args, e.nameRange, e.name, receiverType, expected, options);
        if (!chosen) return this.errorExpr(range);
        const { method } = chosen;
        if (method.isStatic) return this.callNode(method, undefined, chosen, range);
        if (c !== this.ctx.cls) return this.unsupportedExpr(`Inner classes calling a method of the enclosing object ('${e.name}()')`, range);
        if (this.ctx.isStatic) {
          this.error(`non-static method ${method.signature} cannot be referenced from a static context`, e.nameRange);
          return this.errorExpr(range);
        }
        const self: B.BThis = { kind: 'This', cls: c, type: receiverType, range: e.nameRange };
        return this.callNode(method, self, chosen, range);
      }
      for (const imp of this.staticImports) {
        if (imp.member && imp.member !== e.name) continue;
        const candidates = methodsNamed(imp.cls, e.name).filter(m => m.isStatic);
        if (candidates.length) {
          const chosen = this.chooseMethod(candidates, args, e.nameRange, e.name, classType(imp.cls), expected);
          return chosen ? this.callNode(chosen.method, undefined, chosen, range) : this.errorExpr(range);
        }
      }
      this.error(`cannot find symbol\n  symbol:   method ${e.name}(${args.map(a => typeName(a.type)).join(',')})\n  location: class ${this.ctx.cls.name}`, e.nameRange);
      return this.errorExpr(range);
    }

    // On a type (a static method) or on a value.
    let receiver: B.BExpr | undefined;
    let receiverType: JType;
    let staticOnly = false;
    if (e.target.kind === 'Name') {
      const unsupported = this.unsupportedLibrary(e.target);
      if (unsupported) return unsupported;
      const m = this.name(e.target);
      if (m.kind === 'error') return this.errorExpr(range);
      if (m.kind === 'package') {
        this.error(`cannot find symbol\n  symbol:   class ${m.name.split('.').pop()}`, e.target.range);
        return this.errorExpr(range);
      }
      if (m.kind === 'type') {
        receiverType = m.type;
        staticOnly = true;
      } else {
        receiver = m.expr;
        receiverType = m.expr.type;
      }
    } else {
      receiver = this.expr(e.target);
      receiverType = receiver.type;
    }

    if (isLoose(receiverType)) return { kind: 'DynamicCall', name: e.name, target: receiver, args, type: DYNAMIC, range };
    const cls = this.classOf(receiverType);
    if (!cls) {
      this.error(`${typeName(receiverType)} cannot be dereferenced`, e.target.range);
      return this.errorExpr(range);
    }
    const candidates = methodsNamed(cls, e.name, receiverType.tag === 'array' ? this.b.object : undefined);
    if (!candidates.length) {
      if (cls.isLibrary) return { kind: 'DynamicCall', owner: cls, name: e.name, target: receiver, args, type: DYNAMIC, range };
      this.error(`cannot find symbol\n  symbol:   method ${e.name}(${args.map(a => typeName(a.type)).join(',')})\n  location: class ${cls.name}`, e.nameRange);
      return this.errorExpr(range);
    }
    const chosen = this.chooseMethod(candidates, args, e.nameRange, e.name, receiverType, expected, options);
    if (!chosen) return this.errorExpr(range);
    if (staticOnly && !chosen.method.isStatic) {
      this.error(`non-static method ${chosen.method.signature} cannot be referenced from a static context`, e.nameRange);
      return this.errorExpr(range);
    }
    return this.callNode(chosen.method, chosen.method.isStatic ? undefined : receiver, chosen, range);
  }

  private callNode(method: MethodSymbol, target: B.BExpr | undefined, chosen: Chosen, range: A.Range): B.BCall {
    const dispatch: B.BCall['dispatch'] = method.isStatic ? 'static' : method.modifiers.has('private') ? 'special' : 'virtual';
    return { kind: 'Call', method, dispatch, target, args: chosen.args, type: chosen.returnType, range };
  }

  /** The class whose members a value of this type has (an array's are Object's). */
  private classOf(t: JType): ClassSymbol | undefined {
    if (t.tag === 'class') return t.symbol;
    if (t.tag === 'typevar') return this.classOf(t.bound);
    if (t.tag === 'array') return this.b.object;
    return undefined;
  }

  // ── Overload resolution (JLS §15.12.2) ──

  /**
   * The method among `candidates` that the arguments select: those
   * applicable by strict invocation (no boxing, fixed arity), else by loose
   * invocation (boxing), else by variable arity; then the most specific.
   */
  private chooseMethod(candidates: MethodSymbol[], args: B.BExpr[], range: A.Range, what: string, receiver?: JType, expected?: JType, options: CallOptions = {}): Chosen | undefined {
    const argTypes = args.map(a => a.type);
    for (const phase of ['strict', 'loose', 'varargs'] as const) {
      const applicable: Applicable[] = [];
      for (const m of candidates) {
        const a = this.applicable(m, argTypes, phase, receiver, expected, options);
        if (a) applicable.push(a);
      }
      if (!applicable.length) continue;
      const best = this.mostSpecific(applicable, phase);
      if (best.length > 1 && !best.every(x => x.method.owner.isLibrary)) {
        const [a, b] = best;
        this.error(`reference to ${what} is ambiguous\n  both method ${a.method.signature} in ${a.method.owner.name} and method ${b.method.signature} in ${b.method.owner.name} match`, range);
      }
      return this.finishCall(best[0], args, phase);
    }
    const first = candidates[0];
    const found = argTypes.map(typeName).join(',');
    if (candidates.length === 1) {
      const required = first.params.map(p => typeName(p.type)).join(',') || 'no arguments';
      const kind = first.isConstructor ? `constructor ${first.owner.name} in class ${first.owner.name}` : `method ${first.name} in class ${first.owner.name}`;
      this.error(`${kind} cannot be applied to given types;\n  required: ${required}\n  found:    ${found || 'no arguments'}`, range);
    } else {
      this.error(`no suitable ${first.isConstructor ? 'constructor' : 'method'} found for ${first.isConstructor ? first.owner.name : first.name}(${found})`, range);
    }
    return undefined;
  }

  /** Whether a method is applicable in a phase, with its parameter types after inferring its type arguments. */
  private applicable(m: MethodSymbol, argTypes: JType[], phase: 'strict' | 'loose' | 'varargs', receiver: JType | undefined, expected: JType | undefined, options: CallOptions): Applicable | undefined {
    const n = m.params.length;
    if (phase === 'varargs' ? !m.varargs || argTypes.length < n - 1 : argTypes.length !== n) return undefined;
    // Parameter types seen from the receiver (List<String>'s add takes a String; a raw List's, Object), then
    // with the method's type arguments, given or inferred. A diamond infers the class's type arguments too.
    const raw = receiver !== undefined && !m.isStatic && !options.diamond && receiverIsRaw(receiver, m.owner);
    const classMap = receiver && !m.isStatic && !options.diamond ? receiverMap(receiver, m.owner) : new Map<number, JType>();
    const viewed = m.params.map(p => (raw ? erasure(p.type) : substitute(p.type, classMap)));
    const vars = options.diamond ? [...m.typeParams, ...m.owner.typeParams] : m.typeParams;
    let inferred: Map<number, JType>;
    if (options.typeArgs && options.typeArgs.length === m.typeParams.length) {
      inferred = new Map(m.typeParams.map((v, i) => [v.id, options.typeArgs![i]]));
    } else {
      inferred = this.inferTypeArgs(vars, viewed, argTypes, phase, substitute(m.returnType, classMap), expected);
    }
    const params = viewed.map(p => substitute(p, inferred));
    const loose = phase !== 'strict';
    for (let i = 0; i < argTypes.length; i++) {
      let pt: JType;
      if (phase === 'varargs' && i >= n - 1) {
        const last = params[n - 1];
        pt = last.tag === 'array' ? last.component : last;
      } else {
        pt = params[i];
      }
      if (!invocable(argTypes[i], pt, loose, this.b)) return undefined;
    }
    let returnType = substitute(substitute(m.returnType, classMap), inferred);
    if (raw) returnType = erasure(returnType);
    // A diamond whose arguments say nothing about the class's type arguments stays raw (it converts to any parameterization).
    const informed = options.diamond && m.owner.typeParams.some(v => !this.lastOpen.has(v.id));
    const classArgs = informed ? m.owner.typeParams.map(v => inferred.get(v.id) ?? erasure(v.bound)) : undefined;
    return { method: m, params, returnType, classArgs };
  }

  /** Infer a generic method's type arguments from its arguments (and, failing that, the expected type), by matching types. */
  /**
   * Infer type arguments by matching parameter types against argument types
   * (and, for what that leaves open, the result type against the expected
   * type): an exact match inside a type argument (List<T> against
   * List<String>) fixes T; an argument for T or `? extends T` is a lower
   * bound, one for `? super T` an upper bound.
   */
  private inferTypeArgs(vars: TypeVarT[], params: JType[], argTypes: JType[], phase: string, returnType: JType, expected?: JType): Map<number, JType> {
    const map = new Map<number, JType>();
    if (!vars.length) return map;
    const ids = new Set(vars.map(v => v.id));
    const bounds = new Map<number, { eq: JType[]; lower: JType[]; upper: JType[] }>();
    const add = (id: number, t: JType, how: 'eq' | 'lower' | 'upper') => {
      if (t.tag === 'null' || isLoose(t) || t.tag === 'wildcard') return;
      const boxed = t.tag === 'primitive' ? classType(this.b.box(t.name)) : t;
      const entry = bounds.get(id) ?? bounds.set(id, { eq: [], lower: [], upper: [] }).get(id)!;
      entry[how].push(boxed);
    };
    const match = (p: JType, a: JType, how: 'eq' | 'lower' | 'upper'): void => {
      if (p.tag === 'typevar' && ids.has(p.id)) return add(p.id, a, how);
      if (p.tag === 'wildcard' && p.bound) return match(p.bound, a, p.kind === 'super' ? 'upper' : 'lower');
      if (p.tag === 'array' && a.tag === 'array') return match(p.component, a.component, how);
      if (p.tag === 'class' && p.args.length) {
        const boxedArg = a.tag === 'primitive' ? classType(this.b.box(a.name)) : a;
        const sup = how === 'upper' ? undefined : asSuper(boxedArg, p.symbol);
        if (sup && sup.args.length === p.args.length) {
          p.args.forEach((pa, i) => {
            const aa = sup.args[i];
            if (aa.tag === 'wildcard') { if (aa.bound) match(pa, aa.bound, aa.kind === 'super' ? 'upper' : 'lower'); }
            else match(pa, aa, pa.tag === 'wildcard' ? (pa.kind === 'super' ? 'upper' : 'lower') : 'eq');
          });
        }
      }
    };
    argTypes.forEach((a, i) => {
      const n = params.length;
      if (phase === 'varargs' && i >= n - 1 && params[n - 1].tag === 'array') match((params[n - 1] as ArrayT).component, a, 'lower');
      else if (i < n) match(params[i], a, 'lower');
    });
    if (expected && !isLoose(expected) && expected.tag !== 'void') {
      // `List<String> xs = Collections.emptyList()`: what the arguments leave open comes from the target.
      const open = (id: number) => !bounds.has(id);
      const r = returnType;
      if (r.tag === 'typevar' && ids.has(r.id) && open(r.id)) add(r.id, expected, 'upper');
      else if (r.tag === 'class' && expected.tag === 'class') {
        const target = asSuper(classType(r.symbol, r.symbol.typeParams), expected.symbol);
        if (target && expected.args.length === target.args.length) {
          target.args.forEach((ta, i) => {
            const idx = r.symbol.typeParams.findIndex(tp => ta.tag === 'typevar' && tp.id === ta.id);
            const rarg = idx >= 0 ? r.args[idx] : undefined;
            if (rarg?.tag === 'typevar' && ids.has(rarg.id) && open(rarg.id)) add(rarg.id, readType(expected.args[i], this.objectType), 'eq');
          });
        }
      }
    }
    this.lastOpen = new Set(vars.filter(v => !bounds.has(v.id)).map(v => v.id));
    for (const v of vars) {
      const b = bounds.get(v.id);
      if (b?.eq.length) map.set(v.id, b.eq[0]);
      else if (b?.lower.length) map.set(v.id, this.lub(b.lower));
      else if (b?.upper.length) map.set(v.id, b.upper[0]);
      else map.set(v.id, erasure(v.bound));
    }
    return map;
  }

  /** The most specific of the applicable methods (JLS §15.12.2.5): each of its parameter types is a subtype of the others'. */
  private mostSpecific(list: Applicable[], phase: string): Applicable[] {
    const moreSpecific = (a: Applicable, b: Applicable): boolean => {
      const n = Math.max(a.params.length, b.params.length);
      for (let i = 0; i < n; i++) {
        const pa = paramAt(a, i, phase), pb = paramAt(b, i, phase);
        if (!pa || !pb) continue;
        if (isLoose(pa) || isLoose(pb)) continue;
        if (!isSubtype(pa, pb, this.b) && !(pa.tag === 'primitive' && pb.tag === 'primitive' && widensTo(pa, pb))) return false;
      }
      return true;
    };
    const maximal = list.filter(a => list.every(b => a === b || moreSpecific(a, b)));
    if (maximal.length) {
      // Of methods with the same signature (an override and the method it overrides), the one in the subclass.
      return dedupeBySignature(maximal);
    }
    return list;
  }

  /** The chosen method's arguments, converted to its parameter types (variable-arity arguments packed into an array). */
  private finishCall(a: Applicable, args: B.BExpr[], phase: string): Chosen {
    const n = a.params.length;
    const converted: B.BExpr[] = [];
    const fixed = phase === 'varargs' ? n - 1 : n;
    for (let i = 0; i < fixed; i++) converted.push(this.invocationConvert(args[i], a.params[i]));
    if (phase === 'varargs') {
      const arrayType = a.params[n - 1] as ArrayT;
      const rest = args.slice(n - 1).map(x => this.invocationConvert(x, arrayType.component));
      const start = rest[0]?.range ?? args[args.length - 1]?.range;
      const range = start ? { ...start, end: rest[rest.length - 1]?.range.end ?? start.end } : (args[0]?.range ?? emptyRange());
      converted.push({ kind: 'ArrayLiteral', type: arrayType, elements: rest, range });
    }
    return { method: a.method, args: converted, returnType: a.returnType, classArgs: a.classArgs };
  }

  /** A library class JavaTutor knows of but doesn't have (streams, threads, …), used through a name like Collectors.toList(). */
  /** The type variables the last inference found nothing about. */
  private lastOpen = new Set<number>();

  private unsupportedLibrary(n: A.Name): B.BExpr | undefined {
    const first = n.parts[0].name;
    if (!UNSUPPORTED_LIBRARY.has(first) || this.scope.lookup(first) || this.declarer.findType(first, this.typeContext())) return undefined;
    return this.unsupportedExpr(`The ${first} class`, n.parts[0].range, true);
  }

  // ── Object creation ──

  private newObject(e: A.NewObject, expected?: JType): B.BExpr {
    const range = e.range;
    if (e.body) return this.unsupportedExpr('Anonymous classes', range);
    if (e.outer) return this.unsupportedExpr('Creating an inner class through an object (outer.new Inner())', range, true);
    const args = e.args.map(a => this.expr(a));
    const resolved = this.declarer.resolveType(e.type, this.typeContext());
    if (resolved.tag !== 'class') {
      // A class JavaTutor's library doesn't have.
      if (resolved.tag === 'error' || resolved.tag === 'dynamic') {
        if (resolved.tag === 'error') this.diagnostics.pop();
        return this.unsupportedExpr(`The ${e.type.parts[e.type.parts.length - 1].name} class`, range, true);
      }
      return this.errorExpr(range);
    }
    let type = resolved;
    const cls = type.symbol;
    if (cls.isAbstract) {
      this.error(`${cls.name} is abstract; cannot be instantiated`, e.type.range);
      return this.errorExpr(range);
    }
    if (cls.isLibrary && !cls.constructors.length) return this.unsupportedExpr(`The ${cls.name} class`, range, true);
    let diamond = false;
    if (e.diamond) {
      type = this.diamond(cls, expected);
      diamond = type.args.length === 0 && cls.typeParams.length > 0;
    }
    const chosen = this.chooseMethod(cls.constructors, args, e.type.range, `constructor ${cls.name}`, type, undefined, { diamond });
    if (!chosen) return this.errorExpr(range);
    if (diamond && chosen.classArgs) type = classType(cls, chosen.classArgs);
    return { kind: 'New', cls, ctor: chosen.method, args: chosen.args, type, range };
  }

  /** `new ArrayList<>()`: the type arguments the target type implies, else none (raw). */
  private diamond(cls: ClassSymbol, expected?: JType): ClassT {
    if (!expected || expected.tag !== 'class' || !cls.typeParams.length) return classType(cls);
    const generic = asSuper(classType(cls, cls.typeParams), expected.symbol);
    if (!generic || generic.args.length !== expected.args.length) return classType(cls);
    const args = cls.typeParams.map(tp => {
      const i = generic.args.findIndex(a => a.tag === 'typevar' && a.id === tp.id);
      return i >= 0 ? readType(expected.args[i], this.objectType) : this.objectType;
    });
    return classType(cls, args);
  }

  private newArray(e: A.NewArray): B.BExpr {
    let type: JType = this.resolveType(e.elementType);
    const dims = e.dimExprs.length + e.extraDims;
    for (let i = 0; i < dims; i++) type = arrayOf(type);
    if (type.tag !== 'array') return this.errorExpr(e.range);
    if (e.init) return this.arrayLiteral(e.init, type, e.range);
    return { kind: 'NewArray', type, dims: e.dimExprs.map(d => this.index(d)), range: e.range };
  }

  // ── Operators ──

  private unary(e: A.Unary): B.BExpr {
    const operand = this.expr(e.operand);
    const range = e.range;
    if (e.op === '!') {
      const v = this.assignConvert(operand, BOOLEAN, e.operand.range, 'operand', `bad operand type ${typeName(operand.type)} for unary operator '!'`);
      return this.fold({ kind: 'Unary', op: '!', operand: v, type: BOOLEAN, range });
    }
    if (isLoose(operand.type)) return { kind: 'Unary', op: e.op, operand, type: DYNAMIC, range };
    const p = primitiveOf(operand.type);
    if (!p || p.name === 'boolean' || (e.op === '~' && !isIntegral(p))) {
      this.error(`bad operand type ${typeName(operand.type)} for unary operator '${e.op}'`, range);
      return this.errorExpr(range);
    }
    const promoted = unaryPromote(p);
    return this.fold({ kind: 'Unary', op: e.op, operand: this.convertTo(this.unbox(operand), promoted, 'widen'), type: promoted, range });
  }

  private incDec(e: A.IncDec): B.BExpr {
    const target = this.expr(e.operand);
    if (!isLValue(target)) {
      if (target.type.tag !== 'error') this.error(`unexpected type\n  required: variable\n  found:    value`, e.operand.range);
      return this.errorExpr(e.range);
    }
    const p = primitiveOf(target.type);
    if (!isLoose(target.type) && (!p || p.name === 'boolean')) {
      this.error(`bad operand type ${typeName(target.type)} for unary operator '${e.op}'`, e.range);
      return this.errorExpr(e.range);
    }
    return { kind: 'IncDec', op: e.op, prefix: e.prefix, target, type: target.type, range: e.range };
  }

  private binary(e: A.Binary): B.BExpr {
    const left = this.expr(e.left);
    const right = this.expr(e.right);
    return this.binaryOp(e.op, left, right, e.range);
  }

  private binaryOp(op: A.BinaryOp, left: B.BExpr, right: B.BExpr, range: A.Range): B.BExpr {
    const lt = left.type, rt = right.type;
    const bad = () => {
      this.error(`bad operand types for binary operator '${op}'\n  first type:  ${typeName(lt)}\n  second type: ${typeName(rt)}`, range);
      return this.errorExpr(range);
    };
    if (op === '&&' || op === '||') {
      const l = this.assignConvert(left, BOOLEAN, left.range, 'operand', `bad operand types for binary operator '${op}'`);
      const r = this.assignConvert(right, BOOLEAN, right.range, 'operand', `bad operand types for binary operator '${op}'`);
      return this.fold({ kind: 'Logical', op, left: l, right: r, type: BOOLEAN, range });
    }
    if (op === '+' && (this.isString(lt) || this.isString(rt))) {
      if (lt.tag === 'void' || rt.tag === 'void') return bad();
      return this.fold({ kind: 'Concat', left, right, type: this.stringType, range });
    }
    if (isLoose(lt) || isLoose(rt)) {
      const type = ['==', '!=', '<', '>', '<=', '>='].includes(op) ? BOOLEAN : DYNAMIC;
      return { kind: 'Binary', op, left, right, type, range };
    }
    const lp = primitiveOf(lt), rp = primitiveOf(rt);
    if (op === '==' || op === '!=') {
      // Numeric or boolean equality when either side is primitive (the other is unboxed); otherwise identity.
      if ((isPrimitive(lt) || isPrimitive(rt)) && lp && rp) {
        if ((lp.name === 'boolean') !== (rp.name === 'boolean')) return bad();
        if (lp.name === 'boolean') return this.fold({ kind: 'Binary', op, left: this.unbox(left), right: this.unbox(right), type: BOOLEAN, range });
        const t = binaryPromote(lp, rp);
        return this.fold({ kind: 'Binary', op, left: this.promote(left, t), right: this.promote(right, t), type: BOOLEAN, range });
      }
      if (isReference(lt) && isReference(rt)) {
        if (!castable(lt, rt, this.b) && !castable(rt, lt, this.b)) {
          this.error(`incomparable types: ${typeName(lt)} and ${typeName(rt)}`, range);
          return this.errorExpr(range);
        }
        return { kind: 'RefEquals', negate: op === '!=', left, right, type: BOOLEAN, range };
      }
      return bad();
    }
    if (!lp || !rp) return bad();
    if (op === '&' || op === '|' || op === '^') {
      if (lp.name === 'boolean' && rp.name === 'boolean') return this.fold({ kind: 'Binary', op, left: this.unbox(left), right: this.unbox(right), type: BOOLEAN, range });
      if (!isIntegral(lp) || !isIntegral(rp)) return bad();
      const t = binaryPromote(lp, rp);
      return this.fold({ kind: 'Binary', op, left: this.promote(left, t), right: this.promote(right, t), type: t, range });
    }
    if (lp.name === 'boolean' || rp.name === 'boolean') return bad();
    if (op === '<<' || op === '>>' || op === '>>>') {
      if (!isIntegral(lp) || !isIntegral(rp)) return bad();
      const t = unaryPromote(lp);
      return this.fold({ kind: 'Binary', op, left: this.promote(left, t), right: this.promote(right, unaryPromote(rp)), type: t, range });
    }
    const t = binaryPromote(lp, rp);
    const comparison = op === '<' || op === '>' || op === '<=' || op === '>=';
    return this.fold({ kind: 'Binary', op, left: this.promote(left, t), right: this.promote(right, t), type: comparison ? BOOLEAN : t, range });
  }

  private assign(e: A.Assign): B.BExpr {
    const target = this.expr(e.target);
    const range = e.range;
    if (!isLValue(target)) {
      if (target.type.tag !== 'error') this.error('unexpected type\n  required: variable\n  found:    value', e.target.range);
      this.expr(e.value);
      return this.errorExpr(range);
    }
    const tt = target.type;
    if (e.op === '=') {
      const value = this.initializerExpr(e.value, tt);
      return { kind: 'Assign', target, value, type: tt, range };
    }
    const op = e.op.slice(0, -1) as A.BinaryOp;
    const value = this.expr(e.value);
    if (op === '+' && this.isString(tt)) return { kind: 'CompoundAssign', op, concat: true, target, value, type: tt, range };
    if (isLoose(tt) || isLoose(value.type)) return { kind: 'CompoundAssign', op, concat: false, target, value, type: tt, range };
    // Checked as `target op value` would be, then narrowed back to the target's type.
    const check = this.binaryOp(op, target, value, range);
    if (check.type.tag === 'error') return check;
    const rp = primitiveOf(value.type);
    const operand = op === '<<' || op === '>>' || op === '>>>' ? this.promote(value, unaryPromote(rp!)) : this.unbox(value);
    return { kind: 'CompoundAssign', op, concat: false, target, value: operand, type: tt, range };
  }

  /** An expression converted to a type by assignment conversion (also `{…}` for an array type). */
  private initializerExpr(e: A.Expr, type: JType): B.BExpr {
    if (e.kind === 'ArrayInit') return this.arrayLiteral(e, type, e.range);
    return this.assignConvert(this.expr(e, type), type, e.range, 'assignment');
  }

  private conditional(e: A.Conditional, expected?: JType): B.BExpr {
    const cond = this.condition(e.cond);
    const a = this.expr(e.then, expected), b = this.expr(e.else, expected);
    const type = this.conditionalType(a.type, b.type, [constantOf(a), constantOf(b)]);
    const conv = (x: B.BExpr) => (type.tag === 'error' ? x : this.assignConvert(x, type, x.range, 'assignment'));
    return this.fold({ kind: 'Conditional', cond, then: conv(a), else: conv(b), type, range: e.range });
  }

  /** The type of `c ? a : b` (JLS §15.25), also used for a switch expression's results. */
  private conditionalType(a: JType, b: JType, constants?: (ConstValue | undefined)[]): JType {
    if (isLoose(a)) return b.tag === 'null' ? DYNAMIC : isLoose(b) ? DYNAMIC : a;
    if (isLoose(b)) return b;
    if (sameType(a, b)) return a;
    const pa = primitiveOf(a), pb = primitiveOf(b);
    if (pa && pb && pa.name === 'boolean' && pb.name === 'boolean') return BOOLEAN;
    if (pa && pb && pa.name !== 'boolean' && pb.name !== 'boolean') {
      if (isPrimitive(a) || isPrimitive(b)) {
        if (sameType(pa, pb)) return pa;
        const narrow = ['byte', 'short', 'char'];
        if ((pa.name === 'short' && pb.name === 'byte') || (pa.name === 'byte' && pb.name === 'short')) return primitive('short');
        // byte, short or char against an int constant that fits: the narrower type.
        const fits = (t: PrimitiveT, c: ConstValue | undefined) => typeof c === 'number' && assignable(INT, t, this.b, c);
        if (narrow.includes(pa.name) && pb.name === 'int' && isPrimitive(b) && fits(pa, constants?.[1])) return pa;
        if (narrow.includes(pb.name) && pa.name === 'int' && isPrimitive(a) && fits(pb, constants?.[0])) return pb;
        return binaryPromote(pa, pb);
      }
    }
    if (a.tag === 'null' && b.tag === 'primitive') return classType(this.b.box(b.name));
    if (b.tag === 'null' && a.tag === 'primitive') return classType(this.b.box(a.name));
    if (a.tag === 'null') return b;
    if (b.tag === 'null') return a;
    const box = (t: JType) => (t.tag === 'primitive' ? classType(this.b.box(t.name)) : t);
    return this.lub([box(a), box(b)]);
  }

  /** The least upper bound, simplified: a common supertype in the class hierarchy (else Object). */
  private lub(types: JType[]): JType {
    const refs = types.filter(t => !isLoose(t));
    if (!refs.length) return types[0] ?? this.objectType;
    let best = refs[0];
    for (const t of refs.slice(1)) {
      if (isSubtype(t, best, this.b)) continue;
      if (isSubtype(best, t, this.b)) { best = t; continue; }
      // Walk up best's superclasses until t is a subtype.
      let candidate: JType | undefined = best;
      while (candidate && candidate.tag === 'class' && !isSubtype(t, candidate, this.b)) {
        candidate = candidate.symbol.superclass;
      }
      best = candidate && isSubtype(t, candidate, this.b) ? candidate : this.objectType;
    }
    return best;
  }

  private cast(e: A.Cast): B.BExpr {
    if (e.expr.kind === 'Lambda') return this.unsupportedExpr('Lambda expressions', e.expr.range);
    const target = this.resolveType(e.type);
    const value = this.expr(e.expr);
    const range = e.range;
    const s = value.type;
    if (isLoose(s) || isLoose(target)) return { kind: 'Convert', conversion: 'checkcast', expr: value, type: target, range };
    if (!castable(s, target, this.b)) {
      this.error(`incompatible types: ${typeName(s)} cannot be converted to ${typeName(target)}`, range);
      return this.errorExpr(range);
    }
    if (target.tag === 'primitive') {
      const p = primitiveOf(s);
      let v = value;
      if (!p) v = this.convertTo({ kind: 'Convert', conversion: 'checkcast', expr: value, type: classType(this.b.box(target.name)), range }, target, 'unbox');
      else if (!isPrimitive(s)) v = this.unbox(value);
      const vp = primitiveOf(v.type)!;
      if (sameType(vp, target)) return { ...v, range } as B.BExpr;
      return this.fold({ kind: 'Convert', conversion: widensTo(vp, target) ? 'widen' : 'narrow', expr: v, type: target, range });
    }
    if (s.tag === 'primitive') return this.assignConvert(value, target, range, 'cast');
    if (isSubtype(s, target, this.b)) return { kind: 'Convert', conversion: 'widen', expr: value, type: target, range };
    return { kind: 'Convert', conversion: 'checkcast', expr: value, type: target, range };
  }

  private instanceOf(e: A.InstanceOf): B.BExpr {
    const value = this.expr(e.expr);
    if (e.pattern?.kind === 'RecordPattern') return this.unsupportedExpr('Record patterns', e.pattern.range);
    const typeNode = e.pattern ? e.pattern.type : e.type!;
    const target = this.resolveType(typeNode);
    if (!isLoose(value.type) && !isLoose(target)) {
      if (!isReference(value.type)) {
        this.error(`unexpected type\n  required: reference\n  found:    ${typeName(value.type)}`, e.expr.range);
      } else if (!castable(value.type, target, this.b)) {
        this.error(`incompatible types: ${typeName(value.type)} cannot be converted to ${typeName(target)}`, e.range);
      }
    }
    const binding = e.pattern ? this.declareLocal(e.pattern.name, target, 'pattern', false, e.pattern.range) : undefined;
    return { kind: 'InstanceOf', expr: value, target, binding, type: BOOLEAN, range: e.range };
  }

  // ── Conversions ──

  private unbox(e: B.BExpr): B.BExpr {
    if (isPrimitive(e.type) || isLoose(e.type)) return e;
    const p = unboxedType(e.type);
    return p ? this.convertTo(e, p, 'unbox') : e;
  }

  /** Unbox, then widen to a promoted type. */
  private promote(e: B.BExpr, t: PrimitiveT): B.BExpr {
    const u = this.unbox(e);
    return sameType(u.type, t) ? u : this.fold({ kind: 'Convert', conversion: 'widen', expr: u, type: t, range: e.range });
  }

  private convertTo(e: B.BExpr, to: JType, conversion: ConversionKind): B.BExpr {
    if (sameType(e.type, to)) return e;
    return this.fold({ kind: 'Convert', conversion, expr: e, type: to, range: e.range });
  }

  /** Method invocation conversion to a parameter type (loose: boxing allowed). */
  private invocationConvert(e: B.BExpr, to: JType): B.BExpr {
    return this.assignConvert(e, to, e.range, 'invocation');
  }

  /**
   * Convert an expression to a type in an assignment-like context (JLS §5.2):
   * widening, boxing (then widening), unboxing (then widening), and a
   * constant narrowed to byte, short or char. Reports javac's error otherwise.
   */
  private assignConvert(e: B.BExpr, to: JType, range: A.Range, context: string, message?: string): B.BExpr {
    const from = e.type;
    if (isLoose(to) || from.tag === 'error') return e;
    if (isLoose(from)) return to.tag === 'void' ? e : { kind: 'Convert', conversion: 'checkcast', expr: e, type: to, range: e.range };
    if (sameType(from, to) || from.tag === 'void') {
      if (from.tag === 'void' && to.tag !== 'void') this.error(`incompatible types: void cannot be converted to ${typeName(to)}`, range);
      return e;
    }
    const constant = constantOf(e);
    if (!assignable(from, to, this.b, context === 'assignment' || context === 'return' ? constant : undefined)) {
      {
        const p = primitiveOf(from);
        const lossy = p && to.tag === 'primitive' && isNumeric(p) && isNumeric(to) && !widensTo(p, to);
        this.error(message ?? (lossy
          ? `incompatible types: possible lossy conversion from ${typeName(from)} to ${typeName(to)}`
          : `incompatible types: ${typeName(from)} cannot be converted to ${typeName(to)}`), range);
      }
      return { kind: 'Convert', conversion: 'checkcast', expr: e, type: to, range: e.range };
    }
    if (from.tag === 'primitive' && to.tag === 'primitive') {
      return this.fold({ kind: 'Convert', conversion: widensTo(from, to) ? 'widen' : 'narrow', expr: e, type: to, range: e.range });
    }
    if (from.tag === 'primitive') {
      // Boxing: to the primitive's box (a constant narrowed first: Character c = 65), then widening to the target.
      const targetPrim = unboxedType(to);
      const boxPrim = targetPrim && !sameType(targetPrim, from) && constant !== undefined ? targetPrim : from;
      const prim = sameType(boxPrim, from) ? e : this.fold({ kind: 'Convert', conversion: 'narrow', expr: e, type: boxPrim, range: e.range });
      const boxed: B.BExpr = { kind: 'Convert', conversion: 'box', expr: prim, type: classType(this.b.box(boxPrim.name)), range: e.range };
      return sameType(boxed.type, to) ? boxed : { kind: 'Convert', conversion: 'widen', expr: boxed, type: to, range: e.range };
    }
    if (to.tag === 'primitive') {
      const u = this.unbox(e);
      return sameType(u.type, to) ? u : this.fold({ kind: 'Convert', conversion: 'widen', expr: u, type: to, range: e.range });
    }
    return { kind: 'Convert', conversion: 'widen', expr: e, type: to, range: e.range };
  }

  // ── Constant folding (JLS §15.29) ──

  /** Replace a constant expression by its value: literals, constant variables, and operators on them. */
  private fold(e: B.BExpr): B.BExpr {
    const v = foldValue(e);
    if (v === undefined) return e;
    return { kind: 'Const', value: v, type: e.type, range: e.range };
  }
}

// ── Helpers ──

interface Applicable {
  method: MethodSymbol;
  /** Parameter types after substitution. */
  params: JType[];
  returnType: JType;
  /** For a diamond: the class's inferred type arguments. */
  classArgs?: JType[];
}

interface Chosen {
  method: MethodSymbol;
  args: B.BExpr[];
  returnType: JType;
  classArgs?: JType[];
}

interface CallOptions {
  /** Type arguments given explicitly: `Comparator.<String>naturalOrder()`. */
  typeArgs?: JType[];
  /** `new C<>(…)` without a target type: infer C's type arguments from the constructor's arguments. */
  diamond?: boolean;
}

/** Library classes JavaTutor knows of but doesn't emulate. */
const UNSUPPORTED_LIBRARY = new Set([
  'Stream', 'IntStream', 'LongStream', 'DoubleStream', 'Collectors', 'Optional', 'OptionalInt', 'Thread',
  'Function', 'BiFunction', 'Predicate', 'Consumer', 'Supplier', 'UnaryOperator', 'BinaryOperator',
  'LocalDate', 'LocalDateTime', 'Duration', 'Instant', 'BigInteger', 'BigDecimal', 'Pattern', 'Matcher',
  'Files', 'Paths', 'Path', 'File', 'BufferedReader', 'InputStreamReader', 'FileReader', 'FileWriter', 'PrintWriter',
  'AtomicInteger', 'StringJoiner', 'EnumMap', 'EnumSet', 'BitSet', 'Iterator', 'ListIterator', 'Executors',
]);

function emptyRange(): A.Range {
  return { start: 0, end: 0, line: 0, column: 0, endLine: 0, endColumn: 0 };
}

function paramAt(a: Applicable, i: number, phase: string): JType | undefined {
  const n = a.params.length;
  if (phase === 'varargs' && i >= n - 1 && a.method.varargs) {
    const last = a.params[n - 1];
    return last.tag === 'array' ? last.component : last;
  }
  return a.params[i];
}

/** Of applicable methods with the same parameter types, keep the first (the subclass's override comes first). */
function dedupeBySignature(list: Applicable[]): Applicable[] {
  const out: Applicable[] = [];
  for (const a of list) {
    if (!out.some(o => o.params.length === a.params.length && o.params.every((p, i) => sameType(erasure(p), erasure(a.params[i]))))) out.push(a);
  }
  return out;
}

/** A field of a class or of its supertypes. */
function findField(cls: ClassSymbol, name: string): FieldSymbol | undefined {
  const seen = new Set<ClassSymbol>();
  const search = (c: ClassSymbol): FieldSymbol | undefined => {
    if (seen.has(c)) return undefined;
    seen.add(c);
    const own = c.fields.get(name);
    if (own) return own;
    for (const s of [c.superclass, ...c.interfaces]) {
      const found = s && search(s.symbol);
      if (found) return found;
    }
    return undefined;
  };
  return search(cls);
}

/** The methods of a class with a name, its own first, then its supertypes' (and Object's, for an interface). */
function methodsNamed(cls: ClassSymbol, name: string, extra?: ClassSymbol): MethodSymbol[] {
  const out: MethodSymbol[] = [];
  const seen = new Set<ClassSymbol>();
  const visit = (c: ClassSymbol) => {
    if (seen.has(c)) return;
    seen.add(c);
    out.push(...(c.methods.get(name) ?? []));
    if (c.superclass) visit(c.superclass.symbol);
    for (const i of c.interfaces) visit(i.symbol);
  };
  visit(cls);
  if (extra) visit(extra);
  if (cls.isInterface) {
    const object = cachedLibrary?.byName('Object');
    if (object) visit(object);
  }
  return out;
}

/** The type arguments a receiver type gives a member's class (empty for raw types). */
function receiverMap(receiver: JType, owner: ClassSymbol): Map<number, JType> {
  const sup = asSuper(receiver, owner);
  return sup ? typeArgMap(sup) : new Map();
}

function receiverIsRaw(receiver: JType, owner: ClassSymbol): boolean {
  const sup = asSuper(receiver, owner);
  return !!sup && sup.args.length === 0 && owner.typeParams.length > 0;
}

function isLValue(e: B.BExpr): e is B.BLValue {
  return e.kind === 'Local' || e.kind === 'StaticField' || e.kind === 'Field' || e.kind === 'ArrayElement';
}

/** `!(x instanceof T t)` (perhaps in parentheses). */
function isNegatedPattern(e: A.Expr): boolean {
  if (e.kind === 'Parens') return isNegatedPattern(e.expr);
  if (e.kind !== 'Unary' || e.op !== '!') return false;
  let inner = e.operand;
  while (inner.kind === 'Parens') inner = inner.expr;
  return inner.kind === 'InstanceOf' && inner.pattern !== undefined;
}

/** Whether a statement can finish normally (JLS §14.22, roughly): not if it always returns, throws, breaks or continues. */
function canCompleteNormally(s: A.Stmt): boolean {
  switch (s.kind) {
    case 'Return': case 'Throw': case 'Break': case 'Continue': case 'Yield': return false;
    case 'Block': return s.statements.length === 0 || canCompleteNormally(s.statements[s.statements.length - 1]);
    case 'If': return !s.else || canCompleteNormally(s.then) || canCompleteNormally(s.else);
    default: return true;
  }
}

/** The constant value of a bound expression, if it is one: a folded constant, or a constant variable named by its simple name. */
function constantOf(e: B.BExpr | undefined): ConstValue | undefined {
  if (!e) return undefined;
  if (e.kind === 'Const') return e.value === null ? undefined : e.value;
  if (e.kind === 'Local') return e.local.isFinal ? e.local.constant : undefined;
  if (e.kind === 'StaticField') return e.field.isFinal ? e.field.constant : undefined;
  return undefined;
}

/** The value of a constant expression whose parts are constants, computed as Java does. */
function foldValue(e: B.BExpr): ConstValue | undefined {
  const prim = (x: B.BExpr): JavaPrimitive | undefined => {
    const v = constantOf(x);
    if (v === undefined || typeof v === 'string' || x.type.tag !== 'primitive') return undefined;
    return { kind: 'primitive', javaType: x.type.name as JavaPrimitiveType, value: v };
  };
  const value = (p: JavaPrimitive): ConstValue => p.value;
  try {
    switch (e.kind) {
      case 'Local': return e.local.isFinal ? e.local.constant : undefined;
      case 'StaticField': return e.field.isFinal && e.field.isStatic ? e.field.constant : undefined;
      case 'Unary': {
        const p = prim(e.operand);
        return p ? value(unaryOperation(e.op, p)) : undefined;
      }
      case 'Binary': {
        const l = prim(e.left), r = prim(e.right);
        if (!l || !r) return undefined;
        // Division by zero isn't a constant (it throws when the program runs).
        if ((e.op === '/' || e.op === '%') && e.type.tag === 'primitive' && isIntegral(e.type) && (r.value === 0 || r.value === 0n)) return undefined;
        return value(binaryOperation(e.op, l, r));
      }
      case 'Logical': {
        const l = constantOf(e.left), r = constantOf(e.right);
        if (typeof l !== 'boolean' || typeof r !== 'boolean') return undefined;
        return e.op === '&&' ? l && r : l || r;
      }
      case 'Concat': {
        const l = constantText(e.left), r = constantText(e.right);
        return l !== undefined && r !== undefined ? l + r : undefined;
      }
      case 'Convert': {
        if (e.conversion !== 'widen' && e.conversion !== 'narrow') return undefined;
        const p = prim(e.expr);
        if (!p || e.type.tag !== 'primitive') return undefined;
        return value(castPrimitive(p, e.type.name as JavaPrimitiveType));
      }
      case 'Conditional': {
        const c = constantOf(e.cond);
        if (typeof c !== 'boolean') return undefined;
        return constantOf(c ? e.then : e.else);
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** A constant as string conversion prints it (`'a'` as a, 1.0 as 1.0), for folding a constant concatenation. */
function constantText(e: B.BExpr): string | undefined {
  const v = constantOf(e);
  if (v === undefined) return undefined;
  if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (e.type.tag !== 'primitive') return undefined;
  if (e.type.name === 'char') return String.fromCharCode(v);
  if (e.type.name === 'double') return doubleToString(v);
  if (e.type.name === 'float') return floatToString(v);
  return String(v);
}

/** The yields inside a switch expression's cases (not in nested switch expressions). */
function collectYields(cases: B.BSwitchCase[]): B.BExpr[] {
  const out: B.BExpr[] = [];
  const visit = (s: B.BStmt): void => {
    switch (s.kind) {
      case 'Yield': out.push(s.value); break;
      case 'Block': s.statements.forEach(visit); break;
      case 'If': visit(s.then); if (s.else) visit(s.else); break;
      case 'While': case 'DoWhile': case 'For': case 'ForEach': case 'Labeled': visit(s.body); break;
      case 'Try': visit(s.block); s.catches.forEach(c => visit(c.body)); if (s.finally) visit(s.finally); break;
      case 'Synchronized': visit(s.body); break;
      case 'SwitchStmt': s.switch.cases.forEach(c => c.body.forEach(visit)); break;
    }
  };
  for (const c of cases) c.body.forEach(visit);
  return out;
}

function convertYields(cases: B.BSwitchCase[], convert: (v: B.BExpr) => B.BExpr): void {
  const visit = (s: B.BStmt): void => {
    switch (s.kind) {
      case 'Yield': s.value = convert(s.value); break;
      case 'Block': s.statements.forEach(visit); break;
      case 'If': visit(s.then); if (s.else) visit(s.else); break;
      case 'While': case 'DoWhile': case 'For': case 'ForEach': case 'Labeled': visit(s.body); break;
      case 'Try': visit(s.block); s.catches.forEach(c => visit(c.body)); if (s.finally) visit(s.finally); break;
      case 'Synchronized': visit(s.body); break;
      case 'SwitchStmt': s.switch.cases.forEach(c => c.body.forEach(visit)); break;
    }
  };
  for (const c of cases) c.body.forEach(visit);
}

