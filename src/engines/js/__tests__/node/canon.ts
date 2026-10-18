/**
 * Values as canonical, type-tagged trees: what a value *is*, whatever the
 * format it is printed or drawn in. The golden recorder turns Node's real
 * values into them (`canon`), and the suite turns JSTutor's drawing of a value
 * (a snapshot value and its heap) into the same shape (`shownCanon`), so the
 * two can be compared (`diffCanon`).
 *
 *   num:-0  num:NaN  str:hi  boolean:true  bigint:10  sym:id  null  undefined
 *   fn:greet                                   a function or class, by name
 *   { array: [...], len }                      '<hole>' for a missing element
 *   { map: [[k, v], ...] }  { set: [...] }
 *   { object: 'Point', props: { x: ..., '[Symbol(id)]': ... } }
 *   { error: 'TypeError: msg' }  { date: '<ms>' }  { regexp: '/a/g' }  { promise: true }
 *   '<getter>' '<setter>' '<accessor>' '<circular>' '<deep>' '<uninitialized>'
 */
import type { HeapObject, RuntimeValue } from '../../../../types/snapshot';

export type Canon =
  | string
  | { array: Canon[]; len: number }
  | { map: [Canon, Canon][] }
  | { set: Canon[] }
  | { object: string; props: Record<string, Canon> }
  | { error: string }
  | { date: string }
  | { regexp: string }
  | { promise: true };

const MAX_DEPTH = 4;
const MAX_ITEMS = 50;

function accessorKind(d: PropertyDescriptor): string {
  return d.get && d.set ? '<accessor>' : d.get ? '<getter>' : '<setter>';
}

/**
 * A real value as a canonical tree. It reads own properties through their
 * descriptors and never calls the program's code (no getters, toString or
 * toJSON). Works across realms (values from a vm context).
 */
export function canon(v: unknown, depth = 0, seen: Set<unknown> = new Set()): Canon {
  const t = typeof v;
  if (v === null) return 'null';
  if (t === 'undefined') return 'undefined';
  if (t === 'number') return Object.is(v, -0) ? 'num:-0' : `num:${v as number}`;
  if (t === 'string') return `str:${v as string}`;
  if (t === 'boolean' || t === 'bigint') return `${t}:${String(v)}`;
  if (t === 'symbol') return `sym:${(v as symbol).description ?? ''}`;
  if (seen.has(v)) return '<circular>';
  if (depth > MAX_DEPTH) return '<deep>';
  seen = new Set(seen).add(v);
  if (t === 'function') return `fn:${(v as { name?: string }).name ?? ''}`;
  const o = v as object;
  let tag = '';
  try { tag = Object.prototype.toString.call(o).slice(8, -1); } catch { tag = '?'; }
  if (Array.isArray(o)) {
    const items: Canon[] = [];
    for (let i = 0; i < o.length && i < MAX_ITEMS; i++) {
      if (!(i in o)) { items.push('<hole>'); continue; }
      const d = Object.getOwnPropertyDescriptor(o, i);
      items.push(d && !('value' in d) ? accessorKind(d) : canon(o[i], depth + 1, seen));
    }
    return { array: items, len: o.length };
  }
  if (tag === 'Map') {
    return { map: [...(o as Map<unknown, unknown>)].slice(0, MAX_ITEMS).map(([k, x]) => [canon(k, depth + 1, seen), canon(x, depth + 1, seen)] as [Canon, Canon]) };
  }
  if (tag === 'Set') return { set: [...(o as Set<unknown>)].slice(0, MAX_ITEMS).map(x => canon(x, depth + 1, seen)) };
  if (tag === 'Error') {
    const e = o as Error;
    return { error: `${dataProperty(e, 'name') ?? protoName(e)}: ${dataProperty(e, 'message') ?? ''}` };
  }
  if (tag === 'Date') return { date: String((o as Date).getTime()) };
  if (tag === 'RegExp') return { regexp: RegExp.prototype.toString.call(o) };
  if (tag === 'Promise') return { promise: true };
  const props: Record<string, Canon> = {};
  for (const k of Reflect.ownKeys(o).slice(0, MAX_ITEMS)) {
    const d = Object.getOwnPropertyDescriptor(o, k);
    if (!d || !d.enumerable) continue;
    props[typeof k === 'symbol' ? `[${k.toString()}]` : k] = 'value' in d ? canon(d.value, depth + 1, seen) : accessorKind(d);
  }
  return { object: constructorName(o), props };
}

