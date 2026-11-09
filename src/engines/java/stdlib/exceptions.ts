/**
 * Exception support: a built-in exception type hierarchy, exception object
 * construction, instance methods (getMessage/toString/printStackTrace), and
 * assignability checks used by the interpreter's try/catch matching.
 *
 * Only the common java.lang / java.util exception types are modeled. User
 * classes are handled by the interpreter; the lenient assignability rule lets
 * `catch (Exception e)` still catch them.
 */

import {
  type JavaValue,
  type JavaHeapEntry,
  type ThrowableState,
  isJavaObject,
  javaValueToString,
  javaString,
  javaNull,
} from '../types';
import type { StdlibContext } from './context';

/** Maps each built-in exception class to its immediate supertype. */
export const EXCEPTION_SUPER: Record<string, string> = {
  Throwable: '',
  Error: 'Throwable',
  Exception: 'Throwable',
  RuntimeException: 'Exception',
  IllegalArgumentException: 'RuntimeException',
  NumberFormatException: 'IllegalArgumentException',
  IllegalFormatException: 'IllegalArgumentException',
  IllegalFormatConversionException: 'IllegalFormatException',
  IllegalFormatPrecisionException: 'IllegalFormatException',
  MissingFormatArgumentException: 'IllegalFormatException',
  UnknownFormatConversionException: 'IllegalFormatException',
  IllegalStateException: 'RuntimeException',
  NullPointerException: 'RuntimeException',
  IndexOutOfBoundsException: 'RuntimeException',
  ArrayIndexOutOfBoundsException: 'IndexOutOfBoundsException',
  StringIndexOutOfBoundsException: 'IndexOutOfBoundsException',
  ArithmeticException: 'RuntimeException',
  ClassCastException: 'RuntimeException',
  UnsupportedOperationException: 'RuntimeException',
  NoSuchElementException: 'RuntimeException',
  InputMismatchException: 'NoSuchElementException',
  ConcurrentModificationException: 'RuntimeException',
  EmptyStackException: 'RuntimeException',
  NegativeArraySizeException: 'RuntimeException',
  StackOverflowError: 'Error',
  OutOfMemoryError: 'Error',
  AssertionError: 'Error',
  LinkageError: 'Error',
  ExceptionInInitializerError: 'LinkageError',
  NoClassDefFoundError: 'LinkageError',
  IOException: 'Exception',
  FileNotFoundException: 'IOException',
  InterruptedException: 'Exception',
  CloneNotSupportedException: 'Exception',
};

export function isExceptionClass(name: string): boolean {
  return name in EXCEPTION_SUPER;
}

/** Packages of the library exception classes outside java.lang. */
const EXCEPTION_PACKAGE: Record<string, string> = {
  NoSuchElementException: 'java.util',
  InputMismatchException: 'java.util',
  ConcurrentModificationException: 'java.util',
  EmptyStackException: 'java.util',
  IllegalFormatException: 'java.util',
  IllegalFormatConversionException: 'java.util',
  IllegalFormatPrecisionException: 'java.util',
  MissingFormatArgumentException: 'java.util',
  UnknownFormatConversionException: 'java.util',
  IOException: 'java.io',
  FileNotFoundException: 'java.io',
};

/**
 * The name Throwable.toString() prints for a library exception class, with
 * its package: `java.lang.ArithmeticException`, `java.util.NoSuchElementException`.
 */
/** The package of a library exception class: java.lang unless listed. */
export function exceptionPackage(name: string): string {
  return EXCEPTION_PACKAGE[name] ?? 'java.lang';
}

export function qualifiedExceptionName(name: string): string {
  return isExceptionClass(name) ? `${EXCEPTION_PACKAGE[name] ?? 'java.lang'}.${name}` : name;
}

/** A Throwable's state (#64), made empty if the object has none yet; undefined for a value that isn't an object. */
export function throwableState(ref: JavaValue, heap: Map<string, JavaHeapEntry>): ThrowableState | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = heap.get(ref.heapId);
  if (!obj || !isJavaObject(obj)) return undefined;
  return (obj.throwable ??= { message: javaNull(), cause: javaNull(), causeSet: false, suppressed: [] });
}

