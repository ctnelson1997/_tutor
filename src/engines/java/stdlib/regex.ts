/**
 * Java regular expressions (java.util.regex) on JavaScript's RegExp, for
 * String.split, matches, replaceAll and replaceFirst (#20).
 *
 * Most syntax students use is the same in both: character classes,
 * \d \w \s, quantifiers, groups, alternation, anchors, backreferences and
 * named groups. Translated: leading inline flags ((?i) (?s) (?m)), \Q…\E
 * quoting, \A \Z \z, \h, and the POSIX classes \p{Alpha} \p{Digit}
 * \p{Alnum} \p{Upper} \p{Lower} \p{Punct} \p{Space} (and \P{…}). Rejected
 * with an error rather than run differently: possessive quantifiers (a*+),
 * atomic groups ((?>…)), class intersections ([a-z&&[^aeiou]]), inline
 * flags after the start, and other \p{…} classes.
 */
import { UnsupportedFeatureError } from '../errors';
import { StdlibError } from './context';

const POSIX: Record<string, string> = {
  Alpha: 'a-zA-Z', Digit: '0-9', Alnum: 'a-zA-Z0-9', Upper: 'A-Z', Lower: 'a-z',
  Punct: '!-\\/:-@\\[-`{-~', Space: ' \\t\\n\\x0B\\f\\r', XDigit: '0-9a-fA-F', Blank: ' \\t',
};

function unsupported(what: string): never {
  throw new UnsupportedFeatureError(`Regular expressions with ${what}`, 0);
}

/** A Java regex as a JavaScript RegExp; `extraFlags` are added (g for a global search). */
export function javaRegex(pattern: string, extraFlags = ''): RegExp {
  let flags = '';
  let source = pattern;
  const inline = /^\(\?([imsx]+)\)/.exec(source);
  if (inline) {
    if (inline[1].includes('x')) unsupported('the comments flag (?x)');
    flags = inline[1];
    source = source.slice(inline[0].length);
  }
  let out = '';
  let inClass = 0;
  let afterQuantifier = false; // the previous token was a quantifier (* + ? or {n,m})
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const quantified: boolean = afterQuantifier;
    afterQuantifier = false;
    if (c === '\\') {
      const next = source[i + 1];
      if (next === 'Q') {
        const end = source.indexOf('\\E', i + 2);
        const quoted = source.slice(i + 2, end < 0 ? source.length : end);
        out += quoted.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
        i = end < 0 ? source.length : end + 1;
        continue;
      }
      if ((next === 'p' || next === 'P') && source[i + 2] === '{') {
        const close = source.indexOf('}', i + 3);
        const name = source.slice(i + 3, close).replace(/^Is/, '');
        const set = POSIX[name];
        if (!set || close < 0) unsupported(`the class \\${next}{${name}}`);
        out += next === 'p' ? (inClass ? set : `[${set}]`) : inClass ? unsupported('\\P{…} inside a character class') : `[^${set}]`;
        i = close;
        continue;
      }
      if (next === 'A') { out += '^'; i++; continue; }
      if (next === 'Z' || next === 'z') { out += '$'; i++; continue; }
      if (next === 'h') { out += inClass ? ' \\t\\xA0' : '[ \\t\\xA0]'; i++; continue; }
      out += c + (next ?? '');
      i++;
      continue;
    }
    if (inClass) {
      if (c === '&' && source[i + 1] === '&') unsupported('character class intersections (&&)');
      if (c === '[') inClass++;
      if (c === ']') inClass--;
      out += c;
      continue;
    }
    if (c === '[') {
      inClass = 1;
      out += c;
      // A ] right after [ or [^ is a literal in Java, as in JavaScript.
      if (source[i + 1] === '^') { out += '^'; i++; }
      if (source[i + 1] === ']') { out += '\\]'; i++; }
      continue;
    }
    if (c === '(' && source[i + 1] === '?') {
      const kind = source[i + 2];
      if (kind === '>') unsupported('atomic groups (?>…)');
      if (/[imsx-]/.test(kind)) unsupported('inline flags inside the pattern');
      out += '(?';
      i++;
      continue;
    }
    if (c === '+' && quantified) unsupported('possessive quantifiers (a*+)');
    // A lazy ? after a quantifier is itself not one.
    afterQuantifier = c === '*' || c === '+' || c === '}' || (c === '?' && !quantified);
    out += c;
  }
  try {
    return new RegExp(out, flags + extraFlags);
  } catch (e) {
    throw new StdlibError(`PatternSyntaxException: ${(e as Error).message} near index 0\n${pattern}`);
  }
}

