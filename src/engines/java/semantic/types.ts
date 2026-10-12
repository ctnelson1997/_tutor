/**
 * Static types (#13): what javac knows about every expression, so overloads,
 * conversions and boxing follow the declared types rather than the values.
 *
 * - `class` types refer to a ClassSymbol and carry type arguments (none for a
 *   raw or non-generic type); a type argument may be a wildcard.
 * - `typevar` is a class's or method's type parameter, erased to its bound.
 * - `dynamic` is a library value whose type isn't modeled (a method missing
 *   from the stubs): it is checked when the program runs.
 * - `error` follows a reported problem, so it isn't reported twice.
 *
 * Conversions follow JLS chapter 5: `assignable` (assignment context, §5.2),
 * `invocable` (strict and loose invocation, §5.3), `castable` (§5.5), and the
 * numeric promotions (§5.6).
 */

import type { PrimitiveName } from '../ast/ast';
import type { ClassSymbol } from './symbols';

export type JType = PrimitiveT | ClassT | ArrayT | TypeVarT | WildcardT | NullT | VoidT | DynamicT | ErrorT;

export interface PrimitiveT { tag: 'primitive'; name: PrimitiveName }
export interface ClassT { tag: 'class'; symbol: ClassSymbol; args: JType[] }
export interface ArrayT { tag: 'array'; component: JType }
export interface TypeVarT { tag: 'typevar'; name: string; bound: JType; id: number }
export interface WildcardT { tag: 'wildcard'; kind: 'extends' | 'super' | 'unbounded'; bound?: JType }
export interface NullT { tag: 'null' }
export interface VoidT { tag: 'void' }
export interface DynamicT { tag: 'dynamic' }
export interface ErrorT { tag: 'error' }

const primitives = new Map<PrimitiveName, PrimitiveT>();
export function primitive(name: PrimitiveName): PrimitiveT {
  let t = primitives.get(name);
  if (!t) primitives.set(name, (t = { tag: 'primitive', name }));
  return t;
}

export const INT = primitive('int');
export const LONG = primitive('long');
export const FLOAT = primitive('float');
export const DOUBLE = primitive('double');
export const BOOLEAN = primitive('boolean');
export const CHAR = primitive('char');
export const BYTE = primitive('byte');
export const SHORT = primitive('short');
export const NULL: NullT = { tag: 'null' };
export const VOID: VoidT = { tag: 'void' };
export const DYNAMIC: DynamicT = { tag: 'dynamic' };
export const ERROR: ErrorT = { tag: 'error' };

export const classType = (symbol: ClassSymbol, args: JType[] = []): ClassT => ({ tag: 'class', symbol, args });
export const arrayOf = (component: JType): ArrayT => ({ tag: 'array', component });

export const isPrimitive = (t: JType): t is PrimitiveT => t.tag === 'primitive';
export const isNumeric = (t: JType): t is PrimitiveT => t.tag === 'primitive' && t.name !== 'boolean';
export const isIntegral = (t: JType): t is PrimitiveT => t.tag === 'primitive' && ['byte', 'short', 'char', 'int', 'long'].includes(t.name);
export const isReference = (t: JType) => t.tag === 'class' || t.tag === 'array' || t.tag === 'typevar' || t.tag === 'null';
/** dynamic and error types go along with anything, so nothing is reported twice or guessed wrongly. */
export const isLoose = (t: JType) => t.tag === 'dynamic' || t.tag === 'error';

/** The wrapper class's simple name for a primitive, and back. */
export const BOX_OF: Record<PrimitiveName, string> = {
  int: 'Integer', long: 'Long', double: 'Double', float: 'Float', boolean: 'Boolean', char: 'Character', byte: 'Byte', short: 'Short',
};
export const UNBOX_OF: Record<string, PrimitiveName> = Object.fromEntries(Object.entries(BOX_OF).map(([p, b]) => [b, p as PrimitiveName]));

