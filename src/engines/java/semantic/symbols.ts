/**
 * What declarations declare (#13): classes (the program's and the library's),
 * their fields and methods, and local variables. The binder builds these
 * first, then binds the code against them.
 */

import type * as A from '../ast/ast';
import type { JType, ClassT, TypeVarT } from './types';

export type ClassKind = 'class' | 'interface' | 'enum' | 'record' | 'annotation';

/** A compile-time constant's value (JLS §15.29): numbers as the interpreter represents them, booleans, strings. */
export type ConstValue = number | bigint | boolean | string;

export class ClassSymbol {
  readonly name: string;
  readonly kind: ClassKind;
  /** `java.lang` for String; '' for the program's own classes. */
  readonly packageName: string;
  readonly isLibrary: boolean;
  /** The class it is nested in. */
  readonly outer?: ClassSymbol;
  modifiers = new Set<string>();
  typeParams: TypeVarT[] = [];
  superclass?: ClassT;
  interfaces: ClassT[] = [];
  readonly fields = new Map<string, FieldSymbol>();
  readonly methods = new Map<string, MethodSymbol[]>();
  readonly constructors: MethodSymbol[] = [];
  readonly memberTypes = new Map<string, ClassSymbol>();
  /** The program's declaration (none for a library class). */
  decl?: A.TypeDecl;
  /** Declared in a block (a local class). */
  isLocal = false;
  /** An anonymous class (#16), named `Main$1` as javac numbers them. */
  isAnonymous = false;
  /** The binary name of a local or anonymous class (`Main$1Helper`, `Main$1`), which isn't its outer's name plus its own. */
  flatName?: string;
  /** A local or anonymous class declared where there is no `this` (a static method): it has no enclosing instance. */
  staticContext = false;
  /** A local or anonymous class's copies of the enclosing locals it reads, as javac's `val$x` fields. */
  readonly captures = new Map<LocalSymbol, FieldSymbol>();
  /** The field holding the enclosing instance (`this$0`) of an inner class, or of a local or anonymous class that uses it. */
  outerField?: FieldSymbol;
  /** For naming the lambdas and anonymous classes declared in this class. */
  lambdaCount = 0;
  anonymousCount = 0;
  localCount = 0;

  constructor(name: string, kind: ClassKind, packageName: string, isLibrary: boolean, outer?: ClassSymbol) {
    this.name = name;
    this.kind = kind;
    this.packageName = packageName;
    this.isLibrary = isLibrary;
    this.outer = outer;
  }

  get isInterface(): boolean { return this.kind === 'interface' || this.kind === 'annotation'; }
  get isFinal(): boolean { return this.modifiers.has('final') || this.kind === 'enum' || this.kind === 'record'; }
  get isAbstract(): boolean { return this.modifiers.has('abstract') || this.isInterface; }
  /** A nested class that isn't static: its objects belong to an object of the enclosing class (an inner class). */
  get isInner(): boolean {
    return this.outer !== undefined && !this.modifiers.has('static') && this.kind === 'class' && !this.outer.isInterface && !this.isLocal && !this.isAnonymous;
  }

  /** The name Java prints: `Main$Point` for a nested class, `java.lang.String` for a library one. */
  get binaryName(): string {
    if (this.flatName) return this.flatName;
    if (this.outer) return `${this.outer.binaryName}$${this.name}`;
    return this.packageName ? `${this.packageName}.${this.name}` : this.name;
  }

  /** The name as written in source: `Main.Point`, `Map.Entry`. */
  get qualifiedSourceName(): string {
    return this.outer ? `${this.outer.qualifiedSourceName}.${this.name}` : this.name;
  }

  addMethod(m: MethodSymbol): void {
    const list = this.methods.get(m.name);
    if (list) list.push(m); else this.methods.set(m.name, [m]);
  }
}

export class FieldSymbol {
  readonly name: string;
  readonly owner: ClassSymbol;
  type: JType;
  readonly isStatic: boolean;
  readonly isFinal: boolean;
  readonly decl?: A.VarDeclarator;
  /** The value of a constant variable (a final field with a constant initializer). */
  constant?: ConstValue;
  /** An enum constant's position (#16). */
  enumOrdinal?: number;
  /** A record component's field. */
  recordComponent?: boolean;

