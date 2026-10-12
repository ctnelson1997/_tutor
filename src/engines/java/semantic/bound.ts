/**
 * The bound tree (#13): the program after name resolution and typing, which
 * the evaluator (#14) runs without guessing. Every name is resolved to what it
 * means (a local, a field with its class, a method with its overload), every
 * expression has its static type, and conversions are explicit nodes.
 */

import type * as A from '../ast/ast';
import type { JType, ArrayT } from './types';
import type { ClassSymbol, FieldSymbol, MethodSymbol, LocalSymbol, ConstValue } from './symbols';

interface BNode {
  range: A.Range;
}

interface BTyped extends BNode {
  type: JType;
}

// ── Expressions ──

export type BExpr =
  | BConst | BLocal | BStaticField | BField | BArrayLength | BArrayElement | BThis
  | BCall | BDynamicCall | BNew | BNewArray | BArrayLiteral
  | BUnary | BIncDec | BBinary | BLogical | BRefEquals | BConcat
  | BAssign | BCompoundAssign | BConditional | BConvert | BInstanceOf
  | BSwitchExpr | BUnsupportedExpr;

/** An expression that names a variable: what assignment, `++` and compound assignment write. */
export type BLValue = BLocal | BStaticField | BField | BArrayElement;

/** A literal or a constant expression (JLS §15.29), folded: a String constant is interned. */
export interface BConst extends BTyped {
  kind: 'Const';
  /** null for the null literal. */
  value: ConstValue | null;
}

export interface BLocal extends BTyped {
  kind: 'Local';
  local: LocalSymbol;
}

/** A static field. Reading it initializes its class, unless it is a constant. */
export interface BStaticField extends BTyped {
  kind: 'StaticField';
  field: FieldSymbol;
}

export interface BField extends BTyped {
  kind: 'Field';
  target: BExpr;
  field: FieldSymbol;
}

export interface BArrayLength extends BTyped {
  kind: 'ArrayLength';
  array: BExpr;
}

export interface BArrayElement extends BTyped {
  kind: 'ArrayElement';
  array: BExpr;
  index: BExpr;
}

export interface BThis extends BTyped {
  kind: 'This';
  cls: ClassSymbol;
}

/**
 * A method call, its overload chosen. `static` calls have no target;
 * `virtual` ones dispatch on the receiver's class; `special` ones (private
 * methods, `super.m()`) don't. Arguments are converted to the parameter
 * types, and a variable-arity call's trailing arguments are packed into an
 * array.
 */
export interface BCall extends BTyped {
  kind: 'Call';
  method: MethodSymbol;
  dispatch: 'static' | 'virtual' | 'special';
  target?: BExpr;
  args: BExpr[];
}

/** A call of a library method the stubs don't describe: the stdlib finds it by name when the program runs. */
export interface BDynamicCall extends BTyped {
  kind: 'DynamicCall';
  owner?: ClassSymbol;
  name: string;
  target?: BExpr;
  args: BExpr[];
}

/** `new C(args)`, its constructor chosen. */
export interface BNew extends BTyped {
  kind: 'New';
  cls: ClassSymbol;
  ctor?: MethodSymbol;
  args: BExpr[];
}

/** `new int[3][4][]`: `dims` are the sized dimensions. */
export interface BNewArray extends BTyped {
  kind: 'NewArray';
  type: ArrayT;
  dims: BExpr[];
}

/** `{1, 2, 3}` or `new int[] {1, 2, 3}`, each element converted to the component type. */
export interface BArrayLiteral extends BTyped {
  kind: 'ArrayLiteral';
  type: ArrayT;
  elements: BExpr[];
}

export interface BUnary extends BTyped {
  kind: 'Unary';
  op: '+' | '-' | '~' | '!';
  operand: BExpr;
}

