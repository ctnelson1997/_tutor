/**
 * Collection classes, Scanner, and Random.
 *
 * Lists/sets/queues store elements in a `__data__` backing array; maps use
 * parallel `__keys__` / `__values__` arrays (so keys keep their JavaValue type
 * and order — enabling typed keySet()/entrySet() and TreeMap ordering).
 *
 * `newBuiltin` handles `new X(...)`. `callInstanceMethod` dispatches `x.m(...)`.
 * Both return `undefined` when the class isn't one we manage, so the
 * interpreter falls through to user-defined class handling.
 */

import {
  type JavaValue,
  isJavaArray,
  javaValueToNumber,
  javaValueToString,
  javaInt,
  javaDouble,
  javaBool,
  javaString,
  javaNull,
} from '../types';
import { type StdlibContext, StdlibError } from './context';
import {
  LIST_LIKE, SET_LIKE, MAP_LIKE, isSorted,
  compareValues, valuesEqual, backingArray, mapArrays, syncSize, sortedInsert,
  allocCollection, allocMap,
} from './util';
import { isExceptionClass, newException, exceptionMethod } from './exceptions';

const ALL_BUILTIN = new Set<string>([
  ...LIST_LIKE, ...SET_LIKE, ...MAP_LIKE, 'Scanner', 'Random',
]);

export function isBuiltinCollection(className: string): boolean {
  return ALL_BUILTIN.has(className);
}

/** Copy the elements of a collection/array passed to a copy-constructor. */
function initialElements(arg: JavaValue | undefined, ctx: StdlibContext): JavaValue[] {
  if (!arg) return [];
  if (arg.kind === 'arrayRef') {
    const a = ctx.heap.get(arg.heapId);
    if (a && isJavaArray(a)) return a.elements.slice();
  }
  if (arg.kind === 'objectRef') {
    const data = backingArray(arg, ctx);
    if (data) return data.elements.slice();
  }
  return [];
}

export function newBuiltin(className: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  if (LIST_LIKE.has(className)) {
    const init = initialElements(args[0], ctx);
    if (className === 'PriorityQueue') init.sort((a, b) => compareValues(a, b, ctx));
    return allocCollection(className, init, 'Object', ctx);
  }
  if (SET_LIKE.has(className)) {
    const set = allocCollection(className, [], 'Object', ctx);
    for (const e of initialElements(args[0], ctx)) setAdd(set, e, className, ctx);
    return set;
  }
  if (MAP_LIKE.has(className)) {
    return allocMap(className, [], [], ctx);
  }
  if (className === 'Scanner') {
    // new Scanner(String) reads from the string; new Scanner(System.in) reads the preset stdin.
    const buf = args[0]?.kind === 'string' ? args[0].value : ctx.stdin;
    const heapId = ctx.allocObject('Scanner', new Map<string, JavaValue>([
      ['__buf__', javaString(buf)],
      ['__pos__', javaInt(0)],
    ]));
    return { kind: 'objectRef', heapId, className: 'Scanner' };
  }
  if (className === 'Random') {
    const heapId = ctx.allocObject('Random', new Map());
    const seed = args.length > 0 ? BigInt(Math.trunc(javaValueToNumber(args[0]))) : BigInt(Math.trunc(ctx.random() * 2 ** 48));
    rngState.set(heapId, (seed ^ 0x5DEECE66Dn) & RNG_MASK);
    return { kind: 'objectRef', heapId, className: 'Random' };
  }
  if (isExceptionClass(className)) {
    return newException(className, args, ctx);
  }
  return undefined;
}

export function callInstanceMethod(
  ref: JavaValue,
  method: string,
  args: JavaValue[],
  ctx: StdlibContext,
): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const cls = ref.className;
  if (LIST_LIKE.has(cls)) return listMethod(ref, cls, method, args, ctx);
  if (SET_LIKE.has(cls)) return setMethod(ref, cls, method, args, ctx);
  if (MAP_LIKE.has(cls)) return mapMethod(ref, cls, method, args, ctx);
  if (cls === 'Scanner') return scannerMethod(ref, method, ctx);
  if (cls === 'Random') return randomMethod(ref, method, args);
  if (cls === 'Iterator') return iteratorMethod(ref, method, ctx);
  if (cls === 'MapEntry') return entryMethod(ref, method, ctx);
  if (isExceptionClass(cls)) return exceptionMethod(ref, method, ctx);
  return undefined;
}

