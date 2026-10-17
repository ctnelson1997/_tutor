/**
 * The values of Java literals: integer and floating-point (JLS §3.10.1–§3.10.2),
 * string, char and text block (JLS §3.3, §3.10.4–§3.10.7).
 *
 * This module doesn't depend on the interpreter, so the planned core rewrite
 * (#12–#14) can reuse it.
 */

/**
 * The value of an integer literal token: decimal, hex (`0x`), octal (a
 * leading `0`) or binary (`0b`) digits, with underscores, and an `L` or `l`
 * suffix for a long. Hex, octal and binary digits may use every bit of the
 * type (`0xFFFFFFFF` is the int -1). Undefined when the value doesn't fit,
 * which javac reports as "integer number too large". A decimal 2147483648
 * (or 9223372036854775808L) is allowed and wraps to the minimum value, as it
 * is only legal after a minus sign.
 */
export function integerLiteralValue(image: string): { type: 'int'; value: number } | { type: 'long'; value: bigint } | undefined {
  let text = image.replace(/_/g, '');
  const long = /[lL]$/.test(text);
  if (long) text = text.slice(0, -1);
  const bits = long ? 64 : 32;
  let magnitude: bigint;
  let limit = (1n << BigInt(bits)) - 1n;
  try {
    if (/^0[xX]/.test(text)) magnitude = BigInt('0x' + text.slice(2));
    else if (/^0[bB]/.test(text)) magnitude = BigInt('0b' + text.slice(2));
    else if (text.length > 1 && text[0] === '0') magnitude = BigInt('0o' + text.slice(1));
    else {
      magnitude = BigInt(text);
      limit = 1n << BigInt(bits - 1);
    }
  } catch {
    return undefined; // not digits of that base, e.g. 09
  }
  if (magnitude > limit) return undefined;
  const value = BigInt.asIntN(bits, magnitude);
  return long ? { type: 'long', value } : { type: 'int', value: Number(value) };
}

/**
 * The value of a decimal floating-point literal token, with underscores and
 * an optional `f`/`F` (float) or `d`/`D` suffix. A float literal is rounded
 * to double and then to float, which differs from rounding it directly only
 * for digits extremely close to halfway between two floats. Undefined when
 * the value is too large for its type, or rounds to zero though its digits
 * aren't all zero: javac rejects both.
 */
export function floatingLiteralValue(image: string): { type: 'float' | 'double'; value: number } | undefined {
  let text = image.replace(/_/g, '');
  const float = /[fF]$/.test(text);
  if (float || /[dD]$/.test(text)) text = text.slice(0, -1);
  const value = float ? Math.fround(Number(text)) : Number(text);
  if (!Number.isFinite(value)) return undefined;
  if (value === 0 && /[1-9]/.test(text.split(/[eE]/)[0])) return undefined;
  return { type: float ? 'float' : 'double', value };
}

/**
 * Translate Unicode escapes (`A`, also `\uu0041`). A backslash can start
 * one only if it is preceded by an even number of backslashes, so `\\u0041`
 * stays as written (JLS §3.3).
 */
function translateUnicodeEscapes(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && text[i + 1] === '\\') {
      out += '\\\\'; // an escaped backslash: the next character can't start a Unicode escape
      i += 2;
    } else if (text[i] === '\\' && text[i + 1] === 'u') {
      let j = i + 1;
      while (text[j] === 'u') j++;
      out += String.fromCharCode(parseInt(text.slice(j, j + 4), 16));
      i = j + 4;
    } else {
      out += text[i++];
    }
  }
  return out;
}

/**
 * The characters a string or char literal's body denotes: `\n`, `\t`, `\"`,
 * octal escapes such as `\0`, and so on, translated in a single pass (so `\\n`
 * is a backslash followed by `n`). A backslash before a line break, which only
 * a text block can contain, joins the two lines.
 */
