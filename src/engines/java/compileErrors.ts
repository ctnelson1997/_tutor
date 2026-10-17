/**
 * Compile errors as javac reports them (#23): java-parser's syntax errors
 * translated into javac's messages, and the listing javac prints for a
 * program that doesn't compile.
 */

import type { RunError } from '../../types/snapshot';

/** A compile error: javac's message (its first line is the error, the rest details such as `  symbol:   variable z`) and where its caret goes, 1-based. */
export interface CompileError {
  message: string;
  line: number;
  column: number;
  /** javac simplified it (an argument mismatch reported as the argument's own error), so the listing ends with its note. */
  simplified?: boolean;
}

/** javac stops listing errors after this many (its -Xmaxerrs default). */
const MAX_ERRORS = 100;

/**
 * javac's listing: each error as `Main.java:3: error: ';' expected`, the
 * source line, a caret under its column and the message's other lines, then
 * `1 error` or `N errors`.
 */
export function javacListing(errors: CompileError[], source: string, file: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  for (const e of errors.slice(0, MAX_ERRORS)) {
    const [first, ...details] = e.message.split('\n');
    const text = lines[e.line - 1] ?? '';
    const pad = text.slice(0, Math.max(0, e.column - 1)).replace(/[^\t]/g, ' ');
    out.push(`${file}:${e.line}: error: ${first}`, text, `${pad}^`, ...details);
  }
  const shown = Math.min(errors.length, MAX_ERRORS);
  if (errors.slice(0, MAX_ERRORS).some(e => e.simplified)) out.push('Note: Some messages have been simplified; recompile with -Xdiags:verbose to get full output');
  out.push(shown === 1 ? '1 error' : `${shown} errors`);
  if (errors.length > MAX_ERRORS) {
    out.push(`only showing the first ${MAX_ERRORS} errors, of ${errors.length} total; use -Xmaxerrs if you would like to see more`);
  }
  return out.join('\n');
}

/** How a program that doesn't compile ends: its first error, the line of each one, and javac's listing for the console. */
export function compileFailure(errors: CompileError[], source: string, file = javaFileName(source)): RunError {
  return {
    kind: 'compile',
    message: errors[0].message,
    line: errors[0].line,
    lines: errors.slice(0, MAX_ERRORS).map(e => e.line),
    stderr: javacListing(errors, source, file),
  };
}