/** Elements to iterate for a for-each loop; undefined if not iterable (e.g. a Map). */
export function getIterableElements(ref: JavaValue, ctx: StdlibContext): JavaValue[] | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const data = backingArray(ref, ctx);
  return data ? data.elements.slice() : undefined;
}

// ── Lists / Queues / Deques / Stacks ──

function listMethod(ref: JavaValue, cls: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const data = backingArray(ref, ctx);
  if (!data) return javaNull();
  const el = data.elements;
  const sync = () => syncSize(ref, el.length, ctx);
  const front = () => (el.length ? el[0] : javaNull());
  const back = () => (el.length ? el[el.length - 1] : javaNull());

  switch (method) {
    case 'add': case 'addLast': case 'offer': case 'offerLast':
      if (method === 'add' && args.length === 2) {
        el.splice(javaValueToNumber(args[0]) | 0, 0, args[1]);
      } else if (cls === 'PriorityQueue') {
        sortedInsert(el, args[0], ctx);
      } else {
        el.push(args[0]);
      }
      sync();
      return javaBool(true);
    case 'addFirst': case 'offerFirst':
      el.unshift(args[0]); sync(); return javaBool(true);
    case 'push':
      // Stack.push -> top (end); Deque.push -> head (front).
      if (cls === 'Stack') el.push(args[0]); else el.unshift(args[0]);
      sync(); return method === 'push' && cls === 'Stack' ? args[0] : javaBool(true);
    case 'pop': {
      // Stack.pop -> end; Deque.pop -> front.
      if (!el.length) throw new StdlibError('NoSuchElementException');
      const v = cls === 'Stack' ? el.pop()! : el.shift()!;
      sync(); return v;
    }
    case 'poll': case 'pollFirst': {
      if (!el.length) return javaNull();
      const v = el.shift()!; sync(); return v;
    }
    case 'pollLast': {
      if (!el.length) return javaNull();
      const v = el.pop()!; sync(); return v;
    }
    case 'peek': case 'peekFirst': case 'element':
      // Stack.peek -> top (end); Queue/Deque.peek -> head (front).
      return cls === 'Stack' ? back() : front();
    case 'peekLast': return back();
    case 'getFirst': return front();
    case 'getLast': return back();
    case 'removeFirst': {
      if (!el.length) throw new StdlibError('NoSuchElementException');
      const v = el.shift()!; sync(); return v;
    }
    case 'removeLast': {
      if (!el.length) throw new StdlibError('NoSuchElementException');
      const v = el.pop()!; sync(); return v;
    }
    case 'get': {
      const i = javaValueToNumber(args[0]) | 0;
      if (i < 0 || i >= el.length) throw new StdlibError(`IndexOutOfBoundsException: Index ${i} out of bounds for length ${el.length}`);
      return el[i];
    }
    case 'set': {
      const i = javaValueToNumber(args[0]) | 0;
      const prev = el[i] ?? javaNull();
      el[i] = args[1];
      return prev;
    }
    case 'remove': {
      if (args[0]?.kind === 'primitive' && args[0].javaType !== 'boolean') {
        const i = javaValueToNumber(args[0]) | 0;
        if (i < 0 || i >= el.length) throw new StdlibError(`IndexOutOfBoundsException: Index ${i} out of bounds for length ${el.length}`);
        const [removed] = el.splice(i, 1);
        sync(); return removed ?? javaNull();
      }
      const idx = el.findIndex(e => valuesEqual(e, args[0], ctx));
      if (idx >= 0) { el.splice(idx, 1); sync(); return javaBool(true); }
      return javaBool(false);
    }
    case 'indexOf': return javaInt(el.findIndex(e => valuesEqual(e, args[0], ctx)));
    case 'lastIndexOf': {
      for (let i = el.length - 1; i >= 0; i--) if (valuesEqual(el[i], args[0], ctx)) return javaInt(i);
      return javaInt(-1);
    }
    case 'contains': return javaBool(el.some(e => valuesEqual(e, args[0], ctx)));
    case 'size': return javaInt(el.length);
    case 'isEmpty': return javaBool(el.length === 0);
    case 'clear': el.length = 0; sync(); return javaNull();
    case 'addAll': {
      for (const e of initialElements(args[args.length - 1], ctx)) el.push(e);
      sync(); return javaBool(true);
    }
    case 'iterator': return makeIterator(el.slice(), ctx);
    case 'toArray': return { kind: 'arrayRef', heapId: ctx.allocArray('Object', el.slice()) };
    case 'toString': return javaString('[' + el.map(e => javaValueToString(e, ctx.heap)).join(', ') + ']');
    case 'equals': return javaBool(ref.kind === 'objectRef' && args[0]?.kind === 'objectRef' && ref.heapId === args[0].heapId);
    case 'sort': el.sort((a, b) => compareValues(a, b, ctx)); return javaNull();
  }
  return undefined;
}

