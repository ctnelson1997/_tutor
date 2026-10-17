/**
 * Streams (#16): the subset intro courses use, evaluated lazily as Java
 * does. A stream is a source and a pipeline of stages; nothing runs until a
 * terminal operation pulls the elements through every stage one at a time,
 * so `filter` and `map` calls interleave as in Java, a short-circuiting
 * operation (`anyMatch`, `findFirst`, `limit`) stops early, and an infinite
 * `Stream.iterate` works with `limit`. A stream can be used once.
 *
 * Supported: stream() of a collection, Arrays.stream, Stream.of/empty/
 * iterate/generate, IntStream.range/rangeClosed/of/iterate, String.chars();
 * filter, map, mapToInt, mapToObj, mapToDouble, asDoubleStream, boxed,
 * flatMap, distinct, sorted, peek, limit, skip; forEach, count, sum,
 * average, min, max, reduce, collect, toList, toArray, anyMatch, allMatch,
 * noneMatch, findFirst, findAny; Collectors.toList, toSet, joining,
 * counting, summingInt, averagingInt, groupingBy, toMap.
 */

import {
  type JavaValue,
  type JavaObject,
  isJavaObject,
  isJavaArray,
  javaBool,
  javaDouble,
  javaInt,
  javaLong,
  javaNull,
  javaString,
  javaValueToBoolean,
  javaValueToNumber,
  javaValueToString,
  collectionElements,
  mapContents,
} from '../types';
import { type StdlibContext, StdlibError } from './context';
import { allocCollection, compareWith, valuesEqual } from './util';
import { applyFunction, makeOptional } from './functional';
import { callInstanceMethod, newBuiltin, immutableList } from './collections';

type Kind = 'ref' | 'int' | 'double';
type Stage = (source: Iterator<JavaValue>) => Iterator<JavaValue>;

interface Pipeline {
  kind: Kind;
  /** Called when a terminal operation runs: a stream reads its source then (late-binding). */
  source: () => Iterator<JavaValue>;
  stages: Stage[];
  names: string[];
  sourceRef?: JavaValue;
}

const STREAM_CLASSES: Record<Kind, string> = { ref: 'Stream', int: 'IntStream', double: 'DoubleStream' };
const pipelines = new WeakMap<JavaObject, { pipeline: Pipeline; used: boolean }>();

export function isStreamClass(name: string): boolean {
  return name === 'Stream' || name === 'IntStream' || name === 'DoubleStream';
}

/** A stream object, drawn with its source and its stages so far. */
function makeStream(pipeline: Pipeline, ctx: StdlibContext): JavaValue {
  const fields = new Map<string, JavaValue>();
  if (pipeline.sourceRef) fields.set('source', pipeline.sourceRef);
  fields.set('pipeline', javaString(pipeline.names.join(' → ')));
  const cls = STREAM_CLASSES[pipeline.kind];
  const heapId = ctx.allocObject(cls, fields);
  pipelines.set(ctx.heap.get(heapId) as JavaObject, { pipeline, used: false });
  return { kind: 'objectRef', heapId, className: cls };
}

function* fromArray(items: readonly JavaValue[]): Iterator<JavaValue> {
  yield* items;
}

/** A stream over a fixed list of elements (Stream.of, Arrays.stream, …). */
export function streamOf(kind: Kind, items: () => readonly JavaValue[], name: string, sourceRef: JavaValue | undefined, ctx: StdlibContext): JavaValue {
  return makeStream({ kind, source: () => fromArray(items()), stages: [], names: [name], sourceRef }, ctx);
}

/** Collection.stream(): its elements when the terminal operation runs. */
export function collectionStream(ref: JavaValue, ctx: StdlibContext): JavaValue {
  const obj = ctx.heap.get((ref as { heapId: string }).heapId) as JavaObject;
  return streamOf('ref', () => collectionElements(obj, ctx.heap) ?? [], 'stream()', ref, ctx);
}