/** A property's value if it is a data property somewhere on the chain (never a getter's result). */
function dataProperty(o: object, key: string): string | undefined {
  for (let p: object | null = o; p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, key);
    if (d) return 'value' in d ? String(d.value) : undefined;
  }
  return undefined;
}

function protoName(o: object): string {
  return constructorName(o) || 'Error';
}

/**
 * The name of the class an object was made by, as `obj.constructor.name` reads
 * it (the first `constructor` up the prototype chain, read as data): '' for a
 * plain object, one with no prototype, or one whose `constructor` isn't a
 * function (a generator object).
 */
function constructorName(o: object): string {
  try {
    for (let p = Object.getPrototypeOf(o); p; p = Object.getPrototypeOf(p)) {
      const d = Object.getOwnPropertyDescriptor(p, 'constructor');
      if (!d) continue;
      // A built-in getter (Iterator.prototype's) runs no program code, so it is followed.
      const native = (f: unknown) => typeof f === 'function' && /\{\s*\[native code\]\s*\}$/.test(Function.prototype.toString.call(f));
      const ctor = 'value' in d ? d.value : native(d.get) ? d.get!.call(o) : undefined;
      const name = typeof ctor === 'function' ? String((ctor as { name: unknown }).name ?? '') : '';
      return name === 'Object' ? '' : name;
    }
    return '';
  } catch {
    return '?';
  }
}

/**
 * JSTutor's drawing of a value, as a canonical tree: as far as the drawing can
 * tell what the value is. A number's `display` text (#48) wins over its value.
 */
export function shownCanon(v: RuntimeValue | undefined, heap: HeapObject[], depth = 0, seen: Set<string> = new Set()): Canon {
  if (!v) return '<missing>';
  switch (v.type) {
    case 'number': {
      const text = v.display ?? (v.value === null ? 'null' : String(v.value));
      return `num:${text}`;
    }
    case 'string': return `str:${String(v.value)}`;
    case 'boolean': return `boolean:${String(v.value)}`;
    case 'undefined': return 'undefined';
    case 'null': return 'null';
    case 'bigint': return `bigint:${String(v.value)}`;
    case 'symbol': return `sym:${String(v.value).replace(/^Symbol\((.*)\)$/s, '$1')}`;
    case 'ref': {
      const h = heap.find(x => x.id === v.heapId);
      if (!h) return '<dangling>';
      if (seen.has(h.id)) return '<circular>';
      if (depth > MAX_DEPTH) return '<deep>';
      seen = new Set(seen).add(h.id);
      const val = (x: RuntimeValue) => shownCanon(x, heap, depth + 1, seen);
      const props = h.properties ?? [];
      switch (h.objectType) {
        case 'function': return `fn:${h.label ?? ''}`;
        case 'array': {
          // (A hole is drawn as an 'empty' value once #48 draws holes.)
          const items = props.filter(p => /^\d+$/.test(p.key)).map(p => ((p.value as { type: string }).type === 'empty' ? '<hole>' : val(p.value)));
          return { array: items, len: items.length };
        }
        case 'map': {
          // A key that is an object is drawn as a reference once #48 adds key values.
          const keyOf = (p: { key: string; keyValue?: RuntimeValue }) => (p.keyValue ? val(p.keyValue) : `str:${p.key}`);
          return { map: props.map(p => [keyOf(p), val(p.value)] as [Canon, Canon]) };
        }
        case 'set': return { set: props.map(p => val(p.value)) };
        case 'error': {
          const message = props.find(p => p.key === 'message');
          return { error: `${h.label ?? 'Error'}: ${message ? String((message.value as { value?: unknown }).value ?? '') : ''}` };
        }
        case 'date': return { date: h.label ?? '' };
        case 'regexp': return { regexp: h.label ?? '' };
        default: {
          const out: Record<string, Canon> = {};
          for (const p of props) out[p.key] = val(p.value);
          return { object: h.objectType === 'class' ? h.label ?? '' : '', props: out };
        }
      }
    }
    default: return JSON.stringify(v);
  }
}