// ── Sets ──

function setAdd(ref: JavaValue, value: JavaValue, cls: string, ctx: StdlibContext): boolean {
  const data = backingArray(ref, ctx);
  if (!data) return false;
  if (data.elements.some(e => valuesEqual(e, value, ctx))) return false;
  if (isSorted(cls)) sortedInsert(data.elements, value, ctx);
  else data.elements.push(value);
  syncSize(ref, data.elements.length, ctx);
  return true;
}

function setMethod(ref: JavaValue, cls: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const data = backingArray(ref, ctx);
  if (!data) return javaNull();
  const el = data.elements;
  switch (method) {
    case 'add': return javaBool(setAdd(ref, args[0], cls, ctx));
    case 'remove': {
      const idx = el.findIndex(e => valuesEqual(e, args[0], ctx));
      if (idx >= 0) { el.splice(idx, 1); syncSize(ref, el.length, ctx); return javaBool(true); }
      return javaBool(false);
    }
    case 'contains': return javaBool(el.some(e => valuesEqual(e, args[0], ctx)));
    case 'size': return javaInt(el.length);
    case 'isEmpty': return javaBool(el.length === 0);
    case 'clear': el.length = 0; syncSize(ref, 0, ctx); return javaNull();
    case 'addAll': {
      let changed = false;
      for (const e of initialElements(args[0], ctx)) changed = setAdd(ref, e, cls, ctx) || changed;
      return javaBool(changed);
    }
    case 'first': return el.length ? el[0] : javaNull();
    case 'last': return el.length ? el[el.length - 1] : javaNull();
    case 'iterator': return makeIterator(el.slice(), ctx);
    case 'toArray': return { kind: 'arrayRef', heapId: ctx.allocArray('Object', el.slice()) };
    case 'toString': return javaString('[' + el.map(e => javaValueToString(e, ctx.heap)).join(', ') + ']');
  }
  return undefined;
}

// ── Maps ──