/** The primitive a wrapper type unboxes to, if it is one (java.lang.Integer etc.). */
export function unboxedType(t: JType): PrimitiveT | undefined {
  if (t.tag === 'typevar') return unboxedType(t.bound);
  if (t.tag !== 'class' || !t.symbol.isLibrary || t.symbol.packageName !== 'java.lang') return undefined;
  const p = UNBOX_OF[t.symbol.name];
  return p ? primitive(p) : undefined;
}

/** A type as javac writes it in a message: `int`, `String`, `List<Integer>`, `int[]`. */
export function typeName(t: JType): string {
  switch (t.tag) {
    case 'primitive': return t.name;
    case 'class': return t.args.length ? `${t.symbol.name}<${t.args.map(typeName).join(',')}>` : t.symbol.name;
    case 'array': return `${typeName(t.component)}[]`;
    case 'typevar': return t.name;
    case 'wildcard': return t.kind === 'unbounded' ? '?' : `? ${t.kind} ${typeName(t.bound!)}`;
    case 'null': return '<null>';
    case 'void': return 'void';
    case 'dynamic': return '<dynamic>';
    case 'error': return '<error>';
  }
}

/** The runtime type name the interpreter uses for a variable of this type (`int`, `String`, `Main$Point` as `Point`, `int[]`). */
export function runtimeTypeName(t: JType): string {
  const e = erasure(t);
  switch (e.tag) {
    case 'primitive': return e.name;
    case 'class': return e.symbol.name;
    case 'array': return `${runtimeTypeName(e.component)}[]`;
    default: return 'Object';
  }
}

/** The erasure (JLS §4.6): type arguments dropped, a type variable replaced by its bound. */
export function erasure(t: JType): JType {
  switch (t.tag) {
    case 'class': return t.args.length ? classType(t.symbol) : t;
    case 'array': return arrayOf(erasure(t.component));
    case 'typevar': return erasure(t.bound);
    case 'wildcard': return t.kind === 'extends' && t.bound ? erasure(t.bound) : DYNAMIC;
    default: return t;
  }
}

export function sameType(a: JType, b: JType): boolean {
  if (a === b) return true;
  if (a.tag !== b.tag) return false;
  switch (a.tag) {
    case 'primitive': return a.name === (b as PrimitiveT).name;
    case 'class': {
      const c = b as ClassT;
      return a.symbol === c.symbol && a.args.length === c.args.length && a.args.every((x, i) => sameType(x, c.args[i]));
    }
    case 'array': return sameType(a.component, (b as ArrayT).component);
    case 'typevar': return a.id === (b as TypeVarT).id;
    case 'wildcard': {
      const w = b as WildcardT;
      return a.kind === w.kind && (!a.bound || (!!w.bound && sameType(a.bound, w.bound)));
    }
    default: return true;
  }
}

// ── Substitution ──

/** Replace type variables by the types they stand for. */
export function substitute(t: JType, map: Map<number, JType>): JType {
  if (!map.size) return t;
  switch (t.tag) {
    case 'typevar': return map.get(t.id) ?? t;
    case 'class': return t.args.length ? classType(t.symbol, t.args.map(a => substitute(a, map))) : t;
    case 'array': return arrayOf(substitute(t.component, map));
    case 'wildcard': return t.bound ? { ...t, bound: substitute(t.bound, map) } : t;
    default: return t;
  }
}

/** What a wildcard type argument reads as: `? extends T` as T, `?` and `? super T` as its bound. */
export function readType(t: JType, fallback: JType): JType {
  if (t.tag !== 'wildcard') return t;
  return t.kind === 'extends' && t.bound ? t.bound : fallback;
}

/** The substitution a parameterized type implies for its class's type parameters (empty for a raw type). */
export function typeArgMap(t: ClassT): Map<number, JType> {
  const map = new Map<number, JType>();
  if (t.args.length !== t.symbol.typeParams.length) return map;
  t.symbol.typeParams.forEach((p, i) => map.set(p.id, readType(t.args[i], p.bound)));
  return map;
}