/**
 * A Java replacement string (for replaceAll and replaceFirst) as a function
 * building each replacement: `$1` and `${name}` insert a group, `\x` is a
 * literal x, and any other `$` is Java's "Illegal group reference".
 */
export function javaReplacement(replacement: string, groupCount: number): (match: string[], groups?: Record<string, string>) => string {
  const parts: (string | number | { name: string })[] = [];
  let text = '';
  for (let i = 0; i < replacement.length; i++) {
    const c = replacement[i];
    if (c === '\\') {
      if (i + 1 >= replacement.length) throw new StdlibError('IllegalArgumentException: character to be escaped is missing');
      text += replacement[++i];
    } else if (c === '$') {
      if (replacement[i + 1] === '{') {
        const close = replacement.indexOf('}', i + 2);
        if (close < 0) throw new StdlibError("IllegalArgumentException: named capturing group is missing trailing '}'");
        parts.push(text, { name: replacement.slice(i + 2, close) });
        text = '';
        i = close;
        continue;
      }
      if (!/[0-9]/.test(replacement[i + 1] ?? '')) throw new StdlibError('IllegalArgumentException: Illegal group reference');
      let group = Number(replacement[++i]);
      // Take more digits while they still name a group, as Java does.
      while (/[0-9]/.test(replacement[i + 1] ?? '') && group * 10 + Number(replacement[i + 1]) <= groupCount) group = group * 10 + Number(replacement[++i]);
      if (group > groupCount) throw new StdlibError(`IndexOutOfBoundsException: No group ${group}`);
      parts.push(text, group);
      text = '';
    } else {
      text += c;
    }
  }
  parts.push(text);
  return (match, groups) => parts.map(p => (typeof p === 'string' ? p : typeof p === 'number' ? match[p] ?? '' : groups?.[p.name] ?? '')).join('');
}

/** The number of capturing groups in a RegExp. */
export function groupCount(re: RegExp): number {
  return new RegExp(`${re.source}|`, re.flags.replace('g', '')).exec('')!.length - 1;
}

/**
 * String.split(regex, limit) with Java's rules: a zero-width match at the
 * start gives no leading empty string, a positive limit caps the number of
 * parts, and with limit 0 trailing empty strings are removed. A string with
 * no match splits into itself.
 */
export function javaSplit(text: string, pattern: string, limit = 0): string[] {
  // java.util.regex.Pattern.split, step for step.
  const re = javaRegex(pattern, 'g');
  const limited = limit > 0;
  const parts: string[] = [];
  let index = 0, count = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = match.index, end = start + match[0].length;
    if (start === end) re.lastIndex++; // step past a zero-width match, as Matcher.find does
    if (!limited || count < limit - 1) {
      if (index === 0 && start === 0 && end === 0) continue; // no empty leading part for a zero-width match at the start
      parts.push(text.slice(index, start));
      index = end;
      count++;
    } else if (count === limit - 1) {
      parts.push(text.slice(index)); // the last part: the rest of the text
      index = end;
      count++;
    }
  }
  if (index === 0) return [text];
  if (!limited || count < limit) parts.push(text.slice(index));
  if (limit === 0) while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}
