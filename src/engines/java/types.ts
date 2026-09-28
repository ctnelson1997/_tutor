/**
 * Java Runtime Type System
 *
 * Represents Java values during interpretation. Primitives are stored inline,
 * objects/arrays are stored on a heap and referenced by ID.
 */

import { floatToString } from './numeric';

export type JavaPrimitiveType = 'int' | 'double' | 'boolean' | 'char' | 'long' | 'float' | 'byte' | 'short';
export type JavaType = JavaPrimitiveType | 'String' | 'void' | 'null' | string; // string for class names

/**
 * A primitive value. A long is a bigint, a boolean a boolean, and every other
 * type a number within its range (a float rounded to single precision); see
 * numeric.ts.
 */
export interface JavaPrimitive {
  kind: 'primitive';
  javaType: JavaPrimitiveType;
  value: number | boolean | bigint;
}

export interface JavaString {
  kind: 'string';
  value: string;
}

export interface JavaNull {
  kind: 'null';
}

export interface JavaArrayRef {
  kind: 'arrayRef';
  heapId: string;
}

export interface JavaObjectRef {
  kind: 'objectRef';
  heapId: string;
  className: string;
}

export type JavaValue = JavaPrimitive | JavaString | JavaNull | JavaArrayRef | JavaObjectRef;

export interface JavaArray {
  elementType: JavaType;
  elements: JavaValue[];
}

export interface JavaObject {
  className: string;
  fields: Map<string, JavaValue>;
  /**
   * Made by the standard library (a collection, Scanner, StringBuilder, a
   * library exception, …). How an object is drawn, printed and dispatched
   * depends on this, not on its class name, since a user class may be called
   * LinkedList or Stack too.
   */
  builtin?: boolean;
}

/** Is this heap entry a standard-library object (see JavaObject.builtin)? */
export function isBuiltinObject(entry: JavaHeapEntry | undefined): entry is JavaObject {
  return entry !== undefined && isJavaObject(entry) && entry.builtin === true;
}

export type JavaHeapEntry = JavaArray | JavaObject;

export function isJavaArray(entry: JavaHeapEntry): entry is JavaArray {
  return 'elements' in entry;
}

export function isJavaObject(entry: JavaHeapEntry): entry is JavaObject {
  return 'className' in entry && 'fields' in entry;
}

export function defaultValue(type: JavaType): JavaValue {
  switch (type) {
    case 'int': case 'byte': case 'short':
      return { kind: 'primitive', javaType: type, value: 0 };
    case 'long':
      return { kind: 'primitive', javaType: 'long', value: 0n };
    case 'float': case 'double':
      return { kind: 'primitive', javaType: type, value: 0.0 };
    case 'boolean':
      return { kind: 'primitive', javaType: 'boolean', value: false };
    case 'char':
      return { kind: 'primitive', javaType: 'char', value: 0 };
    default:
      return { kind: 'null' };
  }
}

/** A value as a JS number, for contexts that need one (an index, a size). A long beyond 2^53 loses precision. */
export function javaValueToNumber(val: JavaValue): number {
  if (val.kind === 'primitive') return typeof val.value === 'boolean' ? (val.value ? 1 : 0) : Number(val.value);
  if (val.kind === 'string') return parseFloat(val.value) || 0;
  return 0;
}

export function javaValueToBoolean(val: JavaValue): boolean {
  if (val.kind === 'primitive') {
    if (val.javaType === 'boolean') return val.value as boolean;
    return typeof val.value === 'bigint' ? val.value !== 0n : val.value !== 0;
  }
  if (val.kind === 'null') return false;
  return true;
}