/** The direct supertypes of a class type, with its type arguments substituted in. */
export function directSupertypes(t: ClassT): ClassT[] {
  const map = typeArgMap(t);
  const raw = t.args.length === 0 && t.symbol.typeParams.length > 0;
  const subst = (s: ClassT) => (raw ? classType(s.symbol) : (substitute(s, map) as ClassT));
  const supers = [...(t.symbol.superclass ? [t.symbol.superclass] : []), ...t.symbol.interfaces];
  return supers.map(subst);
}

/** `t` seen as (a parameterization of) `target`'s class, if it is a subtype: `ArrayList<String>` as `List` is `List<String>`. */
export function asSuper(t: JType, target: ClassSymbol): ClassT | undefined {
  if (t.tag === 'typevar') return asSuper(t.bound, target);
  if (t.tag !== 'class') return undefined;
  if (t.symbol === target) return t;
  for (const s of directSupertypes(t)) {
    const found = asSuper(s, target);
    if (found) return found;
  }
  return undefined;
}

// ── Subtyping and conversions ──

/** Primitive widening (JLS §5.1.2): byte → short → int → long → float → double, char → int. */
const WIDER: Record<PrimitiveName, PrimitiveName[]> = {
  byte: ['short', 'int', 'long', 'float', 'double'],
  short: ['int', 'long', 'float', 'double'],
  char: ['int', 'long', 'float', 'double'],
  int: ['long', 'float', 'double'],
  long: ['float', 'double'],
  float: ['double'],
  double: [],
  boolean: [],
};

export const widensTo = (from: PrimitiveT, to: PrimitiveT) => from.name === to.name || WIDER[from.name].includes(to.name);

/** The type system's view of a few library classes it needs by name. */
export interface Builtins {
  object: ClassSymbol;
  string: ClassSymbol;
  cloneable: ClassSymbol;
  serializable: ClassSymbol;
  /** The wrapper class for a primitive. */
  box(p: PrimitiveName): ClassSymbol;
}

/** S <: T for reference types (JLS §4.10): class hierarchy (with type arguments), arrays, null. */
export function isSubtype(s: JType, t: JType, b: Builtins): boolean {
  if (isLoose(s) || isLoose(t)) return true;
  if (s.tag === 'primitive' || t.tag === 'primitive') return s.tag === 'primitive' && t.tag === 'primitive' && widensTo(s, t);
  if (s.tag === 'null') return t.tag !== 'void';
  if (t.tag === 'class' && t.symbol === b.object) return s.tag !== 'void';
  if (s.tag === 'typevar') return (t.tag === 'typevar' && s.id === t.id) || isSubtype(s.bound, t, b);
  if (t.tag === 'typevar') return false;
  if (s.tag === 'array') {
    if (t.tag === 'array') {
      if (s.component.tag === 'primitive' || t.component.tag === 'primitive') return sameType(s.component, t.component);
      return isSubtype(s.component, t.component, b);
    }
    return t.tag === 'class' && (t.symbol === b.cloneable || t.symbol === b.serializable);
  }
  if (s.tag !== 'class' || t.tag !== 'class') return false;
  const sup = asSuper(s, t.symbol);
  if (!sup) return false;
  // Raw types, and type arguments: unchecked conversion allows a raw type either way; otherwise contained arguments.
  if (!t.args.length || !sup.args.length) return true;
  return t.args.every((ta, i) => contains(ta, sup.args[i], b));
}

/** Type argument containment (JLS §4.5.1): `? extends Number` contains Integer. */
function contains(t: JType, s: JType, b: Builtins): boolean {
  if (t.tag !== 'wildcard') return isLoose(s) || isLoose(t) || sameType(t, s);
  if (t.kind === 'unbounded') return true;
  const sb = s.tag === 'wildcard' ? (s.kind === t.kind ? s.bound : undefined) : s;
  if (!sb) return false;
  return t.kind === 'extends' ? isSubtype(sb, t.bound!, b) : isSubtype(t.bound!, sb, b);
}

