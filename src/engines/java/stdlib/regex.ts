/**
 * Java regular expressions (java.util.regex) on JavaScript's RegExp, for
 * String.split, matches, replaceAll and replaceFirst (#20).
 *
 * Most syntax students use is the same in both: character classes,
 * \d \w \s, quantifiers, groups, alternation, anchors, backreferences and
 * named groups. Translated: leading inline flags ((?i) (?s) (?m)), \Q…\E
 * quoting, \A \Z \z, \h, \R (any line break), Java's ASCII-only \s, class
 * unions ([a-d[m-z]]), and the POSIX classes \p{Alpha} \p{Digit} \p{Alnum}
 * \p{Upper} \p{Lower} \p{Punct} \p{Space} (and \P{…}). Rejected with an
 * error rather than run differently: possessive quantifiers (a*+), atomic
 * groups ((?>…)), class intersections ([a-z&&[^aeiou]]), inline flags after
 * the start, and other \p{…} classes. A pattern Java's Pattern refuses is
 * its PatternSyntaxException, with Java's description, index and message
 * (#66: `split("+")` is "Dangling meta character '+' near index 0").
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

/** Java's \s: the ASCII whitespace characters only (JavaScript's \s is any Unicode space). */
const JAVA_SPACE = ' \\t\\n\\x0B\\f\\r';

/** PatternSyntaxException.getMessage(): the description, ` near index n`, the pattern, and a caret under the index when it is inside the pattern. */
export function patternSyntaxMessage(desc: string, pattern: string, index: number): string {
  const near = index >= 0 ? ` near index ${index}` : '';
  const caret = index >= 0 && index < pattern.length ? `\n${' '.repeat(index)}^` : '';
  return `${desc}${near}\n${pattern}${caret}`;
}

type PatternError = { desc: string; index: number };

const CATEGORIES = new Set('L Lu Ll Lt Lm Lo LC M Mn Mc Me N Nd Nl No P Pc Pd Ps Pe Pi Pf Po S Sm Sc Sk So Z Zs Zl Zp C Cc Cf Co Cs Cn'.split(' '));

/**
 * Whether Java knows a \p{…} name (only the POSIX ones are translated; the
 * rest are rejected as unsupported): a POSIX class, a general category, a
 * script, block or binary property (Is…, In…, script=…), or a java… method.
 */
function isJavaProperty(name: string): boolean {
  const bare = name.replace(/^Is/, '');
  return POSIX[bare] !== undefined || CATEGORIES.has(bare) || /^(Is|In)\w+$|^java[A-Z]\w*$|^(script|sc|block|blk|general_category|gc)=\w+$/.test(name)
    || ['ASCII', 'Graph', 'Print', 'Cntrl'].includes(bare);
}

/** A PatternSyntaxException the stdlib raises, with the parts its getDescription(), getIndex() and getPattern() return. */
export class PatternSyntaxError extends StdlibError {
  readonly desc: string;
  readonly pattern: string;
  readonly index: number;
  constructor(desc: string, pattern: string, index: number) {
    super(`PatternSyntaxException: ${patternSyntaxMessage(desc, pattern, index)}`);
    this.desc = desc;
    this.pattern = pattern;
    this.index = index;
  }
}

/** A character class from its `[` at `start`: the index of its `]`, or Java's error (an unclosed class, a range backwards). */
function scanClass(p: string, start: number): { end: number } | PatternError {
  let i = start + 1;
  if (p[i] === '^') i++;
  let first = true; // a ] right after [ or [^ is a literal
  let prev: number | undefined; // the last single character, which a - may start a range from
  for (; i < p.length; i++) {
    const c = p[i];
    if (c === ']' && !first) return { end: i };
    first = false;
    if (c === '[') {
      const inner = scanClass(p, i);
      if ('desc' in inner) return inner;
      i = inner.end;
      prev = undefined;
    } else if (c === '\\') {
      if (i + 1 >= p.length) return { desc: 'Unescaped trailing backslash', index: p.length };
      const e = p[++i];
      prev = /[a-zA-Z0-9]/.test(e) ? ({ t: 9, n: 10, r: 13, f: 12 } as Record<string, number>)[e] : e.charCodeAt(0);
    } else if (c === '-' && prev !== undefined && p[i + 1] !== ']') {
      if (i + 1 >= p.length) return { desc: 'Illegal character range', index: i + 1 };
      let j = i + 1;
      if (p[j] === '[') { prev = undefined; continue; }
      let to = p.charCodeAt(j);
      if (p[j] === '\\' && j + 1 < p.length && !/[a-zA-Z0-9]/.test(p[j + 1])) to = p.charCodeAt(++j);
      if (to < prev) return { desc: 'Illegal character range', index: j };
      i = j;
      prev = undefined;
    } else if (c === '&' && p[i + 1] === '&') {
      i++;
      prev = undefined;
    } else {
      prev = c.charCodeAt(0);
    }
  }
  return { desc: 'Unclosed character class', index: p.length - 1 };
}