/** `++x` or `x--`, computed in the variable's type (a boxed variable is unboxed and boxed again). */
export interface BIncDec extends BTyped {
  kind: 'IncDec';
  op: '++' | '--';
  prefix: boolean;
  target: BLValue;
}

/** Arithmetic, shifts, bitwise and numeric comparisons, on operands already unboxed and promoted. */
export interface BBinary extends BTyped {
  kind: 'Binary';
  op: A.BinaryOp;
  left: BExpr;
  right: BExpr;
}

export interface BLogical extends BTyped {
  kind: 'Logical';
  op: '&&' | '||';
  left: BExpr;
  right: BExpr;
}

/** `==` or `!=` on references: the same object (or both null). */
export interface BRefEquals extends BTyped {
  kind: 'RefEquals';
  negate: boolean;
  left: BExpr;
  right: BExpr;
}

/** String concatenation; each side becomes a String by string conversion. */
export interface BConcat extends BTyped {
  kind: 'Concat';
  left: BExpr;
  right: BExpr;
}

export interface BAssign extends BTyped {
  kind: 'Assign';
  target: BLValue;
  value: BExpr;
}

/**
 * `x op= v`: read x, apply op (string concatenation for `+=` on a String),
 * and convert back to x's type (JLS §15.26.2).
 */
export interface BCompoundAssign extends BTyped {
  kind: 'CompoundAssign';
  op: A.BinaryOp;
  concat: boolean;
  target: BLValue;
  value: BExpr;
}

export interface BConditional extends BTyped {
  kind: 'Conditional';
  cond: BExpr;
  then: BExpr;
  else: BExpr;
}

/**
 * A conversion (JLS chapter 5): primitive widening or narrowing, boxing,
 * unboxing (a NullPointerException for null), or a checked reference cast
 * (ClassCastException).
 */
export interface BConvert extends BTyped {
  kind: 'Convert';
  conversion: 'widen' | 'narrow' | 'box' | 'unbox' | 'checkcast';
  expr: BExpr;
}

export interface BInstanceOf extends BTyped {
  kind: 'InstanceOf';
  expr: BExpr;
  target: JType;
  /** The variable a pattern binds (`o instanceof String s`). */
  binding?: LocalSymbol;
}

export interface BSwitchExpr extends BTyped {
  kind: 'SwitchExpr';
  switch: BSwitch;
}

/** A construct JavaTutor can't run yet: running it is an UnsupportedFeatureError, so the steps before it remain. */
export interface BUnsupportedExpr extends BTyped {
  kind: 'Unsupported';
  construct: string;
  /** "isn't supported" rather than "aren't supported". */
  singular?: boolean;
}

// ── Statements ──

export type BStmt =
  | BBlock | BLocalDecl | BExprStmt | BIf | BWhile | BDoWhile | BFor | BForEach | BLabeled
  | BSwitchStmt | BBreak | BContinue | BReturn | BThrow | BYield | BTry | BSynchronized
  | BAssert | BEmpty | BUnsupportedStmt;

export interface BBlock extends BNode {
  kind: 'Block';
  statements: BStmt[];
}

export interface BLocalDecl extends BNode {
  kind: 'LocalDecl';
  declarators: { local: LocalSymbol; init?: BExpr; range: A.Range }[];
}

export interface BExprStmt extends BNode {
  kind: 'ExprStmt';
  expr: BExpr;
}

export interface BIf extends BNode {
  kind: 'If';
  cond: BExpr;
  then: BStmt;
  else?: BStmt;
}

export interface BWhile extends BNode {
  kind: 'While';
  cond: BExpr;
  body: BStmt;
}

export interface BDoWhile extends BNode {
  kind: 'DoWhile';
  body: BStmt;
  cond: BExpr;
}

export interface BFor extends BNode {
  kind: 'For';
  init: BStmt[];
  cond?: BExpr;
  update: BExpr[];
  body: BStmt;
}

/**
 * `for (T x : xs)` over an array or an Iterable. Each element is converted
 * to the variable's type (`element` is that conversion applied to a
 * placeholder Local of the element type).
 */