const PLACEHOLDER_TEXT: Record<string, RegExp> = {
  '<getter>': /^str:<getter>$/,
  '<setter>': /^str:<setter>$/,
  '<accessor>': /^str:<(accessor|getter|setter)>$/,
};

/**
 * The differences between a value Node had (`want`) and JSTutor's drawing of
 * it (`got`), as short readable lines (at most `max`).
 */
export function diffCanon(want: Canon, got: Canon, path: string, out: string[] = [], max = 6): string[] {
  if (out.length >= max) return out;
  const show = (c: Canon) => JSON.stringify(c).slice(0, 70);
  if (typeof want === 'string' || typeof got === 'string') {
    if (want === got || want === '<uninitialized>' || want === '<deep>' || got === '<deep>') return out;
    // JSTutor draws an accessor as a placeholder string instead of calling it: that is the design.
    if (typeof want === 'string' && typeof got === 'string' && PLACEHOLDER_TEXT[want]?.test(got)) return out;
    // Functions are compared by kind only: JSTutor labels them by name, and anonymous ones as it can.
    if (typeof want === 'string' && typeof got === 'string' && want.startsWith('fn:') && got.startsWith('fn:')) return out;
    out.push(`${path}: ${show(want)} drawn as ${show(got)}`);
    return out;
  }
  if ('array' in want) {
    if (!('array' in got)) { out.push(`${path}: an array drawn as ${show(got)}`); return out; }
    if (want.len !== got.len && got.len < 100) out.push(`${path}: length ${want.len} drawn as ${got.len}`);
    want.array.forEach((x, i) => { if (i < got.array.length) diffCanon(x, got.array[i], `${path}[${i}]`, out, max); });
    return out;
  }
  if ('map' in want) {
    if (!('map' in got)) { out.push(`${path}: a Map drawn as ${show(got)}`); return out; }
    if (want.map.length !== got.map.length) out.push(`${path}: Map size ${want.map.length} drawn as ${got.map.length}`);
    want.map.forEach(([k, x], i) => {
      const g = got.map[i];
      if (!g) return;
      // A key drawn as text (all JSTutor has without #48's key refs) matches a primitive key of that text.
      const keyText = typeof k === 'string' ? k.replace(/^(num|str|boolean|bigint):/, '') : null;
      if (!(typeof g[0] === 'string' && keyText !== null && g[0] === `str:${keyText}`)) diffCanon(k, g[0], `${path} key ${i}`, out, max);
      diffCanon(x, g[1], `${path}.get(${keyText ?? i})`, out, max);
    });
    return out;
  }
  if ('set' in want) {
    if (!('set' in got)) { out.push(`${path}: a Set drawn as ${show(got)}`); return out; }
    if (want.set.length !== got.set.length) out.push(`${path}: Set size ${want.set.length} drawn as ${got.set.length}`);
    want.set.forEach((x, i) => { if (i < got.set.length) diffCanon(x, got.set[i], `${path}{${i}}`, out, max); });
    return out;
  }
  if ('object' in want) {
    if (!('object' in got)) { out.push(`${path}: ${want.object || 'an object'} drawn as ${show(got)}`); return out; }
    if (want.object !== got.object) out.push(`${path}: class ${want.object || '(plain object)'} drawn as ${got.object || '(plain object)'}`);
    for (const [k, x] of Object.entries(want.props)) {
      if (!(k in got.props)) { out.push(`${path}.${k} not drawn`); continue; }
      diffCanon(x, got.props[k], `${path}.${k}`, out, max);
    }
    return out;
  }
  // Errors, dates, regexps and promises are drawn by kind; their contents aren't compared.
  return out;
}