  constructor(name: string, owner: ClassSymbol, type: JType, isStatic: boolean, isFinal: boolean, decl?: A.VarDeclarator) {
    this.name = name;
    this.owner = owner;
    this.type = type;
    this.isStatic = isStatic;
    this.isFinal = isFinal;
    this.decl = decl;
  }
}

export interface ParamSymbol {
  name: string;
  type: JType;
}

export class MethodSymbol {
  readonly name: string;
  readonly owner: ClassSymbol;
  params: ParamSymbol[] = [];
  /** The last parameter is `T...` (its type is the array type). */
  varargs = false;
  returnType: JType;
  typeParams: TypeVarT[] = [];
  readonly isConstructor: boolean;
  modifiers = new Set<string>();
  readonly decl?: A.MethodDecl | A.ConstructorDecl;
  /** Locals of the body, filled in when it is bound (parameters first). */
  locals: LocalSymbol[] = [];
  /**
   * A method javac generates (#16): an enum's `values()`/`valueOf(String)`, a
   * record's accessors, `equals`, `hashCode` and `toString`, and its
   * canonical constructor. The evaluator runs them itself, taking no steps.
   */
  synthetic?: 'values' | 'valueOf' | 'accessor' | 'recordEquals' | 'recordHashCode' | 'recordToString' | 'canonical';
  /** For an accessor or canonical constructor: the record's component fields. */
  components?: FieldSymbol[];

  constructor(name: string, owner: ClassSymbol, returnType: JType, isConstructor: boolean, decl?: A.MethodDecl | A.ConstructorDecl) {
    this.name = name;
    this.owner = owner;
    this.returnType = returnType;
    this.isConstructor = isConstructor;
    this.decl = decl;
  }

  get isStatic(): boolean { return this.modifiers.has('static'); }
  get isAbstract(): boolean { return this.modifiers.has('abstract') || (this.owner.isInterface && !this.modifiers.has('default') && !this.modifiers.has('static') && !this.modifiers.has('private') && !this.decl?.body); }
  get arity(): number { return this.params.length; }

  /** `name(int, String)`, as javac shows a method. */
  get signature(): string {
    return `${this.isConstructor ? this.owner.name : this.name}(${this.params.map((p, i) => paramTypeText(p.type, this.varargs && i === this.params.length - 1)).join(',')})`;
  }
}

function paramTypeText(t: JType, varargs: boolean): string {
  const text = (x: JType): string => {
    switch (x.tag) {
      case 'primitive': return x.name;
      case 'class': return x.symbol.name + (x.args.length ? `<${x.args.map(text).join(',')}>` : '');
      case 'array': return `${text(x.component)}[]`;
      case 'typevar': return x.name;
      case 'wildcard': return x.kind === 'unbounded' ? '?' : `? ${x.kind} ${text(x.bound!)}`;
      case 'dynamic': return 'Object';
      default: return x.tag;
    }
  };
  if (varargs && t.tag === 'array') return `${text(t.component)}...`;
  return text(t);
}

export type LocalKind = 'local' | 'param' | 'catch' | 'pattern' | 'foreach' | 'resource';

let nextLocalId = 1;

/** A local variable or parameter. */
export class LocalSymbol {
  readonly id = nextLocalId++;
  readonly name: string;
  type: JType;
  readonly kind: LocalKind;
  readonly isFinal: boolean;
  /** Where it is declared. */
  readonly range: A.Range;
  /** The value of a final local with a constant initializer. */
  constant?: ConstValue;
  /** Declared with an initializer (or a parameter, catch or for-each variable, which always has a value). */
  hasInit = false;
  /** Assignments to it after its declaration: a captured local must be effectively final (#16). */
  assignments = 0;

  constructor(name: string, type: JType, kind: LocalKind, isFinal: boolean, range: A.Range) {
    this.name = name;
    this.type = type;
    this.kind = kind;
    this.isFinal = isFinal;
    this.range = range;
  }
}