export interface BForEach extends BNode {
  kind: 'ForEach';
  local: LocalSymbol;
  iterable: BExpr;
  overArray: boolean;
  element: BExpr;
  elementSource: LocalSymbol;
  body: BStmt;
}

export interface BLabeled extends BNode {
  kind: 'Labeled';
  label: string;
  body: BStmt;
}

/** What a case label matches. */
export type BCaseLabel =
  | { kind: 'default' }
  | { kind: 'null' }
  | { kind: 'constant'; value: ConstValue }
  | { kind: 'enum'; name: string }
  | { kind: 'pattern'; type: JType; binding?: LocalSymbol }
  | { kind: 'unsupported'; construct: string };

export interface BSwitchCase extends BNode {
  labels: BCaseLabel[];
  guard?: BExpr;
  /** A colon group's statements (falling through to the next group), or an arrow rule's body. */
  body: BStmt[];
  /** For an arrow rule whose body is an expression: its value (a switch expression's result). */
  value?: BExpr;
}

export interface BSwitch extends BNode {
  selector: BExpr;
  /** How the selector is compared: as a number (int, char, …, unboxed), a String, an enum constant, or by patterns. */
  selectorKind: 'number' | 'string' | 'enum' | 'pattern';
  arrow: boolean;
  cases: BSwitchCase[];
}

export interface BSwitchStmt extends BNode {
  kind: 'SwitchStmt';
  switch: BSwitch;
}

export interface BBreak extends BNode {
  kind: 'Break';
  label?: string;
}

export interface BContinue extends BNode {
  kind: 'Continue';
  label?: string;
}

/** `return v`, v converted to the method's return type. */
export interface BReturn extends BNode {
  kind: 'Return';
  value?: BExpr;
}

export interface BThrow extends BNode {
  kind: 'Throw';
  value: BExpr;
}

export interface BYield extends BNode {
  kind: 'Yield';
  value: BExpr;
}

export interface BCatch extends BNode {
  types: ClassSymbol[];
  local: LocalSymbol;
  body: BBlock;
}

export interface BTry extends BNode {
  kind: 'Try';
  /** try-with-resources: declarations, or existing variables. */
  resources: (BLocalDecl | BExpr)[];
  block: BBlock;
  catches: BCatch[];
  finally?: BBlock;
}

export interface BSynchronized extends BNode {
  kind: 'Synchronized';
  lock: BExpr;
  body: BBlock;
}

export interface BAssert extends BNode {
  kind: 'Assert';
  cond: BExpr;
  message?: BExpr;
}

export interface BEmpty extends BNode {
  kind: 'Empty';
}

export interface BUnsupportedStmt extends BNode {
  kind: 'Unsupported';
  construct: string;
  singular?: boolean;
}

// ── Classes and methods ──

/** A field initializer or initializer block, in the order the class runs them. */
export type BInitializer =
  | { kind: 'field'; field: FieldSymbol; value: BExpr; range: A.Range }
  | { kind: 'block'; body: BBlock; range: A.Range };

export interface BMethod {
  symbol: MethodSymbol;
  params: LocalSymbol[];
  /** A constructor's `this(…)` or `super(…)` (an implicit `super()` has no node). */
  explicitCall?: { target: 'this' | 'super'; ctor?: MethodSymbol; args: BExpr[]; range: A.Range };
  body?: BBlock;
}

export interface BClass {
  symbol: ClassSymbol;
  /** Static field initializers and static blocks, in textual order. */
  staticInit: BInitializer[];
  /** Instance field initializers and instance blocks, in textual order. */
  instanceInit: BInitializer[];
  methods: BMethod[];
  constructors: BMethod[];
}

export interface BProgram {
  classes: BClass[];
  /** The first class declaring `static void main(String[])`. */
  entry?: ClassSymbol;
  main?: MethodSymbol;
}