export function unescapeJava(body: string): string {
  const text = translateUnicodeEscapes(body);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const next = text[++i];
    switch (next) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'b': out += '\b'; break;
      case 'r': out += '\r'; break;
      case 'f': out += '\f'; break;
      case 's': out += ' '; break;
      case '"': out += '"'; break;
      case "'": out += "'"; break;
      case '\\': out += '\\'; break;
      case '\n': break; // line continuation in a text block
      default:
        if (next >= '0' && next <= '7') {
          // \0 to \377: up to three octal digits, and only two if the first is 4 to 7.
          let digits = next;
          const max = next <= '3' ? 3 : 2;
          while (digits.length < max && text[i + 1] >= '0' && text[i + 1] <= '7') digits += text[++i];
          out += String.fromCharCode(parseInt(digits, 8));
        } else {
          out += next ?? ''; // javac rejects any other escape
        }
    }
  }
  return out;
}

const ESCAPES: Record<string, string> = {
  '\\': '\\\\', '"': '\\"', '\n': '\\n', '\t': '\\t', '\b': '\\b', '\r': '\\r', '\f': '\\f',
};

/**
 * Text written as the body of a string literal would write it: backslashes,
 * quotes and control characters escaped (`\n`, `\t`, `\u0007`). The inverse
 * of unescapeJava.
 */
export function escapeJava(text: string): string {
  let out = '';
  for (const c of text) {
    const code = c.charCodeAt(0);
    out += ESCAPES[c] ?? (code < 0x20 || code === 0x7f ? '\\u' + code.toString(16).padStart(4, '0') : c);
  }
  return out;
}

/** A string as a string literal: `"a\nb"`. */
export function stringLiteral(text: string): string {
  return `"${escapeJava(text)}"`;
}

/**
 * A char as a char literal: `'B'`, `'\n'`, `'\''`, `'\u0000'`. A surrogate
 * half (one half of an emoji) is written as its `\u` escape, as it can't be
 * shown on its own.
 */
export function charLiteral(code: number): string {
  if (code === 0x27) return "'\\''";
  if (code === 0x22) return `'"'`;
  if (code >= 0xd800 && code <= 0xdfff) return `'\\u${code.toString(16)}'`;
  return `'${escapeJava(String.fromCharCode(code))}'`;
}

/** The value of a string literal token, quotes included: `"a\tb"`. */
export function stringLiteralValue(image: string): string {
  return unescapeJava(image.slice(1, -1));
}

/** The UTF-16 code unit of a char literal token, quotes included: `'\n'`. */
export function charLiteralValue(image: string): number {
  return unescapeJava(image.slice(1, -1)).charCodeAt(0);
}

/** Java's Character.isWhitespace for the characters a text block line can contain (line breaks aside). */
function isWhitespace(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c === 0x20 || c === 0x09 || c === 0x0b || c === 0x0c || (c >= 0x1c && c <= 0x1f);
}

function isBlank(line: string): boolean {
  return [...line].every(isWhitespace);
}

function leadingWhitespace(line: string): number {
  let n = 0;
  while (n < line.length && isWhitespace(line[n])) n++;
  return n;
}

/**
 * The value of a text block token, delimiters included (JLS §3.10.6). The
 * content starts on the line after the opening `"""`. Line breaks become `\n`.
 * Incidental indentation is removed as String.stripIndent does: the smallest
 * indentation of the non-blank lines, counting the closing delimiter's line
 * even if blank, is taken off every line, trailing white space is dropped,
 * and blank lines become empty. Escapes are translated last, so `\s` and
 * `\<line break>` survive the stripping.
 */
export function textBlockValue(image: string): string {
  let content = image.slice(3, -3).replace(/\r\n?/g, '\n');
  content = content.slice(content.indexOf('\n') + 1);
  const lines = content.split('\n');
  let indent = Infinity;
  lines.forEach((line, i) => {
    if (!isBlank(line) || i === lines.length - 1) indent = Math.min(indent, leadingWhitespace(line));
  });
  const stripped = lines.map(line => {
    if (isBlank(line)) return '';
    let end = line.length;
    while (end > 0 && isWhitespace(line[end - 1])) end--;
    return line.slice(indent, end);
  });
  return unescapeJava(stripped.join('\n'));
}
