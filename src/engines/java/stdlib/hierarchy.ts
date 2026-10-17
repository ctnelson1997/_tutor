/**
 * The supertypes of the library classes JavaTutor emulates, for `instanceof`,
 * casts and `catch` matching. A primitive value stored where an object is
 * expected stands for its box, so `Object o = 5; o instanceof Integer` holds.
 */

import type { JavaPrimitiveType } from '../types';
import { EXCEPTION_SUPER } from './exceptions';

/** Direct supertypes (superclass and interfaces) of the emulated library classes. */
const LIBRARY_SUPERTYPES: Record<string, readonly string[]> = {
  Iterable: [],
  Collection: ['Iterable'],
  SequencedCollection: ['Collection'],
  List: ['SequencedCollection'],
  Queue: ['Collection'],
  Deque: ['Queue', 'SequencedCollection'],
  Set: ['Collection'],
  SequencedSet: ['SequencedCollection', 'Set'],
  SortedSet: ['Set', 'SequencedSet'],
  NavigableSet: ['SortedSet'],
  Map: [],
  SequencedMap: ['Map'],
  SortedMap: ['SequencedMap'],
  NavigableMap: ['SortedMap'],
  AbstractCollection: ['Collection'],
  AbstractList: ['AbstractCollection', 'List'],
  AbstractSequentialList: ['AbstractList'],
  AbstractQueue: ['AbstractCollection', 'Queue'],
  AbstractSet: ['AbstractCollection', 'Set'],
  AbstractMap: ['Map'],
  ArrayList: ['AbstractList', 'RandomAccess', 'Cloneable', 'Serializable'],
  Vector: ['AbstractList', 'RandomAccess', 'Cloneable', 'Serializable'],
  Stack: ['Vector'],
  LinkedList: ['AbstractSequentialList', 'Deque', 'Cloneable', 'Serializable'],
  ArrayDeque: ['AbstractCollection', 'Deque', 'Cloneable', 'Serializable'],
  PriorityQueue: ['AbstractQueue', 'Serializable'],
  HashSet: ['AbstractSet', 'Cloneable', 'Serializable'],
  LinkedHashSet: ['HashSet', 'SequencedSet'],
  TreeSet: ['AbstractSet', 'NavigableSet', 'Cloneable', 'Serializable'],
  HashMap: ['AbstractMap', 'Cloneable', 'Serializable'],
  LinkedHashMap: ['HashMap', 'SequencedMap'],
  TreeMap: ['AbstractMap', 'NavigableMap', 'Cloneable', 'Serializable'],
  // The views (#21): a map's keySet(), values() and entrySet(), and a list's subList().
  KeySet: ['AbstractSet'],
  Values: ['AbstractCollection'],
  EntrySet: ['AbstractSet'],
  SubList: ['AbstractList', 'RandomAccess'],
  MapEntry: ['Entry'], // Map.Entry
  Iterator: [],
  Comparator: [],
  StringBuilder: ['CharSequence', 'Appendable', 'Comparable', 'Serializable'],
  StringBuffer: ['CharSequence', 'Appendable', 'Comparable', 'Serializable'],
  Scanner: ['Iterator', 'Closeable'],
  Closeable: ['AutoCloseable'],
  Random: ['RandomGenerator', 'Serializable'],
  Throwable: ['Serializable'],
};

/** What a String is, besides Object. */
const STRING_SUPERTYPES = new Set(['String', 'CharSequence', 'Comparable', 'Serializable', 'Constable', 'ConstantDesc']);

/** What a primitive value is when boxed (Object o = 5 holds an Integer), besides Object. */
const BOXED_SUPERTYPES: Record<JavaPrimitiveType, readonly string[]> = {
  int: ['Integer', 'Number', 'Comparable', 'Serializable', 'Constable', 'ConstantDesc'],
  long: ['Long', 'Number', 'Comparable', 'Serializable', 'Constable', 'ConstantDesc'],
  short: ['Short', 'Number', 'Comparable', 'Serializable', 'Constable'],
  byte: ['Byte', 'Number', 'Comparable', 'Serializable', 'Constable'],
  double: ['Double', 'Number', 'Comparable', 'Serializable', 'Constable', 'ConstantDesc'],
  float: ['Float', 'Number', 'Comparable', 'Serializable', 'Constable', 'ConstantDesc'],
  char: ['Character', 'Comparable', 'Serializable', 'Constable'],
  boolean: ['Boolean', 'Comparable', 'Serializable', 'Constable'],
};

const OTHER_KNOWN_TYPES = new Set([
  'Object', 'Number', 'Integer', 'Long', 'Short', 'Byte', 'Double', 'Float', 'Character', 'Boolean',
  'Comparable', 'Cloneable', 'Serializable', 'RandomAccess', 'Appendable', 'AutoCloseable', 'Entry',
  'RandomGenerator', 'Constable', 'ConstantDesc',
]);

function directSupertypes(className: string): readonly string[] {
  const listed = LIBRARY_SUPERTYPES[className];
  if (listed) return listed;
  const exceptionSuper = EXCEPTION_SUPER[className];
  return exceptionSuper ? [exceptionSuper] : [];
}

/** Is library class `className` the type `target` or a subtype of it? */
export function isLibrarySubtype(className: string, target: string): boolean {
  if (className === target || target === 'Object') return true;
  const seen = new Set<string>();
  const pending = [className];
  while (pending.length > 0) {
    const cls = pending.pop()!;
    if (cls === target) return true;
    if (seen.has(cls)) continue;
    seen.add(cls);
    pending.push(...directSupertypes(cls));
  }
  return false;
}

/** Is a String an instance of `target`? */
export function isStringType(target: string): boolean {
  return target === 'Object' || STRING_SUPERTYPES.has(target);
}

/** Is a primitive of type `type`, boxed, an instance of `target`? */
export function isBoxedInstanceOf(type: JavaPrimitiveType, target: string): boolean {
  return target === 'Object' || BOXED_SUPERTYPES[type].includes(target);
}

/** Does JavaTutor know this library type well enough to check a cast to it? */
export function isKnownLibraryType(name: string): boolean {
  return name in LIBRARY_SUPERTYPES || name in EXCEPTION_SUPER || STRING_SUPERTYPES.has(name) || OTHER_KNOWN_TYPES.has(name);
}
