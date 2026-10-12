/**
 * java.util.Scanner over the program's preset stdin (or a String): real
 * tokenization, including the nextInt() → nextLine() gotcha.
 */

import { type JavaValue, type JavaObject, javaValueToNumber, javaInt, javaDouble, javaFloat, javaBool, javaString, javaNull } from '../types';
import { numericValue, parseIntegerText } from '../numeric';
import { type StdlibContext, StdlibError } from './context';

/** new Scanner(System.in) reads the preset stdin; new Scanner(String) reads the string. */
export function newScanner(args: JavaValue[], ctx: StdlibContext): JavaValue {
  const buf = args[0]?.kind === 'string' ? args[0].value : ctx.stdin;
  const heapId = ctx.allocObject('Scanner', new Map<string, JavaValue>([
    ['__buf__', javaString(buf)],
    ['__pos__', javaInt(0)],
  ]));
  return { kind: 'objectRef', heapId, className: 'Scanner' };
}

/** The part of a Scanner's input it hasn't read yet. */
export function scannerRemaining(scanner: JavaObject): string {
  const buf = scanner.fields.get('__buf__');
  const pos = javaValueToNumber(scanner.fields.get('__pos__') ?? javaInt(0)) | 0;
  return buf?.kind === 'string' ? buf.value.slice(pos) : '';
}

export function scannerMethod(ref: JavaValue, method: string, ctx: StdlibContext): JavaValue | undefined {
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
      // A token that isn't a number of the type stays unread, as in Java.
      const t = peekToken();
      if (t === undefined) throw new StdlibError('NoSuchElementException');
      const type = method === 'nextLong' ? 'long' : method === 'nextShort' ? 'short' : method === 'nextByte' ? 'byte' : 'int';
      if (!/^[+-]?\d+$/.test(t)) throw new StdlibError('InputMismatchException');
      let value;
      try {
        value = parseIntegerText(t, 10, type);
      } catch {
        throw new StdlibError(`InputMismatchException: For input string: "${t}"`); // out of the type's range
      }
      nextToken();
      return numericValue(type, value);
    }
    case 'nextDouble': case 'nextFloat': {
      const t = nextToken();
      if (t === undefined) throw new StdlibError('NoSuchElementException');
      return method === 'nextFloat' ? javaFloat(parseFloat(t)) : javaDouble(parseFloat(t));
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
