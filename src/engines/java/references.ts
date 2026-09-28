/**
 * The reference model: the places a Java program can store a value (JLS §4.12,
 * "variables"). That is a local variable or parameter, a static field, an
 * instance field, or an array element.
 *
 * Every write goes through a Reference: `=`, each compound operator, and prefix
 * and postfix `++`/`--`. So a write lands exactly on the variable the source
 * names. Null and bounds checks run when a reference is accessed, not when it
 * is created. That gives Java's evaluation order for free:
 *   - `a[i] = e` evaluates `a`, then `i`, then `e`, and only then checks `a`
 *     for null and `i` against the length (JLS §15.26.1);
 *   - `a[i] += e` reads the element first, so it checks before evaluating `e`
 *     (JLS §15.26.2).
 *
 * This module doesn't depend on the interpreter, so the planned core rewrite
 * (#12–#14) can reuse it.
 */
import {
  type JavaValue,
  type JavaType,
  type JavaPrimitiveType,
  type JavaHeapEntry,
  isJavaArray,
  isJavaObject,
} from './types';
import { InterpreterError, JavaRuntimeError, nullPointer } from './errors';

export interface Reference {
  /** Read the variable. */
  get(): JavaValue;
  /** Store a value, after assignment conversion to the declared type. Returns the value stored. */
  set(value: JavaValue): JavaValue;
  /** The variable's declared type, used for compound-assignment and `++`/`--` narrowing. */
  readonly declaredType: JavaType;
}

/** A variable as a scope stores it. */
export interface VariableSlot {
  value: JavaValue;
  type: JavaType;
  /**
   * A local declared without an initializer (`int count;`) that hasn't been
   * assigned yet. Java gives it no value: it isn't drawn, and reading it is an
   * error (javac rejects such a read, JLS §16), so it can never be read in a
   * program javac accepts.
   */
  unassigned?: boolean;
}

/** Reading a local that has no value yet (see VariableSlot.unassigned). */
export function notInitialized(name: string, line: number): InterpreterError {
  return new InterpreterError(`Variable '${name}' might not have been initialized`, line);
}

/**
 * Assignment conversion (JLS §5.2): widen a numeric primitive to the declared
 * type of the variable, parameter, field or array element it is stored in.
 *
 * Without this, `double x = 1;` would store the int *literal's* type, so a later
 * `target / x` would run integer division instead of floating-point division
 * (the √2013 Newton's-method regression in behavior-comparison.test.ts). This is
 * JLS widening primitive conversion (int/char/short/byte/long/float → double,
 * and so on). It intentionally does NOT narrow (e.g. double → int), since real
 * Java requires an explicit cast there.
 */
export function assignmentConversion(value: JavaValue, type: JavaType): JavaValue {
  if (value.kind !== 'primitive' || typeof value.value !== 'number') return value;
  if (type === 'double' || type === 'float') {
    if (value.javaType !== type) {
      return { kind: 'primitive', javaType: type as JavaPrimitiveType, value: value.value };
    }
  } else if (type === 'long') {
    if (value.javaType === 'int' || value.javaType === 'char' || value.javaType === 'short' || value.javaType === 'byte') {
      return { kind: 'primitive', javaType: 'long', value: value.value };
    }
  }
  return value;
}

/** A local variable, parameter or static field. `name` and `line` report a read of a local that has no value yet. */
export function slotReference(slot: VariableSlot, name = '', line = 0): Reference {
  return {
    declaredType: slot.type,
    get: () => {
      if (slot.unassigned) throw notInitialized(name, line);
      return slot.value;
    },
    set: value => {
      if (slot.unassigned) slot.unassigned = false;
      return (slot.value = assignmentConversion(value, slot.type));
    },
  };
}

/**
 * The field `name` of the object that `target` evaluated to. `targetText` is the
 * source text of the target expression. It names the null value in the
 * NullPointerException message, the way Java's helpful NPE messages do.
 */
export function fieldReference(
  heap: Map<string, JavaHeapEntry>,
  target: JavaValue,
  name: string,
  declaredType: JavaType,
  targetText: string,
  line: number,
): Reference {
  const fields = (access: 'read' | 'assign') => {
    if (target.kind === 'null') {
      throw nullPointer(`Cannot ${access} field "${name}" because "${targetText}" is null`, line);
    }
    const obj = target.kind === 'objectRef' ? heap.get(target.heapId) : undefined;
    if (!obj || !isJavaObject(obj)) {
      throw new InterpreterError(`Cannot ${access === 'read' ? 'read' : 'write'} field '${name}': '${targetText}' is not an object`, line);
    }
    if (!obj.fields.has(name)) throw new InterpreterError(`Field '${name}' does not exist on ${obj.className}`, line);
    return obj.fields;
  };
  return {
    declaredType,
    get: () => fields('read').get(name)!,
    set: value => {
      const stored = assignmentConversion(value, declaredType);
      fields('assign').set(name, stored);
      return stored;
    },
  };
}

/** Element `index` of the array that `target` evaluated to. */
export function arrayElementReference(
  heap: Map<string, JavaHeapEntry>,
  target: JavaValue,
  index: number,
  targetText: string,
  line: number,
): Reference {
  const entry = target.kind === 'arrayRef' ? heap.get(target.heapId) : undefined;
  const elements = (access: 'load from' | 'store to') => {
    if (target.kind === 'null') {
      throw nullPointer(`Cannot ${access} array because "${targetText}" is null`, line);
    }
    if (!entry || !isJavaArray(entry)) throw new InterpreterError(`'${targetText}' is not an array`, line);
    const length = entry.elements.length;
    if (!Number.isInteger(index) || index < 0 || index >= length) {
      throw new JavaRuntimeError('ArrayIndexOutOfBoundsException', `Index ${index} out of bounds for length ${length}`, line);
    }
    return entry.elements;
  };
  const declaredType = entry && isJavaArray(entry) ? entry.elementType : 'Object';
  return {
    declaredType,
    get: () => elements('load from')[index],
    set: value => {
      const stored = assignmentConversion(value, declaredType);
      elements('store to')[index] = stored;
      return stored;
    },
  };
}

/** `target.length` for an array value. */
export function arrayLength(
  heap: Map<string, JavaHeapEntry>,
  target: JavaValue,
  targetText: string,
  line: number,
): number {
  if (target.kind === 'null') {
    throw nullPointer(`Cannot read the array length because "${targetText}" is null`, line);
  }
  const entry = target.kind === 'arrayRef' ? heap.get(target.heapId) : undefined;
  if (!entry || !isJavaArray(entry)) throw new InterpreterError(`'${targetText}' is not an array`, line);
  return entry.elements.length;
}