function mapMethod(ref: JavaValue, cls: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const m = mapArrays(ref, ctx);
  if (!m) return javaNull();
  const { keys, values } = m;
  const findIndex = (k: JavaValue) => keys.elements.findIndex(e => valuesEqual(e, k, ctx));
  switch (method) {
    case 'put': {
      const i = findIndex(args[0]);
      if (i >= 0) { const old = values.elements[i]; values.elements[i] = args[1]; return old; }
      if (cls === 'TreeMap') {
        let pos = 0;
        while (pos < keys.elements.length && compareValues(keys.elements[pos], args[0], ctx) < 0) pos++;
        keys.elements.splice(pos, 0, args[0]);
        values.elements.splice(pos, 0, args[1]);
      } else {
        keys.elements.push(args[0]);
        values.elements.push(args[1]);
      }
      syncSize(ref, keys.elements.length, ctx);
      return javaNull();
    }
    case 'get': { const i = findIndex(args[0]); return i >= 0 ? values.elements[i] : javaNull(); }
    case 'getOrDefault': { const i = findIndex(args[0]); return i >= 0 ? values.elements[i] : args[1]; }
    case 'putIfAbsent': {
      const i = findIndex(args[0]);
      if (i >= 0) return values.elements[i];
      return mapMethod(ref, cls, 'put', args, ctx)!;
    }
    case 'containsKey': return javaBool(findIndex(args[0]) >= 0);
    case 'containsValue': return javaBool(values.elements.some(e => valuesEqual(e, args[0], ctx)));
    case 'remove': {
      const i = findIndex(args[0]);
      if (i < 0) return javaNull();
      const old = values.elements[i];
      keys.elements.splice(i, 1);
      values.elements.splice(i, 1);
      syncSize(ref, keys.elements.length, ctx);
      return old;
    }
    case 'size': return javaInt(keys.elements.length);
    case 'isEmpty': return javaBool(keys.elements.length === 0);
    case 'clear': keys.elements.length = 0; values.elements.length = 0; syncSize(ref, 0, ctx); return javaNull();
    case 'keySet': {
      const setCls = cls === 'TreeMap' ? 'TreeSet' : 'LinkedHashSet';
      return allocCollection(setCls, keys.elements.slice(), 'Object', ctx);
    }
    case 'values': return allocCollection('ArrayList', values.elements.slice(), 'Object', ctx);
    case 'entrySet': {
      const entries = keys.elements.map((k, i) => {
        const id = ctx.allocObject('MapEntry', new Map<string, JavaValue>([
          ['key', k], ['value', values.elements[i]],
        ]));
        return { kind: 'objectRef', heapId: id, className: 'MapEntry' } as JavaValue;
      });
      return allocCollection('LinkedHashSet', entries, 'Object', ctx);
    }
    case 'firstKey': return keys.elements.length ? keys.elements[0] : javaNull();
    case 'lastKey': return keys.elements.length ? keys.elements[keys.elements.length - 1] : javaNull();
    case 'toString': {
      const parts = keys.elements.map((k, i) =>
        `${javaValueToString(k, ctx.heap)}=${javaValueToString(values.elements[i], ctx.heap)}`);
      return javaString('{' + parts.join(', ') + '}');
    }
  }
  return undefined;
}

// ── Map.Entry ──

function entryMethod(ref: JavaValue, method: string, ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(ref.heapId);
  if (!obj || !('fields' in obj)) return undefined;
  if (method === 'getKey') return obj.fields.get('key') ?? javaNull();
  if (method === 'getValue') return obj.fields.get('value') ?? javaNull();
  if (method === 'toString') {
    return javaString(`${javaValueToString(obj.fields.get('key')!, ctx.heap)}=${javaValueToString(obj.fields.get('value')!, ctx.heap)}`);
  }
  return undefined;
}

// ── Iterator ──

function makeIterator(elements: JavaValue[], ctx: StdlibContext): JavaValue {
  const dataId = ctx.allocArray('Object', elements);
  const heapId = ctx.allocObject('Iterator', new Map<string, JavaValue>([
    ['__data__', { kind: 'arrayRef', heapId: dataId }],
    ['__pos__', javaInt(0)],
  ]));
  return { kind: 'objectRef', heapId, className: 'Iterator' };
}

function iteratorMethod(ref: JavaValue, method: string, ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(ref.heapId);
  const data = backingArray(ref, ctx);
  if (!obj || !('fields' in obj) || !data) return javaNull();
  const pos = javaValueToNumber(obj.fields.get('__pos__') ?? javaInt(0)) | 0;
  if (method === 'hasNext') return javaBool(pos < data.elements.length);
  if (method === 'next') {
    if (pos >= data.elements.length) throw new StdlibError('NoSuchElementException');
    obj.fields.set('__pos__', javaInt(pos + 1));
    return data.elements[pos];
  }
  return undefined;
}

// ── Scanner ──

