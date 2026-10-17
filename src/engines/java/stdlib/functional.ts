/**
 * Functional values in the library (#16): calling a lambda, a method
 * reference or an object of a class that implements a functional interface
 * (the program's code, through StdlibContext.invokeUserMethod), the function
 * objects the library makes itself (Function.identity(), f.andThen(g),
 * Predicate.not(p), …), the functional interfaces' default methods, the
 * collections' methods that take functions (forEach, removeIf, replaceAll,
 * Map.computeIfAbsent, merge, …), and Optional.
 */

import {
  type JavaValue,
  type JavaObject,
  isBuiltinObject,
  isJavaObject,
  javaBool,
  javaInt,
  javaNull,
  javaString,
  javaValueToBoolean,
  javaValueToNumber,
  mapContents,
} from '../types';
import { type StdlibContext, StdlibError } from './context';
import { compareWith, libraryComparator, valuesEqual } from './util';

/** The library's own function objects, by class. */
export const FUNCTION_CLASSES = new Set(['Function', 'Predicate', 'Consumer']);

function npe(message = ''): StdlibError {
  return new StdlibError(message ? `NullPointerException: ${message}` : 'NullPointerException');
}

function objectOf(value: JavaValue, ctx: StdlibContext): JavaObject | undefined {
  if (value.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(value.heapId);
  return obj && isJavaObject(obj) ? obj : undefined;
}

/**
 * Call a function value's method (its interface's single abstract method):
 * a library comparator or function object, else the program's code. A null
 * function is a NullPointerException, as in Java.
 */
export function applyFunction(fn: JavaValue | undefined, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue {
  if (!fn || fn.kind === 'null') throw npe();
  const obj = objectOf(fn, ctx);
  if (obj && isBuiltinObject(obj)) {
    if (obj.className === 'Comparator') return javaInt(compareWith(fn, args[0], args[1], ctx));
    if (FUNCTION_CLASSES.has(obj.className)) return libraryFunction(obj, args, ctx);
  }
  const r = ctx.invokeUserMethod(fn, method, args);
  if (r === undefined) throw new StdlibError(`${fn.kind === 'objectRef' ? fn.className : fn.kind} can't be called as ${method}(), the method its use here needs`);
  return r;
}

/** A library function object of this kind, drawn with what it combines (`first`, `then`, `target`). */
export function libraryFunctionObject(cls: 'Function' | 'Predicate' | 'Consumer', kind: string, parts: Record<string, JavaValue>, arity: number, ctx: StdlibContext): JavaValue {
  const fields = new Map<string, JavaValue>([['kind', javaString(kind)], ...Object.entries(parts), ['__arity__', javaInt(arity)]]);
  return { kind: 'objectRef', heapId: ctx.allocObject(cls, fields), className: cls };
}

function libraryFunction(obj: JavaObject, args: JavaValue[], ctx: StdlibContext): JavaValue {
  const f = obj.fields;
  const kind = f.get('kind')?.kind === 'string' ? (f.get('kind') as { value: string }).value : '';
  const first = f.get('first'), then = f.get('then');
  switch (kind) {
    case 'identity': return args[0];
    case 'andThen': return applyFunction(then, 'apply', [applyFunction(first, 'apply', args, ctx)], ctx);
    case 'compose': return applyFunction(first, 'apply', [applyFunction(then, 'apply', args, ctx)], ctx);
    case 'and': return javaBool(javaValueToBoolean(applyFunction(first, 'test', args, ctx)) && javaValueToBoolean(applyFunction(then, 'test', args, ctx)));
    case 'or': return javaBool(javaValueToBoolean(applyFunction(first, 'test', args, ctx)) || javaValueToBoolean(applyFunction(then, 'test', args, ctx)));
    case 'negate': return javaBool(!javaValueToBoolean(applyFunction(first, 'test', args, ctx)));
    case 'isEqual': {
      const target = f.get('target') ?? javaNull();
      return javaBool(target.kind === 'null' ? args[0].kind === 'null' : args[0].kind !== 'null' && valuesEqual(target, args[0], ctx));
    }
    case 'consumerAndThen':
      applyFunction(first, 'accept', args, ctx);
      applyFunction(then, 'accept', args, ctx);
      return javaNull();
    case 'minBy': return compareWith(f.get('comparator'), args[0], args[1], ctx) <= 0 ? args[0] : args[1];
    case 'maxBy': return compareWith(f.get('comparator'), args[0], args[1], ctx) >= 0 ? args[0] : args[1];
    case 'entryKey': case 'entryValue': return entryPart(args[0], kind === 'entryKey', ctx);
  }
  throw new StdlibError(`A library function of kind ${kind} can't be called`);
}

/** A Map.Entry's key or value (an entrySet() entry shows its map's current value). */
function entryPart(entry: JavaValue, key: boolean, ctx: StdlibContext): JavaValue {
  const fields = objectOf(entry, ctx)?.fields;
  if (!fields) throw npe();
  const k = fields.get('key') ?? javaNull();
  if (key) return k;
  const map = fields.get('__map__');
  const mapObj = map ? objectOf(map, ctx) : undefined;
  const contents = mapObj ? mapContents(mapObj, ctx.heap) : undefined;
  const i = contents ? contents.keys.indexOf(k) : -1;
  return i >= 0 ? contents!.values[i] : fields.get('value') ?? javaNull();
}

/** The method name and arity of a function value (which interface it implements, for overloads decided when the program runs). */
export function functionShape(fn: JavaValue, ctx: StdlibContext): { name: string; arity: number } | undefined {
  const obj = objectOf(fn, ctx);
  if (obj && isBuiltinObject(obj)) {
    if (obj.className === 'Comparator') return { name: 'compare', arity: 2 };
    if (FUNCTION_CLASSES.has(obj.className)) {
      const arity = javaValueToNumber(obj.fields.get('__arity__') ?? javaInt(1));
      return { name: obj.className === 'Predicate' ? 'test' : obj.className === 'Consumer' ? 'accept' : 'apply', arity };
    }
    return undefined;
  }
  return ctx.functionShape?.(fn);
}

/**
 * A functional interface's default method on a function value (#16):
 * Comparator's reversed/thenComparing, Function's andThen/compose,
 * Predicate's and/or/negate, Consumer's andThen. The overload is chosen by
 * the shape of the function passed (a two-argument function is a
 * Comparator, a one-argument one a key extractor). Undefined for others.
 */
export function functionalMethod(ref: JavaValue, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const shape = functionShape(ref, ctx);
  if (!shape) return undefined;
  const isComparator = shape.name === 'compare';
  switch (method) {
    case 'reversed': return isComparator && args.length === 0 ? libraryComparator('reverse', ref, ctx) : undefined;
    case 'thenComparing': {
      if (!isComparator) return undefined;
      if (args[0]?.kind === 'null') throw npe();
      const second = args.length === 2 || functionShape(args[0], ctx)?.arity !== 2 ? comparing(args[0], args[1], 'comparing', ctx) : args[0];
      return libraryComparator('then', ref, ctx, { then: second });
    }
    case 'thenComparingInt': case 'thenComparingDouble': case 'thenComparingLong':
      if (!isComparator) return undefined;
      return libraryComparator('then', ref, ctx, { then: comparing(args[0], undefined, method.replace('then', 'c') as ComparingKind, ctx) });
    case 'andThen':
      if (shape.name === 'accept') return libraryFunctionObject('Consumer', 'consumerAndThen', { first: ref, then: args[0] }, shape.arity, ctx);
      if (shape.name === 'apply') return libraryFunctionObject('Function', 'andThen', { first: ref, then: args[0] }, shape.arity, ctx);
      return undefined;
    case 'compose': return shape.name === 'apply' ? libraryFunctionObject('Function', 'compose', { first: ref, then: args[0] }, 1, ctx) : undefined;
    case 'and': case 'or': return shape.name === 'test' ? libraryFunctionObject('Predicate', method, { first: ref, then: args[0] }, shape.arity, ctx) : undefined;
    case 'negate': return shape.name === 'test' ? libraryFunctionObject('Predicate', 'negate', { first: ref }, shape.arity, ctx) : undefined;
  }
  return undefined;
}

type ComparingKind = 'comparing' | 'comparingInt' | 'comparingDouble' | 'comparingLong';

/** Comparator.comparing(key) (and comparingInt, …): compares the keys the function extracts, by their natural order or `keyComparator`. */
export function comparing(key: JavaValue | undefined, keyComparator: JavaValue | undefined, kind: ComparingKind, ctx: StdlibContext): JavaValue {
  if (!key || key.kind === 'null') throw npe();
  return libraryComparator(kind, undefined, ctx, keyComparator ? { key, keyComparator } : { key });
}

/** The statics of the functional interfaces: Function.identity(), Predicate.not(p), Predicate.isEqual(x), BinaryOperator.minBy/maxBy, Map.Entry.comparingByKey/Value. */
export function functionStatic(className: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  switch (`${className}.${method}`) {
    case 'Function.identity': case 'UnaryOperator.identity': return libraryFunctionObject('Function', 'identity', {}, 1, ctx);
    case 'Predicate.not': return libraryFunctionObject('Predicate', 'negate', { first: args[0] }, 1, ctx);
    case 'Predicate.isEqual': return libraryFunctionObject('Predicate', 'isEqual', { target: args[0] }, 1, ctx);
    case 'BinaryOperator.minBy': case 'BinaryOperator.maxBy':
      return libraryFunctionObject('Function', method, { comparator: args[0] }, 2, ctx);
    case 'Entry.comparingByKey': case 'Entry.comparingByValue':
      return comparing(libraryFunctionObject('Function', method === 'comparingByKey' ? 'entryKey' : 'entryValue', {}, 1, ctx), undefined, 'comparing', ctx);
  }
  return undefined;
}

// ── Optional ──

const OPTIONALS = new Set(['Optional', 'OptionalInt', 'OptionalDouble']);

export function isOptionalClass(name: string): boolean {
  return OPTIONALS.has(name);
}

/** An Optional (or OptionalInt, OptionalDouble), drawn with its `value` (none when empty). */
export function makeOptional(cls: 'Optional' | 'OptionalInt' | 'OptionalDouble', value: JavaValue | undefined, ctx: StdlibContext): JavaValue {
  const fields = new Map<string, JavaValue>(value === undefined ? [] : [['value', value]]);
  return { kind: 'objectRef', heapId: ctx.allocObject(cls, fields), className: cls };
}

export function optionalStatic(className: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const cls = className as 'Optional' | 'OptionalInt' | 'OptionalDouble';
  switch (method) {
    case 'of':
      if (args[0]?.kind === 'null') throw npe();
      return makeOptional(cls, args[0], ctx);
    case 'ofNullable': return makeOptional(cls, args[0]?.kind === 'null' ? undefined : args[0], ctx);
    case 'empty': return makeOptional(cls, undefined, ctx);
  }
  return undefined;
}

/** Optional's methods: get/getAsInt (NoSuchElementException when empty), isPresent, isEmpty, orElse, orElseGet, orElseThrow, ifPresent, map, filter. */
export function optionalMethod(ref: JavaValue, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const obj = objectOf(ref, ctx)!;
  const value = obj.fields.get('value');
  const empty = () => new StdlibError('NoSuchElementException: No value present');
  switch (method) {
    case 'get': case 'getAsInt': case 'getAsDouble': case 'orElseThrow':
      if (value === undefined) throw empty();
      return value;
    case 'isPresent': return javaBool(value !== undefined);
    case 'isEmpty': return javaBool(value === undefined);
    case 'orElse': return value ?? args[0];
    case 'orElseGet': return value ?? applyFunction(args[0], 'get', [], ctx);
    case 'ifPresent':
      if (value !== undefined) applyFunction(args[0], 'accept', [value], ctx);
      return javaNull();
    case 'map': {
      if (value === undefined) return makeOptional('Optional', undefined, ctx);
      const mapped = applyFunction(args[0], 'apply', [value], ctx);
      return makeOptional('Optional', mapped.kind === 'null' ? undefined : mapped, ctx);
    }
    case 'filter':
      if (value === undefined || javaValueToBoolean(applyFunction(args[0], 'test', [value], ctx))) return ref;
      return makeOptional('Optional', undefined, ctx);
  }
  return undefined;
}

/** How an Optional prints: `Optional[x]`, `Optional.empty`, `OptionalInt[5]`. */
export function optionalText(obj: JavaObject, stringify: (v: JavaValue) => string): string {
  const value = obj.fields.get('value');
  return value === undefined ? `${obj.className}.empty` : `${obj.className}[${stringify(value)}]`;
}
