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

const sources = new WeakMap<CstNode, string>();

/** Parse Java source code, returns the CST root (which remembers its source, for sourceOf). */
export function parseJava(source: string): CstNode {
  const cst = javaParse(source) as unknown as CstNode;
  sources.set(cst, source);
  return cst;
}

/** The source a CST root from parseJava was parsed from. */
export function sourceOf(cst: CstNode): string | undefined {
  return sources.get(cst);
}

