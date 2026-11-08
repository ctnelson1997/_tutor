import * as acorn from 'acorn';
import type { CodeFlag } from '../../types/engine';

/**
 * The shared-link warning's check (#95): which browser features a program
 * reaches. It reads acorn's tree, so comments and strings don't count, and a
 * name the program declares itself (its own `function fetch() {}`) isn't the
 * browser's. A heuristic: code can always hide what it does.
 */

const MESSAGES = {
  fetch: 'This code makes network requests (fetch)',
  xhr: 'This code uses XMLHttpRequest',
  webSocket: 'This code opens WebSocket connections',
  eventSource: 'This code opens a server connection (EventSource)',
  beacon: 'This code sends data with navigator.sendBeacon',
  cookie: 'This code accesses cookies',
  localStorage: 'This code accesses localStorage',
  sessionStorage: 'This code accesses sessionStorage',
  indexedDB: 'This code accesses IndexedDB storage',
  eval: 'This code uses dynamic eval()',
  function: 'This code uses the Function constructor',
  computed: 'This code reaches browser features by a computed name (such as self[name])',
  navigate: 'This code may navigate the page',
  open: 'This code may open new windows',
  import: 'This code imports external scripts',
  worker: 'This code starts web workers',
} as const;

type Kind = keyof typeof MESSAGES;

/** Globals that are a finding wherever the program uses them. */
const GLOBALS = new Map<string, Kind>([
  ['fetch', 'fetch'],
  ['XMLHttpRequest', 'xhr'],
  ['WebSocket', 'webSocket'],
  ['EventSource', 'eventSource'],
  ['localStorage', 'localStorage'],
  ['sessionStorage', 'sessionStorage'],
  ['indexedDB', 'indexedDB'],
  ['eval', 'eval'],
  ['Function', 'function'],
  ['open', 'open'],
  ['importScripts', 'import'],
  ['Worker', 'worker'],
  ['SharedWorker', 'worker'],
]);

/** Names of the global object itself: `self.fetch` is `fetch`. */
const GLOBAL_OBJECTS = new Set(['self', 'window', 'globalThis']);