/** String.chars(): its UTF-16 code units, as ints. */
export function charsStream(text: string, ctx: StdlibContext): JavaValue {
  return streamOf('int', () => Array.from(text, (_, i) => javaInt(text.charCodeAt(i))), 'chars()', undefined, ctx);
}

function arrayItems(value: JavaValue, ctx: StdlibContext): JavaValue[] {
  if (value.kind !== 'arrayRef') throw new StdlibError('NullPointerException');
  const arr = ctx.heap.get(value.heapId);
  return arr && isJavaArray(arr) ? arr.elements : [];
}

/** The streams' statics: Stream.of/empty/iterate/generate, IntStream.range/rangeClosed/of/iterate, DoubleStream.of, Arrays.stream, Collectors.*. */
export function streamStatic(className: string, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const infinite = (kind: Kind, name: string, next: () => JavaValue) => makeStream({
    kind, stages: [], names: [name],
    source: function* () { for (;;) yield next(); },
  }, ctx);
  switch (`${className}.${method}`) {
    case 'Stream.of': {
      const items = args.length === 1 && args[0].kind === 'arrayRef' ? arrayItems(args[0], ctx) : args;
      return streamOf('ref', () => items, 'Stream.of(…)', undefined, ctx);
    }
    case 'Stream.empty': return streamOf('ref', () => [], 'Stream.empty()', undefined, ctx);
    case 'IntStream.of': case 'DoubleStream.of': {
      const items = args.length === 1 && args[0].kind === 'arrayRef' ? arrayItems(args[0], ctx) : args;
      return streamOf(className === 'IntStream' ? 'int' : 'double', () => items, `${className}.of(…)`, undefined, ctx);
    }
    case 'IntStream.range': case 'IntStream.rangeClosed': {
      const from = javaValueToNumber(args[0]), to = javaValueToNumber(args[1]) + (method === 'rangeClosed' ? 1 : 0);
      return makeStream({
        kind: 'int', stages: [], names: [`IntStream.${method}(${from}, ${javaValueToNumber(args[1])})`],
        source: function* () { for (let i = from; i < to; i++) yield javaInt(i); },
      }, ctx);
    }
    case 'Stream.iterate': case 'IntStream.iterate': {
      let current = args[0];
      let first = true;
      const fn = method === 'iterate' && className === 'IntStream' ? 'applyAsInt' : 'apply';
      return infinite(className === 'IntStream' ? 'int' : 'ref', `${className}.iterate(…)`, () => {
        if (!first) current = applyFunction(args[1], fn, [current], ctx);
        first = false;
        return current;
      });
    }
    case 'Stream.generate': return infinite('ref', 'Stream.generate(…)', () => applyFunction(args[0], 'get', [], ctx));
    case 'Arrays.stream': {
      const arr = args[0].kind === 'arrayRef' ? ctx.heap.get(args[0].heapId) : undefined;
      const type = arr && isJavaArray(arr) ? arr.elementType : 'Object';
      const kind: Kind = type === 'int' ? 'int' : type === 'double' ? 'double' : 'ref';
      return streamOf(kind, () => arrayItems(args[0], ctx), 'Arrays.stream(…)', args[0], ctx);
    }
  }
  if (className === 'Collectors') return collector(method, args, ctx);
  return undefined;
}

/** A Collectors.* collector, drawn with what it does. */
function collector(method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const names: Record<string, string[]> = {
    toList: [], toSet: [], counting: [], joining: ['delimiter', 'prefix', 'suffix'], summingInt: ['mapper'], averagingInt: ['mapper'],
    groupingBy: ['classifier', 'downstream'], toMap: ['keyMapper', 'valueMapper'],
  };
  if (!(method in names)) return undefined;
  const fields = new Map<string, JavaValue>([['kind', javaString(method)]]);
  names[method].forEach((n, i) => { if (args[i]) fields.set(n, args[i]); });
  return { kind: 'objectRef', heapId: ctx.allocObject('Collector', fields), className: 'Collector' };
}

// ── Stages and terminal operations ──