/**
 * Can a value of type `s` be passed to a parameter of type `t` (JLS §5.3)?
 * Strict: identity or widening (primitive or reference). Loose adds boxing
 * and unboxing (each optionally followed by widening).
 */
export function invocable(s: JType, t: JType, loose: boolean, b: Builtins): boolean {
  if (isLoose(s) || isLoose(t)) return true;
  if (isSubtype(s, t, b)) return true;
  if (!loose) return false;
  if (s.tag === 'primitive' && isReference(t)) return isSubtype(classType(b.box(s.name)), t, b);
  const unboxed = unboxedType(s);
  return t.tag === 'primitive' && unboxed !== undefined && widensTo(unboxed, t);
}

/**
 * Assignment conversion (JLS §5.2): loose invocation conversion, plus
 * narrowing of a constant int expression to byte, short or char (or their
 * wrappers) when the value fits.
 */
export function assignable(s: JType, t: JType, b: Builtins, constant?: number | bigint | boolean | string): boolean {
  if (invocable(s, t, true, b)) return true;
  if (typeof constant !== 'number' || s.tag !== 'primitive' || !['byte', 'short', 'char', 'int'].includes(s.name)) return false;
  const target = t.tag === 'primitive' ? t : unboxedType(t);
  if (!target) return false;
  const fits = (lo: number, hi: number) => constant >= lo && constant <= hi;
  if (target.name === 'byte') return fits(-128, 127);
  if (target.name === 'short') return fits(-32768, 32767);
  if (target.name === 'char') return fits(0, 65535);
  return false;
}

/** Can `s` be cast to `t` (JLS §5.5), roughly: any primitive pair but boolean, boxing/unboxing, and related reference types. */
export function castable(s: JType, t: JType, b: Builtins): boolean {
  if (isLoose(s) || isLoose(t)) return true;
  if (s.tag === 'primitive' && t.tag === 'primitive') return (s.name === 'boolean') === (t.name === 'boolean');
  if (s.tag === 'primitive') return invocable(s, t, true, b);
  if (t.tag === 'primitive') return invocable(s, t, true, b) || (s.tag === 'class' && s.symbol === b.object) || unboxedType(s) !== undefined;
  if (isSubtype(s, t, b) || isSubtype(t, s, b)) return true;
  // An interface can be cast to or from any class that isn't final.
  const iface = (x: JType) => x.tag === 'class' && x.symbol.kind === 'interface';
  const finalClass = (x: JType) => x.tag === 'class' && x.symbol.isFinal;
  if (iface(s) && t.tag === 'class' && !finalClass(t)) return true;
  if (iface(t) && s.tag === 'class' && !finalClass(s)) return true;
  return s.tag === 'typevar' || t.tag === 'typevar';
}

// ── Numeric promotion ──

/** Unary numeric promotion (JLS §5.6): byte, short and char become int. */
export function unaryPromote(t: PrimitiveT): PrimitiveT {
  return t.name === 'byte' || t.name === 'short' || t.name === 'char' ? INT : t;
}

/** Binary numeric promotion (JLS §5.6). */
export function binaryPromote(a: PrimitiveT, b: PrimitiveT): PrimitiveT {
  if (a.name === 'double' || b.name === 'double') return DOUBLE;
  if (a.name === 'float' || b.name === 'float') return FLOAT;
  if (a.name === 'long' || b.name === 'long') return LONG;
  return INT;
}

/** A numeric (or boolean) type, unboxed if it is a wrapper. */
export function primitiveOf(t: JType): PrimitiveT | undefined {
  return t.tag === 'primitive' ? t : unboxedType(t);
}
