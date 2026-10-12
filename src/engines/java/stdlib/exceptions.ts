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

/** Construct a built-in exception object carrying an optional detail message. */
export function newException(className: string, args: JavaValue[], ctx: StdlibContext): JavaValue {
  const hasMsg = args.length > 0 && args[0].kind !== 'null';
  const fields = new Map<string, JavaValue>([
    // A String message is kept as it is, so getMessage() returns the same object.
    ['message', hasMsg ? (args[0].kind === 'string' ? args[0] : javaString(javaValueToString(args[0], ctx.heap))) : javaNull()],
  ]);
  const heapId = ctx.allocObject(className, fields);
  return { kind: 'objectRef', heapId, className };
}

/** Read the stored detail message of a (built-in or user) exception object, or null. */
function messageOf(ref: JavaValue, ctx: StdlibContext): JavaValue {
  if (ref.kind !== 'objectRef') return javaNull();
  const obj = ctx.heap.get(ref.heapId);
  if (obj && isJavaObject(obj)) {
    const m = obj.fields.get('message') ?? obj.fields.get('detailMessage') ?? obj.fields.get('msg');
    if (m) return m;
  }
  return javaNull();
}

/**
 * `ClassName` or `ClassName: message` — the format `Throwable.toString()` uses,
 * and what `System.out.println(exception)` shows. Returns undefined for a
 * non-object value.
 */
export function formatException(
  ref: JavaValue,
  heap: Map<string, JavaHeapEntry>,
  binaryName: (className: string) => string = qualifiedExceptionName,
): string | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = heap.get(ref.heapId);
  if (!obj || !isJavaObject(obj)) return undefined;
  const m = obj.fields.get('message') ?? obj.fields.get('detailMessage') ?? obj.fields.get('msg');
  const msg = m && m.kind !== 'null' ? javaValueToString(m, heap) : null;
  const name = binaryName(ref.className);
  return msg === null ? name : `${name}: ${msg}`;
}

/**
 * Instance methods common to all Throwables. Works for built-in exception
 * objects and, as a fallback, any object with a `message`-like field.
 */
export function exceptionMethod(ref: JavaValue, method: string, ctx: StdlibContext): JavaValue | undefined {
  switch (method) {
    case 'getMessage':
    case 'getLocalizedMessage':
      return messageOf(ref, ctx);
    case 'toString':
      return javaString(formatException(ref, ctx.heap, ctx.binaryName) ?? '');
    case 'printStackTrace':
      ctx.writeStdout((formatException(ref, ctx.heap, ctx.binaryName) ?? '') + '\n');
      return javaNull();
    case 'getCause': {
      if (ref.kind !== 'objectRef') return javaNull();
      const obj = ctx.heap.get(ref.heapId);
      return (obj && isJavaObject(obj) && obj.fields.get('cause')) || javaNull();
    }
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