/** A stream's methods: a stage makes a new stream (this one is then used up), a terminal operation runs the pipeline. */
export function streamMethod(ref: JavaValue, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  const obj = ctx.heap.get((ref as { heapId: string }).heapId);
  const entry = obj && isJavaObject(obj) ? pipelines.get(obj) : undefined;
  if (!entry) return undefined;
  const p = entry.pipeline;
  const consume = () => {
    if (entry.used) throw new StdlibError('IllegalStateException: stream has already been operated upon or closed');
    entry.used = true;
  };
  const then = (name: string, stage: Stage, kind: Kind = p.kind) => {
    consume();
    return makeStream({ ...p, kind, stages: [...p.stages, stage], names: [...p.names, name] }, ctx);
  };
  const fnName = (ref: string, int: string, dbl: string) => (p.kind === 'int' ? int : p.kind === 'double' ? dbl : ref);
  const f = args[0];
  switch (method) {
    case 'filter':
      return then('filter', function* (src) { for (let r = src.next(); !r.done; r = src.next()) if (javaValueToBoolean(applyFunction(f, 'test', [r.value], ctx))) yield r.value; });
    case 'map':
      return then('map', function* (src) { for (let r = src.next(); !r.done; r = src.next()) yield applyFunction(f, fnName('apply', 'applyAsInt', 'applyAsDouble'), [r.value], ctx); });
    case 'mapToInt':
      return then('mapToInt', function* (src) { for (let r = src.next(); !r.done; r = src.next()) yield javaInt(javaValueToNumber(applyFunction(f, 'applyAsInt', [r.value], ctx))); }, 'int');
    case 'mapToDouble':
      return then('mapToDouble', function* (src) { for (let r = src.next(); !r.done; r = src.next()) yield javaDouble(javaValueToNumber(applyFunction(f, 'applyAsDouble', [r.value], ctx))); }, 'double');
    case 'mapToObj':
      return then('mapToObj', function* (src) { for (let r = src.next(); !r.done; r = src.next()) yield applyFunction(f, 'apply', [r.value], ctx); }, 'ref');
    case 'asDoubleStream':
      return then('asDoubleStream', function* (src) { for (let r = src.next(); !r.done; r = src.next()) yield javaDouble(javaValueToNumber(r.value)); }, 'double');
    case 'boxed':
      return then('boxed', function* (src) { for (let r = src.next(); !r.done; r = src.next()) yield r.value.kind === 'primitive' ? { ...r.value, boxed: true } : r.value; }, 'ref');
    case 'flatMap':
      return then('flatMap', function* (src) {
        for (let r = src.next(); !r.done; r = src.next()) {
          const inner = applyFunction(f, 'apply', [r.value], ctx);
          if (inner.kind !== 'null') yield* drain(inner, ctx);
        }
      });
    case 'peek':
      return then('peek', function* (src) { for (let r = src.next(); !r.done; r = src.next()) { applyFunction(f, 'accept', [r.value], ctx); yield r.value; } });
    case 'distinct':
      return then('distinct', function* (src) {
        const seen: JavaValue[] = [];
        for (let r = src.next(); !r.done; r = src.next()) {
          const v = r.value;
          if (seen.some(s => (s.kind === 'null' ? v.kind === 'null' : v.kind !== 'null' && valuesEqual(s, v, ctx)))) continue;
          seen.push(v);
          yield v;
        }
      });
    case 'sorted':
      return then('sorted', function* (src) {
        const all: JavaValue[] = [];
        for (let r = src.next(); !r.done; r = src.next()) all.push(r.value);
        yield* all.sort((a, b) => compareWith(f, a, b, ctx));
      });
    case 'limit': {
      const n = javaValueToNumber(f);
      if (n < 0) throw new StdlibError(`IllegalArgumentException: ${n}`);
      return then(`limit(${n})`, function* (src) {
        for (let i = 0; i < n; i++) {
          const r = src.next();
          if (r.done) return;
          yield r.value;
        }
      });
    }
    case 'skip': {
      const n = javaValueToNumber(f);
      return then(`skip(${n})`, function* (src) {
        let i = 0;
        for (let r = src.next(); !r.done; r = src.next()) if (i++ >= n) yield r.value;
      });
    }
  }
  // Terminal operations.
  const run = (): Iterator<JavaValue> => {
    consume();
    let it = p.source();
    for (const stage of p.stages) it = stage(it);
    return it;
  };
  const all = (): JavaValue[] => {
    const out: JavaValue[] = [];
    const it = run();
    for (let r = it.next(); !r.done; r = it.next()) out.push(r.value);
    return out;
  };
  const optional = (v: JavaValue | undefined) => makeOptional(p.kind === 'int' ? 'OptionalInt' : p.kind === 'double' ? 'OptionalDouble' : 'Optional', v, ctx);
  const number = (n: number) => (p.kind === 'int' ? javaInt(n | 0) : javaDouble(n));
  switch (method) {
    case 'forEach': case 'forEachOrdered': {
      const it = run();
      for (let r = it.next(); !r.done; r = it.next()) applyFunction(f, 'accept', [r.value], ctx);
      return javaNull();
    }
    case 'count': return javaLong(BigInt(all().length));
    case 'sum': return number(all().reduce((s, v) => (p.kind === 'int' ? (s + javaValueToNumber(v)) | 0 : s + javaValueToNumber(v)), 0));
    case 'average': {
      const items = all();
      return makeOptional('OptionalDouble', items.length ? javaDouble(items.reduce((s, v) => s + javaValueToNumber(v), 0) / items.length) : undefined, ctx);
    }
    case 'min': case 'max': {
      const items = all();
      if (!items.length) return optional(undefined);
      const sign = method === 'min' ? 1 : -1;
      const cmp = (a: JavaValue, b: JavaValue) => (p.kind === 'ref' ? compareWith(f, a, b, ctx) : javaValueToNumber(a) - javaValueToNumber(b));
      return optional(items.reduce((best, v) => (sign * cmp(v, best) < 0 ? v : best)));
    }
    case 'reduce': {
      const op = args.length === 2 ? args[1] : args[0];
      const name = fnName('apply', 'applyAsInt', 'applyAsDouble');
      const it = run();
      if (args.length === 2) {
        let acc = args[0];
        for (let r = it.next(); !r.done; r = it.next()) acc = applyFunction(op, name, [acc, r.value], ctx);
        return acc;
      }
      let acc: JavaValue | undefined;
      for (let r = it.next(); !r.done; r = it.next()) acc = acc === undefined ? r.value : applyFunction(op, name, [acc, r.value], ctx);
      return optional(acc);
    }
    case 'anyMatch': case 'allMatch': case 'noneMatch': {
      const it = run();
      for (let r = it.next(); !r.done; r = it.next()) {
        const t = javaValueToBoolean(applyFunction(f, 'test', [r.value], ctx));
        if (method === 'anyMatch' && t) return javaBool(true);
        if (method === 'allMatch' && !t) return javaBool(false);
        if (method === 'noneMatch' && t) return javaBool(false);
      }
      return javaBool(method !== 'anyMatch');
    }
    case 'findFirst': case 'findAny': {
      const r = run().next();
      return optional(r.done ? undefined : r.value);
    }
    case 'toList': return immutableList(all(), ctx);
    case 'toArray': {
      const items = all();
      if (args.length === 1) {
        const array = applyFunction(f, 'apply', [javaInt(items.length)], ctx);
        arrayItems(array, ctx).splice(0, items.length, ...items);
        return array;
      }
      return { kind: 'arrayRef', heapId: ctx.allocArray(p.kind === 'int' ? 'int' : p.kind === 'double' ? 'double' : 'Object', items) };
    }
    case 'collect': return collect(f, all(), ctx);
  }
  return undefined;
}

