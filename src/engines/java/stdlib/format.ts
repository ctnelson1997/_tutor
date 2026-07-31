/**
 * Java `String.format` / `System.out.printf` formatter.
 *
 * Implements the common conversions used in intro/intermediate coursework:
 *   %d %s %f %.Nf %c %b %x %X %o %e %g %n %%
 * with the common flags/width: left-justify (-), zero-pad (0), grouping (,),
 * leading + or space on numbers. This is a pragmatic subset — not the full
 * java.util.Formatter grammar — but covers what students actually write.
 */

import { type JavaValue, type JavaHeapEntry, javaValueToString, javaValueToNumber } from '../types';

const SPEC = /%(?:(\d+)\$)?([-#+ 0,]*)(\d+)?(?:\.(\d+))?([a-zA-Z%])/g;

function pad(body: string, width: number, left: boolean, zero: boolean, sign: string): string {
  const total = sign.length + body.length;
  if (width <= total) return sign + body;
  const fill = width - total;
  if (left) return sign + body + ' '.repeat(fill);
  if (zero) return sign + '0'.repeat(fill) + body;
  return ' '.repeat(fill - 0) + sign + body;
}

function group(intDigits: string): string {
  // Insert thousands separators into a run of digits.
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function signOf(n: number, flags: string): string {
  if (n < 0) return '-';
  if (flags.includes('+')) return '+';
  if (flags.includes(' ')) return ' ';
  return '';
}

export function javaFormat(fmt: string, args: JavaValue[], heap: Map<string, JavaHeapEntry>): string {
  let argIndex = 0;
  return fmt.replace(SPEC, (_m, explicitIdx, flags: string, widthStr, precStr, conv: string) => {
    if (conv === '%') return '%';
    if (conv === 'n') return '\n';

    const width = widthStr ? parseInt(widthStr, 10) : 0;
    const prec = precStr !== undefined ? parseInt(precStr, 10) : undefined;
    const left = flags.includes('-');
    const zero = flags.includes('0');
    const grouping = flags.includes(',');

    const idx = explicitIdx ? parseInt(explicitIdx, 10) - 1 : argIndex++;
    const arg = args[idx];
    const lower = conv.toLowerCase();

    switch (lower) {
      case 'd': {
        const n = Math.trunc(javaValueToNumber(arg));
        const sign = signOf(n, flags);
        let body = Math.abs(n).toString();
        if (grouping) body = group(body);
        return pad(body, width, left, zero, sign);
      }
      case 'f': {
        const n = javaValueToNumber(arg);
        const p = prec === undefined ? 6 : prec;
        const sign = signOf(n, flags);
        let body = Math.abs(n).toFixed(p);
        if (grouping) {
          const dot = body.indexOf('.');
          if (dot >= 0) body = group(body.slice(0, dot)) + body.slice(dot);
          else body = group(body);
        }
        return pad(body, width, left, zero, sign);
      }
      case 'e': {
        const n = javaValueToNumber(arg);
        const p = prec === undefined ? 6 : prec;
        const sign = signOf(n, flags);
        let body = Math.abs(n).toExponential(p);
        if (conv === 'E') body = body.toUpperCase();
        return pad(body, width, left, zero, sign);
      }
      case 'g': {
        const n = javaValueToNumber(arg);
        const p = prec === undefined ? 6 : prec;
        const sign = signOf(n, flags);
        let body = Math.abs(n).toPrecision(p === 0 ? 1 : p);
        if (conv === 'G') body = body.toUpperCase();
        return pad(body, width, left, zero, sign);
      }
      case 'x': {
        const n = Math.trunc(javaValueToNumber(arg));
        let body = (n >>> 0).toString(16);
        if (conv === 'X') body = body.toUpperCase();
        return pad(body, width, left, zero, '');
      }
      case 'o': {
        const n = Math.trunc(javaValueToNumber(arg));
        return pad((n >>> 0).toString(8), width, left, zero, '');
      }
      case 'c': {
        const body = arg?.kind === 'primitive'
          ? String.fromCharCode(javaValueToNumber(arg))
          : javaValueToString(arg, heap).charAt(0);
        return pad(body, width, left, false, '');
      }
      case 'b': {
        const body = arg === undefined || arg.kind === 'null'
          ? 'false'
          : arg.kind === 'primitive' && typeof arg.value === 'boolean'
            ? String(arg.value)
            : 'true';
        const out = conv === 'B' ? body.toUpperCase() : body;
        return pad(out, width, left, false, '');
      }
      case 's': {
        let body = arg === undefined ? 'null' : javaValueToString(arg, heap);
        if (prec !== undefined) body = body.slice(0, prec);
        if (conv === 'S') body = body.toUpperCase();
        return pad(body, width, left, false, '');
      }
      default:
        // Unknown conversion: emit verbatim so nothing is silently dropped.
        return _m;
    }
  });
}
