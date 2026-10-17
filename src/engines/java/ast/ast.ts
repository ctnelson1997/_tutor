/**
 * The Java abstract syntax tree (#12): what java-parser's concrete syntax tree
 * means, built once by convert.ts, so later stages (name resolution and types,
 * #13; the evaluator, #14) never re-derive structure.
 *
 * - Every node has a `kind` and a source `range`.
 * - Names stay ambiguous: `a.b.c` is one `Name`, and #13 decides per JLS §6.5
 *   whether each part is a variable, a field, a type or a package.
 * - Binary expressions are a tree built by precedence, shifts included.
 * - Parentheses are kept (`Parens`), so the tree prints back as written.
 * - Nothing is dropped: a construct the conversion doesn't handle becomes an
 *   `Unsupported` node with its range.
 */

/**
 * Where a node is in the source: character offsets `start` (inclusive) and
 * `end` (exclusive), the 1-based `line` and `column` of its first character,
 * and the 1-based `endLine` and `endColumn` of its last character.
 */
export interface Range {
  start: number;
  end: number;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

interface Node {
  range: Range;
}

/** A construct the conversion doesn't handle (a string template, a module declaration, …), kept with its source. */
export interface Unsupported extends Node {
  kind: 'Unsupported';
  construct: string;
  source: string;
}

// ── Compilation unit ──

export interface CompilationUnit extends Node {
  kind: 'CompilationUnit';
  package?: QualifiedName;
  imports: ImportDecl[];
  types: (TypeDecl | Unsupported)[];
}

export interface ImportDecl extends Node {
  kind: 'Import';
  isStatic: boolean;
  name: QualifiedName;
  /** `import java.util.*;` */
  onDemand: boolean;
}

/** A dotted name in a declaration (a package or an import), not an expression. */
export interface QualifiedName extends Node {
  kind: 'QualifiedName';
  parts: string[];
}

// ── Modifiers and annotations ──

export type Modifier =
  | 'public' | 'protected' | 'private' | 'static' | 'final' | 'abstract' | 'default'
  | 'synchronized' | 'native' | 'transient' | 'volatile' | 'strictfp' | 'sealed' | 'non-sealed';

/** An annotation, kept as written (it has no effect on running the program). */
export interface Annotation extends Node {
  kind: 'Annotation';
  name: string;
  source: string;
}

/** Modifiers and annotations, in source order. */
export type ModifierItem = Modifier | Annotation;

// ── Type references ──

export type PrimitiveName = 'byte' | 'short' | 'int' | 'long' | 'char' | 'float' | 'double' | 'boolean';

export type TypeNode = PrimitiveType | ClassType | ArrayType | VarType | VoidType | Wildcard;

export interface PrimitiveType extends Node {
  kind: 'PrimitiveType';
  name: PrimitiveName;
}

/** One part of a class type: `Map` and `Entry<K, V>` in `Map.Entry<K, V>`. */
export interface ClassTypePart {
  name: string;
  typeArgs?: TypeNode[];
  range: Range;
}

/** A class or interface type, possibly qualified (`java.util.List<String>`, `Map.Entry<K, V>`). */
export interface ClassType extends Node {
  kind: 'ClassType';
  parts: ClassTypePart[];
}

/** One dimension: `int[][]` is an ArrayType of an ArrayType of int. */
export interface ArrayType extends Node {
  kind: 'ArrayType';
  component: TypeNode;
}

/** `var` in a local variable or lambda parameter declaration. */
export interface VarType extends Node {
  kind: 'VarType';
}

/** `void`, as a method's result or in `void.class`. */
export interface VoidType extends Node {
  kind: 'VoidType';
}

/** `?`, `? extends T`, `? super T` (a type argument). */
export interface Wildcard extends Node {
  kind: 'Wildcard';
  bound?: { kind: 'extends' | 'super'; type: TypeNode };
}

export interface TypeParam extends Node {
  kind: 'TypeParam';
  annotations: Annotation[];
  name: string;
  bounds: ClassType[];
}

// ── Declarations ──

export type TypeDecl = ClassDecl | InterfaceDecl | EnumDecl | RecordDecl | AnnotationTypeDecl;

export type Member = FieldDecl | MethodDecl | ConstructorDecl | Initializer | TypeDecl | Unsupported;

export interface ClassDecl extends Node {
  kind: 'ClassDecl';
  modifiers: ModifierItem[];
  name: string;
  typeParams: TypeParam[];
  superclass?: ClassType;
  interfaces: ClassType[];
  permits: ClassType[];
  members: Member[];
}

export interface InterfaceDecl extends Node {
  kind: 'InterfaceDecl';
  modifiers: ModifierItem[];
  name: string;
  typeParams: TypeParam[];
  extends: ClassType[];
  permits: ClassType[];
  members: Member[];
}

export interface EnumDecl extends Node {
  kind: 'EnumDecl';
  modifiers: ModifierItem[];
  name: string;
  interfaces: ClassType[];
  constants: EnumConstant[];
  members: Member[];
}

export interface EnumConstant extends Node {
  kind: 'EnumConstant';
  annotations: Annotation[];
  name: string;
  /** Undefined without parentheses: `A` rather than `A()`. */
  args?: Expr[];
  /** A constant with its own class body: `A { … }`. */
  body?: Member[];
}

export interface RecordDecl extends Node {
  kind: 'RecordDecl';
  modifiers: ModifierItem[];
  name: string;
  typeParams: TypeParam[];
  components: Param[];
  interfaces: ClassType[];
  members: Member[];
}

/** `@interface Name { … }`, kept as written. */
export interface AnnotationTypeDecl extends Node {
  kind: 'AnnotationTypeDecl';
  modifiers: ModifierItem[];
  name: string;
  source: string;
}

export interface FieldDecl extends Node {
  kind: 'FieldDecl';
  modifiers: ModifierItem[];
  type: TypeNode;
  declarators: VarDeclarator[];
}

/** `x`, `x = 5`, `a[] = {1, 2}` (extra dimensions belong to this variable only). */
export interface VarDeclarator extends Node {
  kind: 'VarDeclarator';
  name: string;
  dims: number;
  init?: Expr | ArrayInit;
}

export interface MethodDecl extends Node {
  kind: 'MethodDecl';
  modifiers: ModifierItem[];
  typeParams: TypeParam[];
  /** Annotations between the type parameters and the result: `<T> @A T f()`. */
  resultAnnotations: Annotation[];
  result: TypeNode;
  name: string;
  receiver?: ReceiverParam;
  params: Param[];
  /** Legacy dimensions after the parameter list: `int f()[]`. */
  dims: number;
  throws: ClassType[];
  /** Undefined for an abstract, interface or native method (`;` instead of a body). */
  body?: Block;
}

/** `Main this` as an explicit first parameter. It names the receiver and has no effect when running. */
export interface ReceiverParam extends Node {
  kind: 'ReceiverParam';
  annotations: Annotation[];
  type: TypeNode;
  qualifier?: string;
}

export interface Param extends Node {
  kind: 'Param';
  modifiers: ModifierItem[];
  type: TypeNode;
  /** `int... nums` (annotations between the type and the `...` are in `varargsAnnotations`). */
  varargs: boolean;
  varargsAnnotations: Annotation[];
  name: string;
  /** Extra dimensions after the name: `String args[]`. */
  dims: number;
}

export interface ConstructorDecl extends Node {
  kind: 'ConstructorDecl';
  modifiers: ModifierItem[];
  typeParams: TypeParam[];
  name: string;
  receiver?: ReceiverParam;
  params: Param[];
  throws: ClassType[];
  /** A record's compact constructor: `Point { … }`, without a parameter list. */
  compact: boolean;
  /** `this(…)` or `super(…)` as the first statement (not in `body`). */
  explicitCall?: ExplicitConstructorCall;
  body: Block;
}

/** A static (`static { … }`) or instance (`{ … }`) initializer block. */
export interface Initializer extends Node {
  kind: 'Initializer';
  isStatic: boolean;
  body: Block;
}

/** `this(args)`, `super(args)` or `outer.super(args)` in a constructor. */
export interface ExplicitConstructorCall extends Node {
  kind: 'ExplicitConstructorCall';
  target: 'this' | 'super';
  qualifier?: Expr;
  typeArgs?: TypeNode[];
  args: Expr[];
}

// ── Statements ──

export type Stmt =
  | Block | LocalVarDecl | LocalClassDecl | ExprStmt | If | While | DoWhile | For | ForEach
  | Labeled | SwitchStmt | Break | Continue | Return | Throw | Yield | Try | Synchronized
  | Assert | Empty | Unsupported;

export interface Block extends Node {
  kind: 'Block';
  statements: Stmt[];
}

export interface LocalVarDecl extends Node {
  kind: 'LocalVarDecl';
  modifiers: ModifierItem[];
  type: TypeNode;
  declarators: VarDeclarator[];
}

/** A class, interface, enum or record declared in a block. */
export interface LocalClassDecl extends Node {
  kind: 'LocalClassDecl';
  decl: TypeDecl;
}

export interface ExprStmt extends Node {
  kind: 'ExprStmt';
  expr: Expr;
}

export interface If extends Node {
  kind: 'If';
  cond: Expr;
  then: Stmt;
  else?: Stmt;
}

export interface While extends Node {
  kind: 'While';
  cond: Expr;
  body: Stmt;
}

export interface DoWhile extends Node {
  kind: 'DoWhile';
  body: Stmt;
  cond: Expr;
}

export interface For extends Node {
  kind: 'For';
  /** A declaration (`int i = 0`), expressions (`i = 0, j = 1`), or nothing. */
  init?: LocalVarDecl | Expr[];
  cond?: Expr;
  update: Expr[];
  body: Stmt;
}

export interface ForEach extends Node {
  kind: 'ForEach';
  /** The loop variable, a declaration with one declarator and no initializer. */
  variable: LocalVarDecl;
  iterable: Expr;
  body: Stmt;
}

export interface Labeled extends Node {
  kind: 'Labeled';
  label: string;
  body: Stmt;
}

export interface SwitchStmt extends Node {
  kind: 'SwitchStmt';
  selector: Expr;
  body: SwitchBody;
}

/** Arrow rules (`case 1 -> …`) or colon groups (`case 1: …`), whichever the switch uses. */
export type SwitchBody =
  | { kind: 'rules'; rules: SwitchRule[] }
  | { kind: 'groups'; groups: SwitchGroup[] };

/**
 * One label: `default`, `case null` (with `, default`: `nullDefault`), or
 * `case` with constants (`case 1, 2`) or patterns (`case Circle c when …`).
 */
export interface SwitchLabel extends Node {
  kind: 'SwitchLabel';
  isDefault: boolean;
  isNull: boolean;
  nullDefault: boolean;
  constants: Expr[];
  patterns: Pattern[];
  guard?: Expr;
}

export interface SwitchRule extends Node {
  kind: 'SwitchRule';
  label: SwitchLabel;
  body: Expr | Block | Throw;
}

/** One label and the statements after its colon (consecutive labels are groups with no statements). */
export interface SwitchGroup extends Node {
  kind: 'SwitchGroup';
  label: SwitchLabel;
  statements: Stmt[];
}

export interface Break extends Node {
  kind: 'Break';
  label?: string;
}

export interface Continue extends Node {
  kind: 'Continue';
  label?: string;
}

export interface Return extends Node {
  kind: 'Return';
  value?: Expr;
}

export interface Throw extends Node {
  kind: 'Throw';
  value: Expr;
}

export interface Yield extends Node {
  kind: 'Yield';
  value: Expr;
}

export interface Try extends Node {
  kind: 'Try';
  /** try-with-resources: declarations (`Scanner sc = new Scanner(…)`) or existing variables. */
  resources: (LocalVarDecl | Expr)[];
  /** Whether the resource list ended with `;`. */
  resourcesTrailingSemicolon: boolean;
  block: Block;
  catches: Catch[];
  finally?: Block;
}

export interface Catch extends Node {
  kind: 'Catch';
  modifiers: ModifierItem[];
  /** `catch (A | B e)` has two types. */
  types: ClassType[];
  name: string;
  body: Block;
}

export interface Synchronized extends Node {
  kind: 'Synchronized';
  lock: Expr;
  body: Block;
}

export interface Assert extends Node {
  kind: 'Assert';
  cond: Expr;
  message?: Expr;
}

export interface Empty extends Node {
  kind: 'Empty';
}

// ── Expressions ──

export type Expr =
  | Literal | Name | This | Super | Parens | FieldAccess | ArrayAccess | MethodCall | NewObject
  | NewArray | ArrayInit | Unary | IncDec | Binary | Assign | Conditional | Cast | InstanceOf
  | Lambda | MethodRef | SwitchExpr | ClassLiteral | Unsupported;

export type LiteralType = 'int' | 'long' | 'float' | 'double' | 'boolean' | 'char' | 'String' | 'null';

/** A literal, as written (`0xFF`, `1_000L`, `'\n'`, a text block); its value is worked out later. */
export interface Literal extends Node {
  kind: 'Literal';
  type: LiteralType;
  text: string;
  /** A `"""` text block (type String). */
  textBlock: boolean;
}

/** One part of a name, with where it is. */
export interface NamePart {
  name: string;
  range: Range;
}

/** A simple or dotted name (`x`, `a.b.c`, `java.util.Arrays`), left ambiguous for name resolution (#13). */
export interface Name extends Node {
  kind: 'Name';
  parts: NamePart[];
}

/** `this`, or `Outer.this`. */
export interface This extends Node {
  kind: 'This';
  qualifier?: Name;
}

/** `super` or `Outer.super` (only as the target of a field access, method call or method reference). */
export interface Super extends Node {
  kind: 'Super';
  qualifier?: Name;
}

export interface Parens extends Node {
  kind: 'Parens';
  expr: Expr;
}

/** `target.name` where the target isn't a name (`this.x`, `f().x`, `a[0].x`, `super.x`). */
export interface FieldAccess extends Node {
  kind: 'FieldAccess';
  target: Expr;
  name: string;
  nameRange: Range;
}

export interface ArrayAccess extends Node {
  kind: 'ArrayAccess';
  array: Expr;
  index: Expr;
}

/** `name(args)`, `target.name(args)`, `target.<T>name(args)`. */
export interface MethodCall extends Node {
  kind: 'MethodCall';
  /** Undefined for an unqualified call. */
  target?: Expr;
  typeArgs?: TypeNode[];
  name: string;
  nameRange: Range;
  args: Expr[];
}

/** `new T(args)`, `new T<>(args)`, `outer.new Inner(args)`, `new T(args) { … }`. */
export interface NewObject extends Node {
  kind: 'NewObject';
  outer?: Expr;
  /** Type arguments of the constructor: `new <String>T()`. */
  typeArgs?: TypeNode[];
  type: ClassType;
  diamond: boolean;
  args: Expr[];
  /** An anonymous class's body. */
  body?: Member[];
}

/** `new int[3][]` (`dimExprs` [3], one more dimension) or `new int[] {1, 2}`. */
export interface NewArray extends Node {
  kind: 'NewArray';
  elementType: PrimitiveType | ClassType;
  dimExprs: Expr[];
  /** Dimensions without a size, after the sized ones. */
  extraDims: number;
  init?: ArrayInit;
}

/** `{1, 2, 3}` (in a declaration or after `new T[]`). */
export interface ArrayInit extends Node {
  kind: 'ArrayInit';
  elements: (Expr | ArrayInit)[];
  trailingComma: boolean;
}

export type UnaryOp = '+' | '-' | '!' | '~';

export interface Unary extends Node {
  kind: 'Unary';
  op: UnaryOp;
  operand: Expr;
}

/** `++x`, `x--`. */
export interface IncDec extends Node {
  kind: 'IncDec';
  op: '++' | '--';
  prefix: boolean;
  operand: Expr;
}

export type BinaryOp =
  | '||' | '&&' | '|' | '^' | '&' | '==' | '!=' | '<' | '>' | '<=' | '>='
  | '<<' | '>>' | '>>>' | '+' | '-' | '*' | '/' | '%';

export interface Binary extends Node {
  kind: 'Binary';
  op: BinaryOp;
  left: Expr;
  right: Expr;
}

export type AssignOp = '=' | '+=' | '-=' | '*=' | '/=' | '%=' | '&=' | '|=' | '^=' | '<<=' | '>>=' | '>>>=';

export interface Assign extends Node {
  kind: 'Assign';
  op: AssignOp;
  target: Expr;
  value: Expr;
}

export interface Conditional extends Node {
  kind: 'Conditional';
  cond: Expr;
  then: Expr;
  else: Expr;
}

/** `(int) x`, `(String) o`, `(Runnable & Serializable) r`. */
export interface Cast extends Node {
  kind: 'Cast';
  type: TypeNode;
  extraBounds: ClassType[];
  expr: Expr;
}

/** `x instanceof T` (`type`) or `x instanceof T t` (`pattern`). */
export interface InstanceOf extends Node {
  kind: 'InstanceOf';
  expr: Expr;
  type?: TypeNode;
  pattern?: Pattern;
}

export interface LambdaParam extends Node {
  kind: 'LambdaParam';
  modifiers: ModifierItem[];
  /** Undefined for an untyped parameter (`x -> …`, `(a, b) -> …`). */
  type?: TypeNode;
  varargs: boolean;
  name: string;
  dims: number;
}

export interface Lambda extends Node {
  kind: 'Lambda';
  params: LambdaParam[];
  /** `(x) -> …` rather than `x -> …`. */
  parenthesized: boolean;
  body: Expr | Block;
}

/** `Type::name`, `expr::name`, `super::name`, `Type::new`. */
export interface MethodRef extends Node {
  kind: 'MethodRef';
  target: Expr | TypeNode;
  typeArgs?: TypeNode[];
  /** The method's name, or `new` for a constructor reference. */
  name: string;
}

export interface SwitchExpr extends Node {
  kind: 'SwitchExpr';
  selector: Expr;
  body: SwitchBody;
}

/** `String.class`, `int.class`, `int[].class`, `void.class`. */
export interface ClassLiteral extends Node {
  kind: 'ClassLiteral';
  type: TypeNode;
}

// ── Patterns ──

export type Pattern = TypePattern | RecordPattern;

/** `String s` in `o instanceof String s` or `case String s`. */
export interface TypePattern extends Node {
  kind: 'TypePattern';
  modifiers: ModifierItem[];
  type: TypeNode;
  name: string;
}

/** `Point(int x, var y)`, with `_` for a component that matches anything. */
export interface RecordPattern extends Node {
  kind: 'RecordPattern';
  type: TypeNode;
  components: (Pattern | MatchAllPattern)[];
}

export interface MatchAllPattern extends Node {
  kind: 'MatchAllPattern';
}

/** Any node of the tree. */
export type AstNode =
  | CompilationUnit | ImportDecl | QualifiedName | Annotation | TypeNode | TypeParam | TypeDecl | Member
  | EnumConstant | VarDeclarator | Param | ReceiverParam | ExplicitConstructorCall | Stmt | SwitchLabel
  | SwitchRule | SwitchGroup | Catch | Expr | LambdaParam | Pattern | MatchAllPattern;