/** The elements of another stream, for flatMap (which uses it up). */
function* drain(stream: JavaValue, ctx: StdlibContext): Generator<JavaValue> {
  const obj = ctx.heap.get((stream as { heapId: string }).heapId);
  const entry = obj && isJavaObject(obj) ? pipelines.get(obj) : undefined;
  if (!entry) return;
  if (entry.used) throw new StdlibError('IllegalStateException: stream has already been operated upon or closed');
  entry.used = true;
  let it = entry.pipeline.source();
  for (const stage of entry.pipeline.stages) it = stage(it);
  for (let r = it.next(); !r.done; r = it.next()) yield r.value;
}

/** Apply a collector to the elements: a list, a set, a joined string, a count, a sum or average, groups, or a map. */
function collect(collectorRef: JavaValue, items: JavaValue[], ctx: StdlibContext): JavaValue {
  if (collectorRef.kind !== 'objectRef') throw new StdlibError('NullPointerException');
  const fields = (ctx.heap.get(collectorRef.heapId) as JavaObject).fields;
  const kind = javaValueToString(fields.get('kind') ?? javaNull(), ctx.heap);
  const add = (target: JavaValue, v: JavaValue) => callInstanceMethod(target, 'add', [v], ctx);
  switch (kind) {
    case 'toList': return allocCollection('ArrayList', [...items], 'Object', ctx);
    case 'toSet': {
      const set = newBuiltin('HashSet', [], ctx)!;
      for (const v of items) add(set, v);
      return set;
    }
    case 'joining': {
      const text = (n: string) => (fields.has(n) ? javaValueToString(fields.get(n)!, ctx.heap) : '');
      return javaString(text('prefix') + items.map(v => javaValueToString(v, ctx.heap)).join(text('delimiter')) + text('suffix'));
    }
    case 'counting': return { ...javaLong(BigInt(items.length)), boxed: true };
    case 'summingInt': return { ...javaInt(items.reduce((s, v) => (s + javaValueToNumber(applyFunction(fields.get('mapper'), 'applyAsInt', [v], ctx))) | 0, 0)), boxed: true };
    case 'averagingInt': {
      const sum = items.reduce((s, v) => s + javaValueToNumber(applyFunction(fields.get('mapper'), 'applyAsInt', [v], ctx)), 0);
      return { ...javaDouble(items.length ? sum / items.length : 0), boxed: true };
    }
    case 'groupingBy': {
      const map = newBuiltin('HashMap', [], ctx)!;
      const groups: [JavaValue, JavaValue[]][] = [];
      for (const v of items) {
        const key = applyFunction(fields.get('classifier'), 'apply', [v], ctx);
        if (key.kind === 'null') throw new StdlibError('NullPointerException: element cannot be mapped to a null key');
        const group = groups.find(([k]) => valuesEqual(k, key, ctx));
        if (group) group[1].push(v);
        else groups.push([key, [v]]);
      }
      const downstream = fields.get('downstream');
      for (const [key, group] of groups) {
        callInstanceMethod(map, 'put', [key, downstream ? collect(downstream, group, ctx) : allocCollection('ArrayList', group, 'Object', ctx)], ctx);
      }
      return map;
    }
    case 'toMap': {
      const map = newBuiltin('HashMap', [], ctx)!;
      for (const v of items) {
        const key = applyFunction(fields.get('keyMapper'), 'apply', [v], ctx);
        const value = applyFunction(fields.get('valueMapper'), 'apply', [v], ctx);
        if (value.kind === 'null') throw new StdlibError('NullPointerException');
        const contents = mapContents(ctx.heap.get((map as { heapId: string }).heapId) as JavaObject, ctx.heap)!;
        const i = contents.keys.findIndex(k => valuesEqual(k, key, ctx));
        if (i >= 0) {
          const show = (x: JavaValue) => javaValueToString(x, ctx.heap);
          throw new StdlibError(`IllegalStateException: Duplicate key ${show(key)} (attempted merging values ${show(contents.values[i])} and ${show(value)})`);
        }
        callInstanceMethod(map, 'put', [key, value], ctx);
      }
      return map;
    }
  }
  throw new StdlibError(`The collector ${kind} isn't supported in JavaTutor yet`);
}