/** The file javac would want the source saved as: after its public class, else its first class (Main.java). */
export function javaFileName(source: string): string {
  const name = /\bpublic\s+(?:(?:final|abstract|sealed|strictfp)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/.exec(source)
    ?? /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/.exec(source);
  return `${name?.[1] ?? 'Main'}.java`;
}

// ── Syntax errors ──

/** Rules where only a top-level declaration can start. */
const TOP_LEVEL_RULES = new Set(['compilationUnit', 'ordinaryCompilationUnit', 'typeDeclaration']);
/** Rules where a class or interface member can start. */
const MEMBER_RULES = new Set([
  'classBody', 'classBodyDeclaration', 'classMemberDeclaration', 'interfaceBody', 'interfaceMemberDeclaration',
  'enumBodyDeclarations', 'recordBody', 'recordBodyDeclaration',
]);
/** Rules of an argument list, where javac expects `)` or `,`. */
const ARGUMENT_RULES = new Set([
  'methodInvocationSuffix', 'argumentList', 'classInstanceCreationExpression', 'unqualifiedClassInstanceCreationExpression',
  'explicitConstructorInvocation',
]);

/**
 * java-parser's error ("Sad sad panda, parsing errors detected in line: 4,
 * column: 5! Expecting --> ';' <-- but found --> 'System' <--!
 * ->compilationUnit ->…") as javac reports it: `';' expected`, with the caret
 * just after the token before, where javac puts it. What javac says when
 * nothing could come next depends on what was being parsed: a declaration
 * (`class, interface, enum, or record expected`), a member (`<identifier>
 * expected`), a statement (`not a statement`), or an expression (`illegal
 * start of expression`). Lexical errors (an unclosed string, character
 * literal or comment, an illegal character) come from scanning the source,
 * since java-parser's lexer skips them or reports them as something else.
 */
export function describeParseError(rawMessage: string, source: string): CompileError {
  const [header = '', ...rest] = rawMessage.split('\n');
  const position = /line: (\d+), column: (\d+)/.exec(header);
  const at = position ? { line: Number(position[1]), column: Number(position[2]) } : undefined;
  const lexical = lexicalError(source);
  if (lexical && (!at || lexical.line <= at.line)) return lexical;

  const [detail = '', ...rules] = rest.join('\n').split('\n\t->').map(part => part.trim());
  const innermost = rules[rules.length - 1] ?? '';
  if (header.includes('lexing errors')) {
    // An unmatched `}` empties java-parser's lexer mode stack: javac then expects a new declaration.
    if (at && detail.startsWith('Unable to pop Lexer Mode')) return { message: 'class, interface, enum, or record expected', ...at };
    const ch = /unexpected character: ->(.)<-/su.exec(detail);
    return { message: ch ? `illegal character: '${javacChar(ch[1])}'` : 'illegal character', ...(at ?? endOfCode(source)) };
  }
  const expecting = /^Expecting --> '(.*)' <-- but found --> '(.*)' <--!/s.exec(detail);
  if (!at || (expecting && expecting[2] === '')) return { message: 'reached end of file while parsing', ...endOfCode(source) };
  if (expecting) {
    const [, expected, found] = expecting;
    if (found === 'else') return { message: "'else' without 'if'", ...at };
    const message = expected === ')' && ARGUMENT_RULES.has(innermost) ? "')' or ',' expected" : `'${expected}' expected`;
    return { message, ...(afterPrevious(source, at) ?? at) };
  }
  if (TOP_LEVEL_RULES.has(innermost)) {
    // javac points past the modifiers, at the word that should have been `class`.
    const text = (source.split(/\r?\n/)[at.line - 1] ?? '').slice(at.column - 1);
    const modifiers = /^(?:(?:public|protected|private|static|final|abstract|sealed|strictfp)\s+)*/.exec(text)?.[0].length ?? 0;
    return { message: 'class, interface, enum, or record expected', line: at.line, column: at.column + modifiers };
  }
  if (MEMBER_RULES.has(innermost)) {
    const text = (source.split(/\r?\n/)[at.line - 1] ?? '').slice(at.column - 1);
    const method = /^(?:(?:public|protected|private|static|final|abstract|synchronized)\s+)*[A-Za-z_$][\w$]*\s*\(/.exec(text);
    if (method) {
      return { message: 'invalid method declaration; return type required', line: at.line, column: at.column + method[0].search(/[A-Za-z_$][\w$]*\s*\($/) };
    }
    // javac read a type (`pubic`, `System.out.println`) and wanted the member's name after it.
    return { message: '<identifier> expected', line: at.line, column: at.column + (/^[\w$.]*/.exec(text)?.[0].length ?? 0) };
  }
  if (innermost === 'primarySuffix') {
    // After a `.`, javac wanted a name where the next token is.
    const text = (source.split(/\r?\n/)[at.line - 1] ?? '').slice(at.column - 1);
    const dot = /^\.\s*/.exec(text)?.[0].length ?? 0;
    return { message: '<identifier> expected', line: at.line, column: at.column + (dot < text.length ? dot : 0) };
  }
  if (innermost === 'blockStatement' || innermost === 'blockStatements') return { message: 'not a statement', ...at };
  if (innermost === 'statement' || innermost.endsWith('Statement')) return { message: 'illegal start of statement', ...at };
  return { message: 'illegal start of expression', ...at };
}

/** A character as javac's "illegal character" message shows it: non-ASCII and control characters as `\uXXXX`. */
function javacChar(ch: string): string {
  const code = ch.charCodeAt(0);
  return code < 0x20 || code > 0x7e ? `\\u${code.toString(16).padStart(4, '0')}` : ch;
}

/** Just after the last non-blank character before (line, column), both 1-based: where javac puts a missing token. */
function afterPrevious(source: string, at: { line: number; column: number }): { line: number; column: number } | undefined {
  const lines = source.split(/\r?\n/);
  let text = (lines[at.line - 1] ?? '').slice(0, at.column - 1);
  for (let l = at.line; l >= 1; l--) {
    const end = text.trimEnd().length;
    if (end > 0) return { line: l, column: end + 1 };
    text = lines[l - 2] ?? '';
  }
  return undefined;
}

/** Just after the last non-blank character of the source: where javac reports reaching its end. */
function endOfCode(source: string): { line: number; column: number } {
  return afterPrevious(source, { line: source.split(/\r?\n/).length, column: Infinity }) ?? { line: 1, column: 1 };
}

/**
 * The first lexical error in the source, as javac reports it: an unclosed
 * comment, string literal or text block, an empty or unclosed character
 * literal, or a character that can't appear outside them (`#`, a curly quote
 * pasted from a document).
 */
export function lexicalError(source: string): CompileError | undefined {
  let line = 1, column = 1;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const here = { line, column };
    let next = i + 1;
    if (ch === '/' && source[i + 1] === '/') {
      next = source.indexOf('\n', i);
      if (next < 0) next = source.length;
    } else if (ch === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      if (close < 0) return { message: 'unclosed comment', ...here };
      next = close + 2;
    } else if (source.startsWith('"""', i)) {
      next = i + 3;
      while (next < source.length && !source.startsWith('"""', next)) next += source[next] === '\\' ? 2 : 1;
      if (next >= source.length) return { message: 'unclosed text block', ...here };
      next += 3;
    } else if (ch === '"') {
      while (next < source.length && source[next] !== '"' && source[next] !== '\n' && source[next] !== '\r') next += source[next] === '\\' ? 2 : 1;
      if (source[next] !== '"') return { message: 'unclosed string literal', ...here };
      next++;
    } else if (ch === "'") {
      if (source[next] === "'") return { message: 'empty character literal', ...here };
      if (next >= source.length || source[next] === '\n' || source[next] === '\r') return { message: 'illegal line end in character literal', ...here };
      if (source[next] === '\\') {
        const escape = /^\\(?:u+[0-9a-fA-F]{4}|[0-3]?[0-7]{1,2}|.)/s.exec(source.slice(next));
        next += escape ? escape[0].length : 1;
      } else {
        next++;
      }
      if (source[next] !== "'") return { message: 'unclosed character literal', ...here };
      next++;
    } else if (ch === '#' || ch === '`' || (ch === '\\' && source[i + 1] !== 'u')
      || (ch.charCodeAt(0) > 0x7e && !/[\p{L}\p{N}\p{Mn}\p{Mc}\p{Pc}\p{Sc}]/u.test(ch))) {
      return { message: `illegal character: '${javacChar(ch)}'`, ...here };
    }
    for (let k = i; k < next; k++) {
      if (source[k] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    i = next;
  }
  return undefined;
}
