/**
 * java.util.Scanner over the program's preset stdin (or a String): real
 * tokenization, including the nextInt() → nextLine() gotcha.
 *
 * Tokens are recognized by Scanner's own patterns for the US locale (#65):
 * an int may group its digits by thousands (`1,234`), a double may also be
 * `NaN`, `Infinity` or a hex float but takes no `f`/`d` suffix, a boolean is
 * `true` or `false` in any case. A token that doesn't match stays unread,
 * with an InputMismatchException, as `hasNextX()` tells beforehand. (Java
 * also reads digits of other scripts, `٣`; these are ASCII digits only.)
 */

import { type JavaValue, type JavaObject, type ScannerState, javaBool, javaString, javaNull } from '../types';
import { numericValue, parseIntegerText, parseFloatingText } from '../numeric';
import { type StdlibContext, StdlibError } from './context';

/** An integer token: digits, or digits grouped by thousands with commas, with a sign. */
const INTEGER = /^[+-]?(?:\d+|[1-9]\d?\d?(?:,\d{3})+)$/;
/** A decimal token: an integer part (grouped or not) with a fraction and an exponent, NaN, Infinity, or a hex float. */
const DECIMAL = /^(?:[+-]?(?:(?:\d+|[1-9]\d?\d?(?:,\d{3})+)(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[+-]?(?:NaN|Infinity)|[+-]?0[xX][0-9a-fA-F]*\.[0-9a-fA-F]+(?:[pP][+-]?\d+)?)$/;
const BOOLEAN = /^(?:true|false)$/i;

/** A token without its thousands separators, as Scanner reads its value. */
const plainDigits = (token: string) => token.replace(/,/g, '');

/**
 * new Scanner(System.in) reads the preset stdin, from where the last Scanner
 * on System.in left off: all of them share the stream (#65), as when the
 * input is typed, so a helper that makes a new Scanner for each call reads
 * the next line, and closing one closes System.in for the others.
 * new Scanner(String) reads the string.
 */
export function newScanner(args: JavaValue[], ctx: StdlibContext): JavaValue {
  const input = args[0]?.kind === 'string'
    ? { text: args[0].value, pos: 0, closed: false }
    : (ctx.systemIn ??= { text: ctx.stdin, pos: 0, closed: false });
  const heapId = ctx.allocObject('Scanner', new Map());
  (ctx.heap.get(heapId) as JavaObject).scanner = { input, closed: false };
  return { kind: 'objectRef', heapId, className: 'Scanner' };
}

/** The part of a Scanner's input it hasn't read yet. */
export function scannerRemaining(scanner: JavaObject): string {
  const input = scanner.scanner?.input;
  return input && !input.closed ? input.text.slice(input.pos) : '';
}

export function scannerMethod(ref: JavaValue, method: string, ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const state: ScannerState | undefined = (ctx.heap.get(ref.heapId) as JavaObject | undefined)?.scanner;
  if (!state) return javaNull();
  if (method === 'close') {
    state.closed = true;
    state.input.closed = true;
    return javaNull();
  }
  if (state.closed) throw new StdlibError('IllegalStateException: Scanner closed');
  const input = state.input;
  // A closed System.in has nothing left to read.
  const buf = input.closed ? '' : input.text;
  const pos = Math.min(input.pos, buf.length);

  const skipWs = (from: number) => { while (from < buf.length && /\s/.test(buf[from])) from++; return from; };
  const peekToken = (): { token: string; end: number } | undefined => {
    const start = skipWs(pos);
    if (start >= buf.length) return undefined;
    let end = start;
    while (end < buf.length && !/\s/.test(buf[end])) end++;
    return { token: buf.slice(start, end), end };
  };
  /** The next token, which must match `pattern` (it stays unread otherwise), read as `value` gives it. */
  const read = <T>(pattern: RegExp, value: (token: string) => T): T => {
    const next = peekToken();
    if (next === undefined) throw new StdlibError('NoSuchElementException');
    if (!pattern.test(next.token)) throw new StdlibError('InputMismatchException');
    const v = value(next.token);
    input.pos = next.end;
    return v;
  };
  const hasNext = (pattern: RegExp, valid: (token: string) => unknown = () => true): boolean => {
    const next = peekToken();
    if (next === undefined || !pattern.test(next.token)) return false;
    try {
      valid(next.token);
      return true;
    } catch {
      return false;
    }
  };
  type IntType = 'int' | 'long' | 'short' | 'byte';
  const integer = (type: IntType) => (token: string) => {
    const digits = plainDigits(token);
    try {
      return numericValue(type, parseIntegerText(digits, 10, type));
    } catch {
      // Out of the type's range: the token stays unread.
      throw new StdlibError(`InputMismatchException: For input string: "${digits}"`);
    }
  };
  const floating = (type: 'double' | 'float') => (token: string) => {
    try {
      return numericValue(type, parseFloatingText(plainDigits(token), type));
    } catch {
      throw new StdlibError(`InputMismatchException: For input string: "${token}"`);
    }
  };
  const intType: Record<string, IntType> = { Int: 'int', Long: 'long', Short: 'short', Byte: 'byte' };

  switch (method) {
    case 'next': {
      const next = peekToken();
      if (next === undefined) throw new StdlibError('NoSuchElementException');
      input.pos = next.end;
      return javaString(next.token);
    }
    case 'nextInt': case 'nextLong': case 'nextShort': case 'nextByte':
      return read(INTEGER, integer(intType[method.slice(4)]));
    case 'nextDouble': return read(DECIMAL, floating('double'));
    case 'nextFloat': return read(DECIMAL, floating('float'));
    case 'nextBoolean': return read(BOOLEAN, token => javaBool(token.toLowerCase() === 'true'));
    case 'nextLine': {
      // Read to end of current line (Java semantics: consumes the newline).
      if (pos >= buf.length) throw new StdlibError('NoSuchElementException: No line found');
      const nl = buf.indexOf('\n', pos);
      if (nl < 0) { input.pos = buf.length; return javaString(buf.slice(pos)); }
      input.pos = nl + 1;
      return javaString(buf.slice(pos, nl).replace(/\r$/, ''));
    }
    case 'hasNext': return javaBool(peekToken() !== undefined);
    case 'hasNextLine': return javaBool(pos < buf.length);
    case 'hasNextInt': case 'hasNextLong': case 'hasNextShort': case 'hasNextByte':
      return javaBool(hasNext(INTEGER, integer(intType[method.slice(7)])));
    case 'hasNextDouble': return javaBool(hasNext(DECIMAL, floating('double')));
    case 'hasNextFloat': return javaBool(hasNext(DECIMAL, floating('float')));
    case 'hasNextBoolean': return javaBool(hasNext(BOOLEAN));
  }
  return undefined;
}

// ── java.util.StringTokenizer (#71) ──

const tokenizerText = (obj: JavaObject, name: string) => {
  const v = obj.fields.get(name);
  return v?.kind === 'string' ? v.value : '';
};

/** new StringTokenizer(str), (str, delim), (str, delim, returnDelims): the delimiters " \t\n\r\f" by default. */
export function newStringTokenizer(args: JavaValue[], ctx: StdlibContext): JavaValue {
  if (args[0]?.kind !== 'string') throw new StdlibError('NullPointerException');
  const fields = new Map<string, JavaValue>([
    ['__text__', args[0]],
    ['__pos__', numericValue('int', 0)],
    ['__delims__', args[1]?.kind === 'string' ? args[1] : javaString(' \t\n\r\f')],
    ['__returnDelims__', javaBool(args[2]?.kind === 'primitive' && args[2].value === true)],
  ]);
  const heapId = ctx.allocObject('StringTokenizer', fields);
  return { kind: 'objectRef', heapId, className: 'StringTokenizer' };
}

/** The part of a StringTokenizer's text it hasn't returned yet (what it is drawn with). */
export function tokenizerRemaining(obj: JavaObject): string {
  const pos = obj.fields.get('__pos__');
  return tokenizerText(obj, '__text__').slice(pos?.kind === 'primitive' ? Number(pos.value) : 0);
}

/** StringTokenizer's methods, as the JDK's: delimiters skipped (or returned as tokens), NoSuchElementException at the end. */
export function tokenizerMethod(ref: JavaValue, method: string, args: JavaValue[], ctx: StdlibContext): JavaValue | undefined {
  if (ref.kind !== 'objectRef') return undefined;
  const obj = ctx.heap.get(ref.heapId) as JavaObject;
  const text = tokenizerText(obj, '__text__');
  const posValue = obj.fields.get('__pos__');
  let pos = posValue?.kind === 'primitive' ? Number(posValue.value) : 0;
  const returnDelims = obj.fields.get('__returnDelims__')?.kind === 'primitive' && (obj.fields.get('__returnDelims__') as { value: unknown }).value === true;
  if (method === 'nextToken' && args.length === 1) {
    if (args[0].kind !== 'string') throw new StdlibError('NullPointerException');
    obj.fields.set('__delims__', args[0]);
  }
  const delims = tokenizerText(obj, '__delims__');
  const skipDelimiters = (from: number) => {
    if (!returnDelims) while (from < text.length && delims.includes(text[from])) from++;
    return from;
  };
  const scanToken = (from: number) => {
    const start = from;
    while (from < text.length && !delims.includes(text[from])) from++;
    if (returnDelims && start === from && from < text.length && delims.includes(text[from])) from++;
    return from;
  };
  switch (method) {
    case 'hasMoreTokens': case 'hasMoreElements': return javaBool(skipDelimiters(pos) < text.length);
    case 'nextToken': case 'nextElement': {
      pos = skipDelimiters(pos);
      if (pos >= text.length) throw new StdlibError('NoSuchElementException');
      const start = pos;
      pos = scanToken(pos);
      obj.fields.set('__pos__', numericValue('int', pos));
      return javaString(text.slice(start, pos));
    }
    case 'countTokens': {
      let count = 0;
      for (let p = pos; ; count++) {
        p = skipDelimiters(p);
        if (p >= text.length) break;
        p = scanToken(p);
      }
      return numericValue('int', count);
    }
  }
  return undefined;
}
