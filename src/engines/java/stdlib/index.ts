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
  isBuiltinCollection,
} from './collections';
export { LIST_LIKE, SET_LIKE, MAP_LIKE } from './util';
export {
  isExceptionClass,
  newException,
  exceptionMethod,
  exceptionAssignable,
  formatException,
} from './exceptions';