/**
 * What Java's Pattern refuses in a pattern, as it reports it (#66): a
 * quantifier with nothing to repeat, groups and classes left open or closed
 * too often, a range backwards, a bad counted repetition, a trailing
 * backslash, a bad group name; undefined if Java compiles it.
 */
export function patternError(p: string): PatternError | undefined {
  // (Also what a PatternSyntaxError carries.)
  let depth = 0;
  let atom = false; // what is before could be repeated
  let quantified = false; // just after a quantifier, which one ? or + may make lazy or possessive
  let modified = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    const wasQuantified = quantified;
    quantified = false;
    if (c === '\\') {
      if (i + 1 >= p.length) return { desc: 'Unescaped trailing backslash', index: p.length };
      const e = p[i + 1];
      if (e === 'Q') {
        const end = p.indexOf('\\E', i + 2);
        i = end < 0 ? p.length : end + 1;
      } else if (e === 'k' && p[i + 2] !== '<') {
        return { desc: "\\k is not followed by '<' for named capturing group", index: i + 2 };
      } else if (e === 'x' && !/^[0-9a-fA-F]{2}|^\{/.test(p.slice(i + 2))) {
        return { desc: 'Illegal hexadecimal escape sequence', index: i + 2 };
      } else if (e === 'u' && !/^[0-9a-fA-F]{4}/.test(p.slice(i + 2))) {
        return { desc: 'Illegal Unicode escape sequence', index: i + 2 + /^[0-9a-fA-F]*/.exec(p.slice(i + 2))![0].length };
      } else if (e === 'c' && i + 2 >= p.length) {
        return { desc: 'Illegal control escape sequence', index: i + 1 };
      } else if (/[pPxN]/.test(e) && p[i + 2] === '{') {
        // A property or code point in braces: \p{Alpha}, \x{1F600}; a property Java doesn't have is its error.
        const close = p.indexOf('}', i + 3);
        const name = p.slice(i + 3, close < 0 ? p.length : close);
        if ((e === 'p' || e === 'P') && close >= 0 && !isJavaProperty(name)) return { desc: `Unknown character property name {${name}}`, index: close };
        i = close < 0 ? p.length : close;
      } else if (e === 'k') {
        const close = p.indexOf('>', i + 3);
        i = close < 0 ? p.length : close;
      } else {
        i++;
      }
      atom = true;
      continue;
    }
    if (c === '[') {
      const cls = scanClass(p, i);
      if ('desc' in cls) return cls;
      i = cls.end;
      atom = true;
      continue;
    }
    if (c === '(') {
      if (p[i + 1] === '?') {
        const flags = /^\(\?[idmsuxU-]*\)/.exec(p.slice(i));
        if (flags) {
          i += flags[0].length - 1;
          atom = false;
          continue;
        }
        if (p[i + 2] === '<' && p[i + 3] !== '=' && p[i + 3] !== '!') {
          const close = p.indexOf('>', i + 3);
          if (!/[a-zA-Z]/.test(p[i + 3] ?? '')) return { desc: 'capturing group name does not start with a Latin letter', index: i + 3 };
          if (close < 0) return { desc: "named capturing group is missing trailing '>'", index: p.length };
          i = close;
        } else {
          // (?: (?= (?! (?> (?<= (?<! and a flags group (?i: … ): the header isn't something to repeat.
          const header = /^\(\?(?:[:=!>]|<[=!]|[idmsuxU-]*:)/.exec(p.slice(i));
          if (header) i += header[0].length - 1;
        }
      }
      depth++;
      atom = false;
      continue;
    }
    if (c === ')') {
      if (depth === 0) return { desc: "Unmatched closing ')'", index: i - 1 };
      depth--;
      atom = true;
      continue;
    }
    if (c === '*' || c === '+' || c === '?') {
      if (wasQuantified && !modified && c !== '*') {
        modified = true;
        quantified = true;
        continue;
      }
      if (!atom || wasQuantified) return { desc: `Dangling meta character '${c}'`, index: i };
      atom = false;
      quantified = true;
      modified = false;
      continue;
    }
    if (c === '{' && (atom || wasQuantified)) {
      if (wasQuantified) return { desc: `Dangling meta character '{'`, index: i };
      let j = i + 1;
      // A count's digits, and where one past an int's range is (Java's error there).
      const count = (from: number): { end: number; value: number; overflow?: number } => {
        let k = from, value = 0;
        while (k < p.length && /[0-9]/.test(p[k])) {
          value = value * 10 + Number(p[k]);
          if (value > 0x7fffffff) return { end: k, value, overflow: k };
          k++;
        }
        return { end: k, value };
      };
      const min = count(j);
      if (min.end === j) return { desc: 'Illegal repetition', index: i + 1 };
      if (min.overflow !== undefined) return { desc: 'Illegal repetition range', index: min.overflow };
      j = min.end;
      let max = min.value;
      if (p[j] === ',') {
        const upper = count(j + 1);
        if (upper.overflow !== undefined) return { desc: 'Illegal repetition range', index: upper.overflow };
        max = upper.end === j + 1 ? Infinity : upper.value;
        j = upper.end;
      }
      if (p[j] !== '}') return { desc: 'Unclosed counted closure', index: j };
      if (max < min.value) return { desc: 'Illegal repetition range', index: j };
      i = j;
      atom = false;
      quantified = true;
      modified = false;
      continue;
    }
    atom = c !== '|' && c !== '^' && c !== '$';
  }
  if (depth > 0) return { desc: 'Unclosed group', index: p.length };
  return undefined;
}

/** A Java regex as a JavaScript RegExp; `extraFlags` are added (g for a global search). */
export function javaRegex(pattern: string, extraFlags = ''): RegExp {
  const error = patternError(pattern);
  if (error) throw new PatternSyntaxError(error.desc, pattern, error.index);
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
      if (next === 's') { out += inClass ? JAVA_SPACE : `[${JAVA_SPACE}]`; i++; continue; }
      if (next === 'S' && !inClass) { out += `[^${JAVA_SPACE}]`; i++; continue; }
      // \R: any line break, \r\n as one.
      if (next === 'R' && !inClass) { out += '(?:\\r\\n|[\\n\\x0B\\f\\r\\x85\\u2028\\u2029])'; i++; continue; }
      out += c + (next ?? '');
      i++;
      continue;
    }
    if (inClass) {
      if (c === '&' && source[i + 1] === '&') unsupported('character class intersections (&&)');
      // A class inside a class is their union, [a-d[m-z]]: its members join the outer class.
      if (c === '[') {
        if (source[i + 1] === '^') unsupported('a negated class inside a class');
        inClass++;
        continue;
      }
      if (c === ']') {
        inClass--;
        if (inClass > 0) continue;
      }
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
    // A { with nothing before it to repeat is a literal { in Java (a syntax error in JavaScript).
    if (c === '{' && (i === 0 || source[i - 1] === '(' || source[i - 1] === '|')) {
      out += '\\{';
      continue;
    }
    // A lazy ? after a quantifier is itself not one.
    afterQuantifier = c === '*' || c === '+' || c === '}' || (c === '?' && !quantified);
    out += c;
  }
  try {
    return new RegExp(out, flags + extraFlags);
  } catch (e) {
    // What Java accepts and the translation doesn't: the browser's reason, without its own wording around it.
    const reason = (e as Error).message.replace(/^Invalid regular expression: \/.*\/[a-z]*: /s, '');
    throw new PatternSyntaxError(reason, pattern, -1);
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