export function javaValueToString(val: JavaValue, heap: Map<string, JavaHeapEntry>): string {
  switch (val.kind) {
    case 'primitive':
      if (val.javaType === 'char') return String.fromCharCode(val.value as number);
      if (val.javaType === 'boolean') return val.value ? 'true' : 'false';
      if (val.javaType === 'float') return floatToString(val.value as number);
      if (val.javaType === 'double') {
        const n = val.value as number;
        if (Object.is(n, -0)) return '-0.0';
        return Number.isInteger(n) ? n + '.0' : String(n);
      }
      return String(val.value); // a long's bigint prints without an n
    case 'string':
      return val.value;
    case 'null':
      return 'null';
    case 'arrayRef': {
      const arr = heap.get(val.heapId);
      if (!arr || !isJavaArray(arr)) return 'null';
      const elems = arr.elements.map(e => javaValueToString(e, heap));
      return '[' + elems.join(', ') + ']';
    }
    case 'objectRef': {
      const obj = heap.get(val.heapId);
      // Only library objects have these forms; a user class named LinkedList prints as LinkedList@id.
      if (isBuiltinObject(obj)) {
        // StringBuilder / StringBuffer -> their accumulated text
        if (val.className === 'StringBuilder' || val.className === 'StringBuffer') {
          const v = obj.fields.get('value');
          if (v && v.kind === 'string') return v.value;
        }
        // Map.Entry -> key=value
        if (val.className === 'MapEntry') {
          const k = obj.fields.get('key'), v = obj.fields.get('value');
          if (k && v) return javaValueToString(k, heap) + '=' + javaValueToString(v, heap);
        }
        // Maps -> {k=v, ...}
        const keysRef = obj.fields.get('__keys__');
        const valuesRef = obj.fields.get('__values__');
        if (keysRef?.kind === 'arrayRef' && valuesRef?.kind === 'arrayRef') {
          const ks = heap.get(keysRef.heapId), vs = heap.get(valuesRef.heapId);
          if (ks && isJavaArray(ks) && vs && isJavaArray(vs)) {
            return '{' + ks.elements
              .map((k, i) => javaValueToString(k, heap) + '=' + javaValueToString(vs.elements[i], heap))
              .join(', ') + '}';
          }
        }
        // Lists / sets / queues / stacks -> [a, b, c]
        const dataRef = obj.fields.get('__data__');
        if (dataRef?.kind === 'arrayRef') {
          const d = heap.get(dataRef.heapId);
          if (d && isJavaArray(d)) {
            return '[' + d.elements.map(e => javaValueToString(e, heap)).join(', ') + ']';
          }
        }
      }
      return val.className + '@' + val.heapId;
    }
  }
}

export function javaValuesEqual(a: JavaValue, b: JavaValue): boolean {
  if (a.kind === 'null' && b.kind === 'null') return true;
  if (a.kind === 'null' || b.kind === 'null') return false;
  if (a.kind === 'primitive' && b.kind === 'primitive') {
    // A long (bigint) against another type compares by value.
    return typeof a.value === typeof b.value ? a.value === b.value : Number(a.value) === Number(b.value);
  }
  if (a.kind === 'string' && b.kind === 'string') return a.value === b.value;
  if (a.kind === 'arrayRef' && b.kind === 'arrayRef') return a.heapId === b.heapId;
  if (a.kind === 'objectRef' && b.kind === 'objectRef') return a.heapId === b.heapId;
  return false;
}

/** Create a JavaValue for an int literal */
export function javaInt(n: number): JavaPrimitive {
  return { kind: 'primitive', javaType: 'int', value: n | 0 };
}

export function javaDouble(n: number): JavaPrimitive {
  return { kind: 'primitive', javaType: 'double', value: n };
}

export function javaLong(n: bigint): JavaPrimitive {
  return { kind: 'primitive', javaType: 'long', value: BigInt.asIntN(64, n) };
}

/** A float, rounded to single precision. */
export function javaFloat(n: number): JavaPrimitive {
  return { kind: 'primitive', javaType: 'float', value: Math.fround(n) };
}

export function javaBool(b: boolean): JavaPrimitive {
  return { kind: 'primitive', javaType: 'boolean', value: b };
}

export function javaChar(c: number): JavaPrimitive {
  return { kind: 'primitive', javaType: 'char', value: c };
}

export function javaString(s: string): JavaString {
  return { kind: 'string', value: s };
}

export function javaNull(): JavaNull {
  return { kind: 'null' };
}