function scannerMethod(ref: JavaValue, method: string, ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(ref.heapId);
  if (!obj || !('fields' in obj)) return javaNull();
  const buf = (obj.fields.get('__buf__') as { value: string } | undefined)?.value ?? '';
  const pos = javaValueToNumber(obj.fields.get('__pos__') ?? javaInt(0)) | 0;
  const setPos = (p: number) => obj.fields.set('__pos__', javaInt(p));

  const skipWs = (from: number) => { while (from < buf.length && /\s/.test(buf[from])) from++; return from; };
  const nextToken = (): string | undefined => {
    const start = skipWs(pos);
    if (start >= buf.length) return undefined;
    let end = start;
    while (end < buf.length && !/\s/.test(buf[end])) end++;
    setPos(end);
    return buf.slice(start, end);
  };
  const peekToken = (): string | undefined => {
    const start = skipWs(pos);
    if (start >= buf.length) return undefined;
    let end = start;
    while (end < buf.length && !/\s/.test(buf[end])) end++;
    return buf.slice(start, end);
  };

  switch (method) {
    case 'next': {
      const t = nextToken();
      if (t === undefined) throw new StdlibError('NoSuchElementException');
      return javaString(t);
    }
    case 'nextInt': case 'nextLong': case 'nextShort': case 'nextByte': {
      const t = nextToken();
      if (t === undefined) throw new StdlibError('NoSuchElementException');
      const n = parseInt(t, 10);
      return method === 'nextLong' ? { kind: 'primitive', javaType: 'long', value: n } : javaInt(n);
    }
    case 'nextDouble': case 'nextFloat': {
      const t = nextToken();
      if (t === undefined) throw new StdlibError('NoSuchElementException');
      return javaDouble(parseFloat(t));
    }
    case 'nextBoolean': {
      const t = nextToken();
      return javaBool((t ?? '').toLowerCase() === 'true');
    }
    case 'nextLine': {
      // Read to end of current line (Java semantics: consumes the newline).
      if (pos >= buf.length) throw new StdlibError('NoSuchElementException');
      const nl = buf.indexOf('\n', pos);
      if (nl < 0) { const line = buf.slice(pos); setPos(buf.length); return javaString(line); }
      const line = buf.slice(pos, nl).replace(/\r$/, '');
      setPos(nl + 1);
      return javaString(line);
    }
    case 'hasNext': return javaBool(peekToken() !== undefined);
    case 'hasNextLine': return javaBool(pos < buf.length);
    case 'hasNextInt': case 'hasNextLong': {
      const t = peekToken();
      return javaBool(t !== undefined && /^[+-]?\d+$/.test(t));
    }
    case 'hasNextDouble': case 'hasNextFloat': {
      const t = peekToken();
      return javaBool(t !== undefined && !Number.isNaN(parseFloat(t)));
    }
    case 'close': return javaNull();
  }
  return undefined;
}

// ── Random (Java's 48-bit LCG, so seeded sequences match real java.util.Random) ──

const rngState = new Map<string, bigint>();
const RNG_MULT = 0x5DEECE66Dn;
const RNG_ADD = 0xBn;
const RNG_MASK = (1n << 48n) - 1n;

function rngNext(heapId: string, bits: number): number {
  let s = rngState.get(heapId) ?? 0n;
  s = (s * RNG_MULT + RNG_ADD) & RNG_MASK;
  rngState.set(heapId, s);
  // Top `bits` bits, interpreted as a signed 32-bit int.
  const shifted = s >> BigInt(48 - bits);
  return Number(BigInt.asIntN(32, shifted));
}

function randomMethod(ref: JavaValue, method: string, args: JavaValue[]): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const id = ref.heapId;
  switch (method) {
    case 'nextInt': {
      if (args.length === 0) return javaInt(rngNext(id, 32));
      const bound = javaValueToNumber(args[0]) | 0;
      if (bound <= 0) throw new StdlibError('IllegalArgumentException: bound must be positive');
      if ((bound & -bound) === bound) { // power of two
        return javaInt(Number((BigInt(bound) * BigInt(rngNext(id, 31))) >> 31n));
      }
      let bits: number, val: number;
      do {
        bits = rngNext(id, 31);
        val = bits % bound;
      } while (((bits - val + (bound - 1)) | 0) < 0);
      return javaInt(val);
    }
    case 'nextLong': {
      const hi = BigInt(rngNext(id, 32));
      const lo = BigInt(rngNext(id, 32));
      return { kind: 'primitive', javaType: 'long', value: Number((hi << 32n) + lo) };
    }
    case 'nextBoolean': return javaBool(rngNext(id, 1) !== 0);
    case 'nextDouble': {
      const hi = rngNext(id, 26);
      const lo = rngNext(id, 27);
      return javaDouble((hi * 2 ** 27 + lo) / 2 ** 53);
    }
    case 'nextFloat': return javaDouble(rngNext(id, 24) / 2 ** 24);
    case 'setSeed':
      rngState.set(id, (BigInt(Math.trunc(javaValueToNumber(args[0]))) ^ RNG_MULT) & RNG_MASK);
      return javaNull();
  }
  return undefined;
}