/** Used when the program doesn't parse: the old scan of the text, with the newer APIs added. */
const FALLBACK_PATTERNS: { pattern: RegExp; kind: Kind }[] = [
  { pattern: /\bfetch\s*\(/, kind: 'fetch' },
  { pattern: /\bXMLHttpRequest\b/, kind: 'xhr' },
  { pattern: /\bWebSocket\b/, kind: 'webSocket' },
  { pattern: /\bEventSource\b/, kind: 'eventSource' },
  { pattern: /\bsendBeacon\b/, kind: 'beacon' },
  { pattern: /\bdocument\.cookie\b/, kind: 'cookie' },
  { pattern: /\blocalStorage\b/, kind: 'localStorage' },
  { pattern: /\bsessionStorage\b/, kind: 'sessionStorage' },
  { pattern: /\bindexedDB\b/, kind: 'indexedDB' },
  { pattern: /\beval\s*\(/, kind: 'eval' },
  { pattern: /\bFunction\s*\(|\bconstructor\s*\.\s*constructor\b/, kind: 'function' },
  { pattern: /\b(?:self|window|globalThis)\s*\[/, kind: 'computed' },
  { pattern: /\blocation\s*\.\s*(href|replace|assign)\b|\blocation\s*=(?![=>])/, kind: 'navigate' },
  { pattern: /\bwindow\.open\s*\(/, kind: 'open' },
  { pattern: /\bimportScripts\s*\(|\bimport\s*\(/, kind: 'import' },
  { pattern: /\b(?:Shared)?Worker\s*\(/, kind: 'worker' },
];

export function analyzeCode(code: string): CodeFlag[] {
  let found: Set<Kind>;
  try {
    found = scanTree(acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' }));
  } catch {
    // A program acorn can't parse (or too deep to walk) is still scanned.
    found = new Set(FALLBACK_PATTERNS.filter(({ pattern }) => pattern.test(code)).map(({ kind }) => kind));
  }
  return (Object.keys(MESSAGES) as Kind[])
    .filter((kind) => found.has(kind))
    .map((kind) => ({ level: 'warning', message: MESSAGES[kind] }));
}

// ── Scopes: which names the program declares itself ──

// acorn's nodes, walked generically by their fields, as the instrumenter does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

interface Scope { names: Set<string>; parent: Scope | null }

function isFunction(node: AnyNode): boolean {
  return node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
}

function children(node: AnyNode): AnyNode[] {
  const out: AnyNode[] = [];
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const v of value) if (v && typeof v.type === 'string') out.push(v);
    } else if (value && typeof (value as AnyNode).type === 'string') {
      out.push(value);
    }
  }
  return out;
}

/** The names a binding pattern declares. */
function patternNames(pattern: AnyNode, names: Set<string>): void {
  if (!pattern) return;
  switch (pattern.type) {
    case 'Identifier': names.add(pattern.name); break;
    case 'ObjectPattern': for (const p of pattern.properties) patternNames(p.type === 'RestElement' ? p.argument : p.value, names); break;
    case 'ArrayPattern': for (const e of pattern.elements) patternNames(e, names); break;
    case 'AssignmentPattern': patternNames(pattern.left, names); break;
    case 'RestElement': patternNames(pattern.argument, names); break;
  }
}

/** `var` declarations anywhere in a function's body, not in the functions or classes inside it. */
function hoistedVars(node: AnyNode, names: Set<string>): void {
  if (isFunction(node) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    for (const d of node.declarations) patternNames(d.id, names);
  }
  for (const child of children(node)) hoistedVars(child, names);
}

/** let, const, class and function declarations directly in a list of statements. */
function lexicalNames(statements: AnyNode[], names: Set<string>): void {
  for (const s of statements) {
    if (s.type === 'VariableDeclaration' && s.kind !== 'var') {
      for (const d of s.declarations) patternNames(d.id, names);
    } else if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) {
      names.add(s.id.name);
    }
  }
}

/** The scope a node opens, or null. */
function scopeNames(node: AnyNode): Set<string> | null {
  const names = new Set<string>();
  switch (node.type) {
    case 'Program':
      hoistedVars(node, names);
      lexicalNames(node.body, names);
      return names;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      for (const p of node.params) patternNames(p, names);
      if (node.type === 'FunctionExpression' && node.id) names.add(node.id.name);
      if (node.body.type === 'BlockStatement') {
        hoistedVars(node.body, names);
        lexicalNames(node.body.body, names);
      }
      return names;
    case 'StaticBlock':
      for (const s of node.body) hoistedVars(s, names);
      lexicalNames(node.body, names);
      return names;
    case 'BlockStatement':
      lexicalNames(node.body, names);
      return names;
    case 'SwitchStatement':
      lexicalNames(node.cases.flatMap((c: AnyNode) => c.consequent), names);
      return names;
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement': {
      const head = node.type === 'ForStatement' ? node.init : node.left;
      if (head?.type !== 'VariableDeclaration' || head.kind === 'var') return null;
      lexicalNames([head], names);
      return names;
    }
    case 'CatchClause':
      patternNames(node.param, names);
      return names;
    case 'ClassExpression':
      if (!node.id) return null;
      names.add(node.id.name);
      return names;
  }
  return null;
}

function declared(name: string, scope: Scope | null): boolean {
  for (let s = scope; s; s = s.parent) if (s.names.has(name)) return true;
  return false;
}

// ── The scan ──

/** A member's name when the source spells it out: `a.b`, `a["b"]`, a template without substitutions. */
function staticKey(member: AnyNode): string | null {
  const p = member.property;
  if (!member.computed) return p.type === 'Identifier' ? p.name : null;
  if (p.type === 'Literal' && (typeof p.value === 'string' || typeof p.value === 'number')) return String(p.value);
  if (p.type === 'TemplateLiteral' && p.expressions.length === 0) return p.quasis[0].value.cooked ?? null;
  return null;
}

function scanTree(program: acorn.Program): Set<Kind> {
  const found = new Set<Kind>();

  /** The global an expression names: an undeclared name, or a static member of the global object. */
  const globalName = (node: AnyNode, scope: Scope | null): string | null => {
    if (node.type === 'Identifier') return declared(node.name, scope) ? null : node.name;
    if (node.type !== 'MemberExpression') return null;
    const object = globalName(node.object, scope);
    return object !== null && GLOBAL_OBJECTS.has(object) ? staticKey(node) : null;
  };

  const isLocation = (node: AnyNode, scope: Scope | null): boolean =>
    globalName(node, scope) === 'location' ||
    (node.type === 'MemberExpression' && staticKey(node) === 'location' && globalName(node.object, scope) === 'document');

  const noteGlobal = (name: string, node: AnyNode, parent: AnyNode): void => {
    const kind = GLOBALS.get(name);
    if (!kind) return;
    // `x instanceof Function` only compares, and `Function.prototype.call` isn't the constructor.
    if (kind === 'function' && parent?.type === 'BinaryExpression' && parent.operator === 'instanceof' && parent.right === node) return;
    if (kind === 'function' && parent?.type === 'MemberExpression' && parent.object === node && staticKey(parent) === 'prototype') return;
    found.add(kind);
  };

  const checkMember = (node: AnyNode, parent: AnyNode, scope: Scope | null): void => {
    const key = staticKey(node);
    const object = globalName(node.object, scope);
    const name = globalName(node, scope);
    if (name !== null) noteGlobal(name, node, parent);
    else if (key === null && object !== null && GLOBAL_OBJECTS.has(object)) found.add('computed');
    if (object === 'navigator' && key === 'sendBeacon') found.add('beacon');
    if (object === 'document' && key === 'cookie') found.add('cookie');
    if ((key === 'href' || key === 'replace' || key === 'assign') && isLocation(node.object, scope)) found.add('navigate');
    // `[].constructor.constructor` and `Function.prototype.constructor` are Function.
    if (key === 'constructor' && node.object.type === 'MemberExpression') {
      const inner = staticKey(node.object);
      if (inner === 'constructor' || (inner === 'prototype' && globalName(node.object.object, scope) === 'Function')) found.add('function');
    }
  };

  /** A binding pattern: its names are declarations, its defaults and computed keys are code. */
  const visitPattern = (pattern: AnyNode, scope: Scope | null): void => {
    if (!pattern) return;
    switch (pattern.type) {
      case 'Identifier': return;
      case 'ObjectPattern':
        for (const p of pattern.properties) {
          if (p.type === 'RestElement') visitPattern(p.argument, scope);
          else {
            if (p.computed) visit(p.key, p, scope);
            visitPattern(p.value, scope);
          }
        }
        return;
      case 'ArrayPattern': for (const e of pattern.elements) visitPattern(e, scope); return;
      case 'AssignmentPattern': visitPattern(pattern.left, scope); visit(pattern.right, pattern, scope); return;
      case 'RestElement': visitPattern(pattern.argument, scope); return;
      default: visit(pattern, null, scope);
    }
  };

  const visit = (node: AnyNode, parent: AnyNode, outer: Scope | null): void => {
    if (!node || typeof node.type !== 'string') return;
    const names = scopeNames(node);
    const scope = names ? { names, parent: outer } : outer;
    switch (node.type) {
      case 'Identifier':
        if (!declared(node.name, scope)) noteGlobal(node.name, node, parent);
        return;
      case 'MemberExpression':
        visit(node.object, node, scope);
        if (node.computed) visit(node.property, node, scope);
        checkMember(node, parent, scope);
        return;
      case 'Property':
      case 'MethodDefinition':
      case 'PropertyDefinition':
        if (node.computed) visit(node.key, node, scope);
        visit(node.value, node, scope);
        return;
      case 'VariableDeclarator':
        visitPattern(node.id, scope);
        visit(node.init, node, scope);
        return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        for (const p of node.params) visitPattern(p, scope);
        visit(node.body, node, scope);
        return;
      case 'ClassDeclaration':
      case 'ClassExpression':
        visit(node.superClass, node, scope);
        visit(node.body, node, scope);
        return;
      case 'CatchClause':
        visitPattern(node.param, scope);
        visit(node.body, node, scope);
        return;
      case 'LabeledStatement':
        visit(node.body, node, scope);
        return;
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'MetaProperty':
        return;
      case 'ImportExpression':
        found.add('import');
        break;
      case 'AssignmentExpression':
        if (isLocation(node.left, scope)) found.add('navigate');
        break;
    }
    for (const child of children(node)) visit(child, node, scope);
  };

  visit(program, null, null);
  return found;
}
