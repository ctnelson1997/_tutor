/**
 * The values of Java string, char and text-block literals (JLS §3.3, §3.10.4–§3.10.7).
 *
 * This module doesn't depend on the interpreter, so the planned core rewrite
 * (#12–#14) can reuse it.
 */

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