/**
 * Throwable's state from its constructor's arguments, as the JDK's four
 * constructors set it (#64): (), (String message), (String message, Throwable
 * cause), and (Throwable cause), whose message is `cause.toString()` (null for
 * a null cause). `causeConstructor` says which one-argument constructor ran;
 * without it, an object is a cause and anything else a message.
 */
export function throwableFromArgs(args: JavaValue[], ctx: StdlibContext, causeConstructor?: boolean): ThrowableState {
  const state: ThrowableState = { message: javaNull(), cause: javaNull(), causeSet: false, suppressed: [] };
  // A String message is kept as it is, so getMessage() returns the same object.
  const message = (v: JavaValue) => (v.kind === 'string' || v.kind === 'null' ? v : javaString(javaValueToString(v, ctx.heap)));
  if (args.length >= 2) {
    state.message = message(args[0]);
    state.cause = args[1];
    state.causeSet = true;
  } else if (args.length === 1) {
    if (causeConstructor ?? args[0].kind === 'objectRef') {
      state.cause = args[0];
      state.causeSet = true;
      if (args[0].kind !== 'null') state.message = javaString(ctx.stringify ? ctx.stringify(args[0]) : formatException(args[0], ctx.heap, ctx.binaryName) ?? '');
    } else {
      state.message = message(args[0]);
    }
  }
  return state;
}

/** Construct a library exception object, as its constructor with these arguments makes it (#64). */
export function newException(className: string, args: JavaValue[], ctx: StdlibContext, causeConstructor?: boolean): JavaValue {
  const heapId = ctx.allocObject(className, new Map());
  const obj = ctx.heap.get(heapId);
  if (obj && isJavaObject(obj)) obj.throwable = throwableFromArgs(args, ctx, causeConstructor);
  return { kind: 'objectRef', heapId, className };
}

/**
 * `ClassName` or `ClassName: message`, the format `Throwable.toString()`
 * uses, and what `System.out.println(exception)` shows: with `message`, the
 * one its getLocalizedMessage() returned (the evaluator calls a program's
 * override, #64), else the detail message. Undefined for a non-object value.
 */
export function formatException(
  ref: JavaValue,
  heap: Map<string, JavaHeapEntry>,
  binaryName: (className: string) => string = qualifiedExceptionName,
  message?: JavaValue,
): string | undefined {
  const m = message ?? throwableState(ref, heap)?.message;
  if (ref.kind !== 'objectRef' || !m) return undefined;
  const name = binaryName(ref.className);
  return m.kind === 'null' ? name : `${name}: ${javaValueToString(m, heap)}`;
}

/**
 * Throwable's own instance methods on a library exception, for the stdlib's
 * callers; the evaluator implements them itself, so a program's
 * getMessage() override is called where Throwable calls it.
 */
export function exceptionMethod(ref: JavaValue, method: string, ctx: StdlibContext): JavaValue | undefined {
  const state = throwableState(ref, ctx.heap);
  if (!state) return undefined;
  switch (method) {
    case 'getMessage':
    case 'getLocalizedMessage':
      return state.message;
    case 'toString':
      return javaString(formatException(ref, ctx.heap, ctx.binaryName) ?? '');
    case 'printStackTrace':
      ctx.writeStdout((formatException(ref, ctx.heap, ctx.binaryName) ?? '') + '\n');
      return javaNull();
    case 'getCause':
      return state.cause;
    case 'getClass':
      // Minimal: a stand-in object whose getName()/toString the interpreter can stringify.
      return ref;
  }
  return undefined;
}

/**
 * Is an exception of runtime class `actual` catchable by a `catch (target e)`?
 * Walks the built-in supertype chain; for user exception classes (not in the
 * table) we can't know their `extends`, so we leniently allow the common base
 * types to catch them.
 */
export function exceptionAssignable(actual: string, target: string): boolean {
  let cur: string = actual;
  while (cur) {
    if (cur === target) return true;
    cur = EXCEPTION_SUPER[cur] ?? '';
  }
  if (!(actual in EXCEPTION_SUPER)) {
    return target === 'Exception' || target === 'Throwable' || target === 'RuntimeException';
  }
  return false;
}
