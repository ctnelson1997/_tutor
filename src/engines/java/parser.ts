/**
 * Java Parser Wrapper
 *
 * Wraps the java-parser library (Chevrotain-based) to parse Java source code.
 * Provides utilities for navigating the CST (Concrete Syntax Tree).
 */

import { parse as javaParse } from 'java-parser';

export interface CstNode {
  name: string;
  children: Record<string, (CstNode | CstToken)[]>;
  location?: { startLine: number; startColumn: number; endLine: number; endColumn: number };
}

export interface CstToken {
  image: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  tokenType?: { name: string };
}

export function isCstNode(item: CstNode | CstToken): item is CstNode {
  return 'children' in item && 'name' in item;
}

export function isCstToken(item: CstNode | CstToken): item is CstToken {
  return 'image' in item && !('children' in item);
}

/** Get first child node by key */
export function child(node: CstNode, key: string): CstNode | undefined {
  const items = node.children[key];
  if (!items || items.length === 0) return undefined;
  const item = items[0];
  return isCstNode(item) ? item : undefined;
}

/** Get all child nodes by key */
export function children(node: CstNode, key: string): CstNode[] {
  const items = node.children[key];
  if (!items) return [];
  return items.filter(isCstNode);
}

/** Get first token by key */
export function token(node: CstNode, key: string): CstToken | undefined {
  const items = node.children[key];
  if (!items || items.length === 0) return undefined;
  const item = items[0];
  return isCstToken(item) ? item : undefined;
}

/** Get all tokens by key */
export function tokens(node: CstNode, key: string): CstToken[] {
  const items = node.children[key];
  if (!items) return [];
  return items.filter(isCstToken);
}

/** Check if a node has a child key */
export function has(node: CstNode, key: string): boolean {
  return !!node.children[key] && node.children[key].length > 0;
}

/** Get the line number from any node/token (first token found) */
export function getLine(node: CstNode | CstToken): number {
  if (isCstToken(node)) return node.startLine;
  // Walk the tree to find the first token
  for (const items of Object.values(node.children)) {
    for (const item of items) {
      const line = getLine(item);
      if (line > 0) return line;
    }
  }
  return 0;
}

/** Parse Java source code, returns the CST root */
export function parseJava(source: string): CstNode {
  const cst = javaParse(source);
  return cst as unknown as CstNode;
}

/**
 * A readable version of java-parser's error ("Sad sad panda, parsing errors
 * detected in line: 4, column: 5! Expecting --> ';' <-- but found -->
 * 'System' <--! ->compilationUnit ->…"): `Syntax error: expected ';' but
 * found 'System'`, with the line to mark. A missing `;` is reported on the
 * line it belongs at the end of, as javac does, not on the next token's line.
 */
export function describeParseError(rawMessage: string, source: string): { message: string; line?: number } {
  const [header = '', ...rest] = rawMessage.split('\n');
  const position = /line: (\d+), column: (\d+)/.exec(header);
  let line = position ? Number(position[1]) : undefined;
  const column = position ? Number(position[2]) : undefined;
  const detail = rest.join('\n').split('\n\t->')[0].trim();

  const expecting = /^Expecting --> '(.*)' <-- but found --> '(.*)' <--!/s.exec(detail);
  const foundAt = /but found: '(.*)'/s.exec(detail);
  let message: string;
  if (expecting) {
    const [, expected, found] = expecting;
    message = `expected '${expected}' but found ${found ? `'${found}'` : 'the end of the code'}`;
    if (expected === ';' && line !== undefined && column !== undefined) line = lineBefore(source, line, column) ?? line;
  } else if (foundAt) {
    message = foundAt[1] ? `unexpected '${foundAt[1]}'` : 'the code ends too early';
  } else {
    message = detail.split('\n')[0] || header;
  }
  return line !== undefined ? { message: `Syntax error: ${message}`, line } : { message: `Syntax error: ${message}` };
}

/** The line of the last non-blank character before (line, column), both 1-based. */
function lineBefore(source: string, line: number, column: number): number | undefined {
  const lines = source.split(/\r?\n/);
  let text = (lines[line - 1] ?? '').slice(0, column - 1);
  for (let l = line; l >= 1; l--) {
    if (text.trim() !== '') return l;
    text = lines[l - 2] ?? '';
  }
  return undefined;
}
