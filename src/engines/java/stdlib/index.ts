/**
 * Java standard-library subset, implemented as pure functions over a small
 * StdlibContext. Wired into the interpreter's method-dispatch, object-creation,
 * and for-each paths. See individual modules for coverage.
 */

export type { StdlibContext } from './context';
export { HaltSignal, StdlibError } from './context';
export { callStaticMethod, getStaticField } from './statics';
export { javaFormat } from './format';
export {
  newBuiltin,
  callInstanceMethod,
  getIterableElements,
  forEachIterator,
  isBuiltinCollection,
  scannerRemaining,
} from './collections';
export { LIST_LIKE, SET_LIKE, MAP_LIKE, VIEW_CLASSES, charArrayText } from './util';
export { hashCodeOf, identityHashCode } from './hashing';
export {
  isExceptionClass,
  newException,
  exceptionMethod,
  exceptionAssignable,
  formatException,
  qualifiedExceptionName,
} from './exceptions';
export { stringMethod, stringBuilderMethod, boxedMethod, newString, stringHashCode, boxedHashCode } from './strings';
export { isLibrarySubtype, isStringType, isBoxedInstanceOf, isKnownLibraryType } from './hierarchy';
