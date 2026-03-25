/**
 * Java Runtime Type System
 *
 * Represents Java values during interpretation. Primitives are stored inline,
 * objects/arrays are stored on a heap and referenced by ID.
 */

export type JavaPrimitiveType = 'int' | 'double' | 'boolean' | 'char' | 'long' | 'float' | 'byte' | 'short';
export type JavaType = JavaPrimitiveType | 'String' | 'void' | 'null' | string; // string for class names

export interface JavaPrimitive {
  kind: 'primitive';
  javaType: JavaPrimitiveType;
  value: number | boolean;
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
    case 'int': case 'byte': case 'short': case 'long':
      return { kind: 'primitive', javaType: type, value: 0 };
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

export function javaValueToNumber(val: JavaValue): number {
  if (val.kind === 'primitive') return typeof val.value === 'boolean' ? (val.value ? 1 : 0) : val.value;
  if (val.kind === 'string') return parseFloat(val.value) || 0;
  return 0;
}

export function javaValueToBoolean(val: JavaValue): boolean {
  if (val.kind === 'primitive') {
    if (val.javaType === 'boolean') return val.value as boolean;
    return (val.value as number) !== 0;
  }
  if (val.kind === 'null') return false;
  return true;
}

export function javaValueToString(val: JavaValue, heap: Map<string, JavaHeapEntry>): string {
  switch (val.kind) {
    case 'primitive':
      if (val.javaType === 'char') return String.fromCharCode(val.value as number);
      if (val.javaType === 'boolean') return val.value ? 'true' : 'false';
      if (val.javaType === 'double' || val.javaType === 'float') {
        const n = val.value as number;
        return Number.isInteger(n) ? n + '.0' : String(n);
      }
      return String(val.value);
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
    case 'objectRef':
      return val.className + '@' + val.heapId;
  }
}

export function javaValuesEqual(a: JavaValue, b: JavaValue): boolean {
  if (a.kind === 'null' && b.kind === 'null') return true;
  if (a.kind === 'null' || b.kind === 'null') return false;
  if (a.kind === 'primitive' && b.kind === 'primitive') return a.value === b.value;
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
