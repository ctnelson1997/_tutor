/**
 * AST Instrumenter
 *
 * Parses user JavaScript with Acorn, then walks the AST and injects:
 *  - __capture__(line, { ...vars }) before each statement, and once at the
 *    end of the program (steps as pythontutor.com takes them, #24)
 *  - __condition__(test, line, text, { ...vars }) around if and loop tests
 *  - __pushFrame__(name, { ...params }) at function entry
 *  - __popFrame__(value, line) at a return or the function's closing brace,
 *    a step showing the returned value
 *  - Loop guards to prevent infinite loops
 *  - Blocks eval() and new Function()
 */

import * as acorn from 'acorn';
import { generate } from 'astring';

// We work with acorn's ESTree nodes but need to cast to extend them
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

// Module-level state: when inside a block-scope frame (e.g. a for-loop with
// let/const), this holds the variable names that belong to the PARENT frame.
// buildCaptureExpression reads this to emit a third argument to __capture__.
let _parentVarNames: string[] | null = null;

// Tracks function nesting depth so we can identify closure variables.
let _functionDepth = 0;

// When inside a nested function, holds the names of variables closed over
// from enclosing function scope(s). buildCaptureExpression reads this to
// emit a fourth argument to __capture__.
let _closureVarNames: string[] | null = null;

/**
 * Instrument a user's source code for step-by-step state capture.
 * Returns the instrumented source string.
 * Throws on parse errors.
 */
export function instrument(source: string): string {
  // Parse the user's code
  const ast = acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    locations: true,
  }) as AnyNode;
  // Each function's own text, before instrumentation changes it (#47).
  const originalFunctions = functionTexts(ast, source);

  // Collect scope info: we walk the AST and build a scope tree
  // For simplicity, we do a two-pass approach:
  //  1. Collect all variable declarations per scope
  //  2. Inject capture/frame calls

  // Pass: inject instrumentation by transforming the body arrays
  instrumentBlock(ast.body, [], true);

  // Prepend the eval/Function blockers and loop counter
  const preamble = `var __loopCount = 0; var __MAX_LOOPS = 10000;
var eval = undefined;
`;

  const body = preamble + generate(ast);
  return programFacts(body, originalFunctions) + body;
}

// ── What the program could see of its instrumentation (#47) ──

/** A function's text as Function.prototype.toString gives it, and what kind of function it is. */
interface FunctionText { kind: string; text: string; line: number }

/** Walk a tree in source order, with each node's parent. */
function walkTree(node: AnyNode, visit: (n: AnyNode, parent: AnyNode | null) => void, parent: AnyNode | null = null): void {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key.startsWith('_')) continue;
    if (Array.isArray(value)) for (const v of value) walkTree(v, visit, node);
    else if (value && typeof (value as AnyNode).type === 'string') walkTree(value, visit, node);
  }
}

/**
 * Every function and class of a program, in source order, with the text
 * Function.prototype.toString returns for it: the node's own span; for a
 * method, from its key (its get, async or * included, static not).
 */
function functionTexts(ast: AnyNode, text: string): FunctionText[] {
  const out: FunctionText[] = [];
  walkTree(ast, (node, parent) => {
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      out.push({ kind: 'class', text: text.slice(node.start, node.end), line: node.loc?.start.line ?? 0 });
    } else if (FUNCTION_TYPES.has(node.type)) {
      if (node.id?.name === '__globals__') return;
      const member = parent && parent.value === node && (parent.type === 'MethodDefinition' || (parent.type === 'Property' && (parent.method || parent.kind !== 'init'))) ? parent : null;
      let start = member ? member.start : node.start;
      if (member?.static) start += /^static\s*/.exec(text.slice(start))?.[0].length ?? 0;
      out.push({ kind: member ? 'method' : node.type, text: text.slice(start, node.end), line: node.loc?.start.line ?? 0 });
    }
  });
  return out;
}

/** The key the runtime finds a function's original text by: its instrumented text's length and hash. */
export function sourceKey(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return text.length + ':' + (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

const STEP_CALLS = new Set(['__capture__', '__condition__', '__popFrame__', '__endScript__']);

/**
 * Two lines that go before the instrumented program, telling the runtime
 * what the program must see instead of its instrumentation:
 *   __programLines__([...]): the program's line for each line of the
 *     instrumented code (the line of the step before it), so stack traces
 *     name the program's lines;
 *   __sourceTexts__({...}): each function's own text, by its instrumented
 *     text's key, for Function.prototype.toString.
 * If the instrumented program's functions don't line up with the
 * program's, the texts are left out rather than risk a wrong one.
 */
function programFacts(body: string, originals: FunctionText[]): string {
  const tree = acorn.parse(body, { ecmaVersion: 'latest', sourceType: 'script', locations: true }) as AnyNode;
  const instrumented = functionTexts(tree, body);
  const texts: Record<string, string> = {};
  const marks: [number, number][] = [];
  if (instrumented.length === originals.length && instrumented.every((f, i) => f.kind === originals[i].kind)) {
    instrumented.forEach((f, i) => {
      if (f.text !== originals[i].text) texts[sourceKey(f.text)] = originals[i].text;
      marks.push([f.line, originals[i].line]);
    });
  }
  walkTree(tree, node => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || !STEP_CALLS.has(node.callee.name)) return;
    const arg = node.arguments[node.callee.name === '__capture__' || node.callee.name === '__endScript__' ? 0 : 1];
    const line = arg?.type === 'Literal' ? arg.value : arg?.type === 'ArrayExpression' ? arg.elements[0]?.value : null;
    if (typeof line === 'number' && line > 0) marks.push([node.loc.start.line, line]);
  });
  // Line by line, the program's line of the nearest step at or before it (the two lines above come first).
  marks.sort((a, b) => a[0] - b[0]);
  const lineCount = body.split('\n').length;
  // (index 0 is unused; the two lines of facts map to no line)
  const lines: number[] = [0, 0, 0];
  let m = 0;
  let current = 0;
  for (let line = 1; line <= lineCount; line++) {
    while (m < marks.length && marks[m][0] <= line) current = marks[m++][1];
    lines.push(current);
  }
  return `__programLines__(${JSON.stringify(lines)});\n__sourceTexts__(${JSON.stringify(texts)});\n`;
}

/**
 * Collect hoisted declarations from a block (var + function declarations).
 * These are safe to reference from the very start of the scope.
 */
function collectHoistedNames(body: AnyNode[]): string[] {
  const names: string[] = [];
  for (const stmt of body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      names.push(stmt.id.name);
    } else if (stmt.type === 'VariableDeclaration' && stmt.kind === 'var') {
      for (const decl of stmt.declarations) {
        extractPatternNames(decl.id, names);
      }
    }
  }
  return names;
}

/**
 * Collect variable names declared by a single statement.
 */
function collectDeclaredNamesFromStmt(stmt: AnyNode): string[] {
  const names: string[] = [];
  if (stmt.type === 'VariableDeclaration') {
    for (const decl of stmt.declarations) {
      extractPatternNames(decl.id, names);
    }
  } else if (stmt.type === 'FunctionDeclaration' && stmt.id) {
    names.push(stmt.id.name);
  } else if (stmt.type === 'ClassDeclaration' && stmt.id) {
    names.push(stmt.id.name);
  }
  return names;
}

/**
 * Extract variable names from a destructuring pattern or identifier.
 */
function extractPatternNames(pattern: AnyNode, names: string[]): void {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    names.push(pattern.name);
  } else if (pattern.type === 'ObjectPattern') {
    for (const prop of pattern.properties) {
      if (prop.type === 'RestElement') {
        extractPatternNames(prop.argument, names);
      } else {
        extractPatternNames(prop.value, names);
      }
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const elem of pattern.elements) {
      if (elem) extractPatternNames(elem, names);
    }
  } else if (pattern.type === 'RestElement') {
    extractPatternNames(pattern.argument, names);
  } else if (pattern.type === 'AssignmentPattern') {
    extractPatternNames(pattern.left, names);
  }
}

/**
 * Get all variable names that are in scope at a given block level.
 * `scopeChain` is an array of scope-name strings we track for naming.
 */
function buildCaptureExpression(varNames: string[], line: number, columnRange?: { start: { column: number }; end: { column: number } }): AnyNode {
  // __capture__(line, { var1: var1, var2: var2, ... })
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: '__capture__' },
      arguments: [buildLineArg(line, columnRange), ...buildVarArgs(varNames)],
      optional: false,
    },
  };
}

/**
 * The variables a capture (or condition) refreshes: `{ a, b }`; inside a block
 * scope, the names that belong to the parent frame, so the runtime can
 * distribute them; inside a closure, the closed-over variables, which the
 * runtime shows separately on the frame.
 */
function buildVarArgs(varNames: string[]): AnyNode[] {
  const args: AnyNode[] = [buildVarsObject(varNames)];
  if (_parentVarNames) {
    args.push({
      type: 'ArrayExpression',
      elements: _parentVarNames.map((n) => ({
        type: 'Literal',
        value: n,
      })),
    });
  }
  if (_closureVarNames && _closureVarNames.length > 0) {
    // Ensure the parent names argument exists (null placeholder if no block scope)
    if (!_parentVarNames) {
      args.push({ type: 'Literal', value: null, raw: 'null' });
    }
    args.push(buildVarsObject(_closureVarNames));
  }
  return args;
}

/** `{ a, b }`: each variable by its name. */
function buildVarsObject(names: string[]): AnyNode {
  return {
    type: 'ObjectExpression',
    properties: names.map((name) => ({
      type: 'Property',
      key: { type: 'Identifier', name },
      value: { type: 'Identifier', name },
      kind: 'init',
      shorthand: true,
      computed: false,
      method: false,
    })),
  };
}

function buildPushFrame(name: string, paramNames: string[], isBlockScope = false, closureVarNames?: string[] | null, captureThis = false): AnyNode {
  const properties = paramNames.map((n) => ({
    type: 'Property',
    key: { type: 'Identifier', name: n },
    value: { type: 'Identifier', name: n },
    kind: 'init',
    shorthand: true,
    computed: false,
    method: false,
  }));

  const args: AnyNode[] = [
    { type: 'Literal', value: name },
    { type: 'ObjectExpression', properties },
  ];

  if (isBlockScope) {
    args.push({ type: 'Literal', value: true });
  }

  // Pass closed-over variables as fourth argument
  if (closureVarNames && closureVarNames.length > 0) {
    if (!isBlockScope) {
      args.push({ type: 'Literal', value: false });
    }
    const closureProps = closureVarNames.map((n) => ({
      type: 'Property',
      key: { type: 'Identifier', name: n },
      value: { type: 'Identifier', name: n },
      kind: 'init',
      shorthand: true,
      computed: false,
      method: false,
    }));
    args.push({ type: 'ObjectExpression', properties: closureProps });
  }

  // Pass `this` as fifth argument for non-arrow functions
  if (captureThis) {
    // Ensure args 2-4 exist as placeholders
    while (args.length < 4) {
      args.push(args.length === 2
        ? { type: 'Literal', value: false }
        : { type: 'Literal', value: null, raw: 'null' });
    }
    args.push({ type: 'ThisExpression' });
  }

  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: '__pushFrame__' },
      arguments: args,
      optional: false,
    },
  };
}

/** `const name = <push>`: the frame __pushFrame__ returns, kept to leave it later (__leave__). */
function declareFrame(name: string, push: AnyNode, kind: 'var' | 'const' = 'const'): AnyNode {
  return {
    type: 'VariableDeclaration',
    kind,
    declarations: [{ type: 'VariableDeclarator', id: { type: 'Identifier', name }, init: push.expression }],
  };
}

/** `__name__(args…)` */
function runtimeCall(name: string, args: AnyNode[]): AnyNode {
  return { type: 'CallExpression', callee: { type: 'Identifier', name }, arguments: args, optional: false };
}

/** `try { body } finally { __leave__(frame); }`: the frame comes off the stack however the code is left (#44). */
function leaveAfter(body: AnyNode[], frame: string): AnyNode {
  return {
    type: 'TryStatement',
    block: { type: 'BlockStatement', body },
    handler: null,
    finalizer: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: runtimeCall('__leave__', [{ type: 'Identifier', name: frame }]) }] },
  };
}

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassDeclaration', 'ClassExpression']);

/**
 * A generator's or async function's frame leaves the stack at each `yield`
 * and `await`, and comes back when the function resumes (#44), as a
 * debugger's call stack shows it: `await x` becomes
 * `__resume__(__fr__, await __suspend__(__fr__, x))`. A rejected `await`,
 * `gen.throw()` and `gen.return()` resume the function in a catch or finally
 * block instead, so each of those starts with `__resume__(__fr__)`. Nested
 * functions and classes have frames of their own and are left alone.
 */
function suspendAtYieldAndAwait(node: AnyNode): void {
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key.startsWith('_')) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) if (child[i] && typeof child[i].type === 'string') child[i] = suspended(child[i]);
    } else if (child && typeof child.type === 'string') {
      node[key] = suspended(child);
    }
  }
}

function suspended(n: AnyNode): AnyNode {
  if (FUNCTION_TYPES.has(n.type)) return n;
  suspendAtYieldAndAwait(n);
  const frame = { type: 'Identifier', name: '__fr__' };
  if (n.type === 'AwaitExpression' || n.type === 'YieldExpression') {
    const operand = runtimeCall('__suspend__', [frame, n.argument ?? { type: 'Identifier', name: 'undefined' }]);
    return runtimeCall('__resume__', [frame, { ...n, argument: operand }]);
  }
  const resume = () => ({ type: 'ExpressionStatement', expression: runtimeCall('__resume__', [frame]) });
  if (n.type === 'CatchClause') n.body.body.unshift(resume());
  if (n.type === 'TryStatement' && n.finalizer) n.finalizer.body.unshift(resume());
  return n;
}

/** `__popFrame__()`; with the line of a function's closing brace, a return step there showing `undefined`. */
function buildPopFrame(endLine?: number): AnyNode {
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: '__popFrame__' },
      arguments: endLine ? [{ type: 'Identifier', name: 'undefined' }, { type: 'Literal', value: endLine }] : [],
      optional: false,
    },
  };
}

function buildLineArg(line: number, loc?: { start: { column: number }; end: { column: number } }): AnyNode {
  if (loc) {
    return {
      type: 'ArrayExpression',
      elements: [
        { type: 'Literal', value: line },
        { type: 'Literal', value: loc.start.column },
        { type: 'Literal', value: loc.end.column },
      ],
    };
  }
  return { type: 'Literal', value: line };
}

/**
 * `__condition__(test, line, text, vars…)`: a step at the test with its result.
 * It refreshes the variables visible there (`varNames`), as a capture does, so
 * the step shows the state the test sees. `blockFrame` is a for loop's
 * let/const variables, whose frame is pushed in the loop body: the step shows
 * them in a frame of their own.
 */
function buildConditionWrapper(
  testExpr: AnyNode,
  columnRange: { start: { column: number }; end: { column: number } } | undefined,
  varNames: string[],
  blockFrame?: { name: string; vars: string[] },
): AnyNode {
  const line = testExpr.loc?.start?.line ?? 0;
  const exprText = generate(testExpr);
  const args: AnyNode[] = [
    testExpr,
    buildLineArg(line, columnRange),
    { type: 'Literal', value: exprText },
    ...buildVarArgs(varNames),
  ];
  if (blockFrame) {
    while (args.length < 6) args.push({ type: 'Literal', value: null, raw: 'null' });
    args.push({
      type: 'ObjectExpression',
      properties: [
        { type: 'Property', key: { type: 'Identifier', name: 'name' }, value: { type: 'Literal', value: blockFrame.name }, kind: 'init', shorthand: false, computed: false, method: false },
        { type: 'Property', key: { type: 'Identifier', name: 'vars' }, value: buildVarsObject(blockFrame.vars), kind: 'init', shorthand: false, computed: false, method: false },
      ],
    });
  }
  return {
    type: 'CallExpression',
    callee: { type: 'Identifier', name: '__condition__' },
    arguments: args,
    optional: false,
  };
}

function buildLoopGuard(): AnyNode {
  // if (++__loopCount > __MAX_LOOPS) throw new Error("Infinite loop detected (exceeded " + __MAX_LOOPS + " iterations)");
  return {
    type: 'IfStatement',
    _isLoopGuard: true,
    test: {
      type: 'BinaryExpression',
      operator: '>',
      left: {
        type: 'UpdateExpression',
        operator: '++',
        prefix: true,
        argument: { type: 'Identifier', name: '__loopCount' },
      },
      right: { type: 'Identifier', name: '__MAX_LOOPS' },
    },
    consequent: {
      type: 'ThrowStatement',
      argument: {
        type: 'NewExpression',
        callee: { type: 'Identifier', name: 'Error' },
        arguments: [
          {
            type: 'BinaryExpression',
            operator: '+',
            left: {
              type: 'BinaryExpression',
              operator: '+',
              left: { type: 'Literal', value: 'Infinite loop detected (exceeded ' },
              right: { type: 'Identifier', name: '__MAX_LOOPS' },
            },
            right: { type: 'Literal', value: ' iterations)' },
          },
        ],
      },
    },
    alternate: null,
  };
}

/**
 * Recursively instrument a block (array of statements).
 * `scopeVars` is the accumulated list of variable names visible in this scope.
 * `isTopLevel` indicates whether this is the program body.
 *
 * Steps follow pythontutor.com (#24): a capture comes before each statement,
 * showing the state before it runs (a condition's step comes from
 * __condition__, a return's value from __popFrame__), and the program body
 * ends with one more capture, its final state.
 */
function instrumentBlock(
  body: AnyNode[],
  scopeVars: string[],
  isTopLevel: boolean,
): void {
  // Track which variables have been declared so far in this block.
  // We must NOT try to read `let`/`const` variables before their declaration
  // (temporal dead zone), so we only capture variables that have been seen.
  // However, `var` and `function` declarations are hoisted and safe to read
  // from the start of the scope.
  const hoisted = collectHoistedNames(body);
  const declaredSoFar = [...scopeVars];
  for (const name of hoisted) {
    if (!declaredSoFar.includes(name)) {
      declaredSoFar.push(name);
    }
  }
  // The let/const/class names this block declares are in their temporal dead
  // zone until their declaration runs, and so is an outer variable they shadow:
  // a capture before then leaves them out.
  const pending = new Set(collectLexicalNames(body));
  const visible = () => declaredSoFar.filter(name => !pending.has(name));

  // The program's final step is at its last statement that runs (not a function declared after the code).
  const lastExec = [...body].reverse().find(s => s.type !== 'FunctionDeclaration') ?? body[body.length - 1];
  const finalLine = lastExec?.loc?.start?.line ?? 0;

  // We iterate and insert new statements. Use index tracking.
  let i = 0;
  while (i < body.length) {
    const stmt = body[i];
    const line = stmt.loc?.start?.line ?? 0;

    // Extract for-loop init so it gets its own capture step.
    // var and expression inits are hoisted/function-scoped, so extracting
    // them before the for statement (and its labels) is safe.
    const loop = unlabeled(stmt);
    if (loop.type === 'ForStatement' && loop.init) {
      // Stash test/update column ranges on the for-statement for instrumentLoop
      if (loop.test?.loc) loop._testColRange = loop.test.loc;
      if (loop.update?.loc) loop._updateColRange = loop.update.loc;

      if (loop.init.type === 'VariableDeclaration' && loop.init.kind === 'var') {
        const initDecl = loop.init;
        initDecl._forColumnRange = initDecl.loc;
        loop.init = null;
        body.splice(i, 0, initDecl);
        continue; // re-process at index i, which now points to initDecl
      } else if (loop.init.type !== 'VariableDeclaration') {
        // NOTE: `let`/`const` for-inits are intentionally NOT extracted out of
        // the for-statement. `for (let i = 0; ...; ...) { ... }` creates a
        // fresh per-iteration binding for `i` — closures inside the body
        // capture each iteration's distinct `i`. Hoisting the declaration
        // into the parent block collapses those bindings into one shared
        // variable, breaking the classic
        //   `for (let i...) funcs.push(() => i)`
        // pattern (all closures would see the final `i`). instrumentLoop
        // pushes the block-scope frame inside the loop body instead.
        // Expression init (e.g. i = 0)
        const exprStmt: AnyNode = {
          type: 'ExpressionStatement',
          expression: loop.init,
          loc: loop.init.loc,
          _forColumnRange: loop.init.loc,
        };
        loop.init = null;
        body.splice(i, 0, exprStmt);
        continue; // re-process at index i, which now points to exprStmt
      }
    }

    // The step before the statement runs. Synthetic statements (loop guards,
    // frame pushes and pops) have no line and take no step.
    if (line > 0 && takesStepBefore(stepsLikeItsStatement(stmt)) && (!stmt._isBlockScopeInit || stmt._forColumnRange)) {
      body.splice(i, 0, buildCaptureExpression(visible(), line, stmt._forColumnRange ?? undefined));
      i += 1;
    }

    // Save block-scoped loop vars before instrumentStatement deletes them.
    // These were stashed by the for-init extraction path and belong only to
    // the loop's block frame — not the parent scope.
    const stmtBlockScopeVars: string[] | null = stmt._blockScopeVars
      ? [...(stmt._blockScopeVars as string[])]
      : null;

    // Recurse into nested structures first
    // Pass the full set of vars visible at this point.
    // Note: names declared by THIS statement are intentionally NOT yet in
    // declaredSoFar — a `let x = expr` whose RHS contains a nested function
    // must not capture `x` as a closure variable, because the runtime would
    // try to read `x` (still in TDZ) when the function executes during RHS
    // evaluation. var/function names are already in declaredSoFar via the
    // hoisted pass at the top of instrumentBlock.
    instrumentStatement(stmt, visible());

    // After instrumenting, register this statement's declared names so that
    // subsequent statements see them.
    // Skip block-scope-init declarations (extracted for-loop let/const vars) —
    // those belong only to the loop's block frame, not the parent scope.
    if (!stmt._isBlockScopeInit) {
      const newNames = collectDeclaredNamesFromStmt(stmt);
      for (const name of newNames) {
        pending.delete(name);
        if (!declaredSoFar.includes(name)) {
          declaredSoFar.push(name);
        }
      }
    }

    // If instrumentLoop flagged a block-scope wrap (for while loops), replace body[i] with
    // { const __bf__ = __pushFrame__('while', {}, true); try { while (...) {...} } finally { __leave__(__bf__); } }
    // This keeps the block-scope frame alive during every condition check, and
    // pops it however the loop is left: its test, break, a labeled break, a throw (#44).
    if (loop._blockWrap) {
      const { push } = loop._blockWrap as { push: AnyNode };
      delete loop._blockWrap;
      body[i] = { type: 'BlockStatement', body: [declareFrame('__bf__', push), leaveAfter([stmt], '__bf__')] };
    }

    // Remove block-scoped loop vars from the parent scope so they don't appear
    // in captures after the loop ends (e.g. i in `for (let i...)` is loop-local).
    if (stmtBlockScopeVars) {
      for (const name of stmtBlockScopeVars) {
        const idx = declaredSoFar.indexOf(name);
        if (idx !== -1) declaredSoFar.splice(idx, 1);
      }
    }

    i += 1;
  }

  // The script's last step: the state after its last statement ran
  // (__endScript__, a step even on the line it last stepped at). The program's
  // timers and promise callbacks run after it (#45). __globals__ reads every
  // top-level name, for that step and to keep the Global frame current while
  // functions and callbacks run.
  if (isTopLevel) {
    body.push(buildGlobalsReader(visible()));
    body.push({ type: 'ExpressionStatement', expression: runtimeCall('__endScript__', [{ type: 'Literal', value: finalLine }]) });
  }
}

/**
 * `function __globals__() { const g = { __proto__: null }; try { g["a"] = a; } catch (e) {} … return g; }`:
 * each top-level name's value, leaving out those still in their temporal dead zone.
 */
function buildGlobalsReader(names: string[]): AnyNode {
  const g = { type: 'Identifier', name: '__g__' };
  const body: AnyNode[] = [{
    type: 'VariableDeclaration',
    kind: 'var',
    declarations: [{
      type: 'VariableDeclarator',
      id: g,
      init: { type: 'ObjectExpression', properties: [{ type: 'Property', key: { type: 'Identifier', name: '__proto__' }, value: { type: 'Literal', value: null, raw: 'null' }, kind: 'init', shorthand: false, computed: false, method: false }] },
    }],
  }];
  for (const name of names) {
    body.push({
      type: 'TryStatement',
      block: { type: 'BlockStatement', body: [{
        type: 'ExpressionStatement',
        expression: {
          type: 'AssignmentExpression',
          operator: '=',
          left: { type: 'MemberExpression', object: g, property: { type: 'Literal', value: name }, computed: true, optional: false },
          right: { type: 'Identifier', name },
        },
      }] },
      handler: { type: 'CatchClause', param: { type: 'Identifier', name: '__e__' }, body: { type: 'BlockStatement', body: [] } },
      finalizer: null,
    });
  }
  body.push({ type: 'ReturnStatement', argument: g });
  return { type: 'FunctionDeclaration', id: { type: 'Identifier', name: '__globals__' }, params: [], body: { type: 'BlockStatement', body }, generator: false, async: false };
}

/**
 * Does a step come before this statement? pythontutor.com takes one before
 * each line that runs. A function declaration doesn't run, a block, `try` or
 * label only leads to the statements inside it, and the step of an `if` or a
 * loop with a test is its condition's (__condition__); a do-while's is at its
 * `while`.
 */
function takesStepBefore(stmt: AnyNode): boolean {
  switch (stmt.type) {
    case 'FunctionDeclaration':
    case 'EmptyStatement':
    case 'BlockStatement':
    case 'TryStatement':
    case 'IfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      return false;
    case 'ForStatement':
      return !stmt.test;
    default:
      return true;
  }
}

/** A labeled statement takes the step its statement takes (#46). */
function stepsLikeItsStatement(stmt: AnyNode): AnyNode {
  return unlabeled(stmt);
}

/** The names a block's own let, const and class declarations introduce. */
function collectLexicalNames(body: AnyNode[]): string[] {
  const names: string[] = [];
  for (const stmt of body) {
    if (stmt.type === 'VariableDeclaration' && stmt.kind !== 'var') {
      for (const decl of stmt.declarations) extractPatternNames(decl.id, names);
    } else if (stmt.type === 'ClassDeclaration' && stmt.id) {
      names.push(stmt.id.name);
    }
  }
  return names;
}

/** The syntax JSTutor can't show yet: an error before the program runs, never code run unseen (#46). */
export class UnsupportedSyntaxError extends Error {
  line?: number;
  constructor(node: AnyNode) {
    super(`${describeNode(node)} isn't supported in JSTutor yet`);
    this.name = 'UnsupportedSyntaxError';
    this.line = node.loc?.start?.line;
  }
}

function describeNode(node: AnyNode): string {
  return node.type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** A labeled statement's statement, through any number of labels. */
function unlabeled(stmt: AnyNode): AnyNode {
  while (stmt.type === 'LabeledStatement') stmt = stmt.body;
  return stmt;
}

/** A property or class member's name, as JavaScript names a function defined there. */
function keyName(key: AnyNode): string | undefined {
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'PrivateIdentifier') return '#' + key.name;
  if (key.type === 'Literal') return String(key.value);
  return undefined;
}

/** An anonymous function or class gets the name of what it is assigned to, as in JavaScript. */
function inferName(node: AnyNode, name: string | undefined): void {
  if (!node || !name) return;
  const anonymous = (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'ClassExpression') && !node.id;
  if (anonymous && !node._inferredName) node._inferredName = name;
}

/**
 * Instrument a single statement and its children. Every statement type is
 * handled; one the instrumenter doesn't know is an UnsupportedSyntaxError,
 * never a statement left to run unseen (#46).
 */
function instrumentStatement(stmt: AnyNode, scopeVars: string[]): void {
  switch (stmt.type) {
    case 'FunctionDeclaration':
      instrumentFunction(stmt, scopeVars);
      break;

    case 'IfStatement':
      // Functions in the test first, then the test is wrapped with __condition__
      // to track the decision (not the synthetic loop guard's).
      instrumentExpression(stmt.test, scopeVars);
      if (!stmt._isLoopGuard) {
        stmt.test = buildConditionWrapper(stmt.test, undefined, scopeVars);
      }
      // Wrap bare (non-block) branches so captures and popFrames work inside them
      if (stmt.consequent.type !== 'BlockStatement') {
        stmt.consequent = { type: 'BlockStatement', body: [stmt.consequent] };
      }
      instrumentBlock(stmt.consequent.body, scopeVars, false);
      if (stmt.alternate) {
        if (stmt.alternate.type === 'IfStatement') {
          instrumentStatement(stmt.alternate, scopeVars);
        } else {
          if (stmt.alternate.type !== 'BlockStatement') {
            stmt.alternate = { type: 'BlockStatement', body: [stmt.alternate] };
          }
          instrumentBlock(stmt.alternate.body, scopeVars, false);
        }
      }
      break;

    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      instrumentLoop(stmt, scopeVars);
      break;

    case 'LabeledStatement':
      // A labeled loop is a loop, a labeled block a block (#46).
      instrumentStatement(stmt.body, scopeVars);
      break;

    case 'SwitchStatement':
      instrumentExpression(stmt.discriminant, scopeVars);
      for (const c of stmt.cases) {
        if (c.test) instrumentExpression(c.test, scopeVars);
        if (c.consequent && c.consequent.length > 0) {
          instrumentBlock(c.consequent, scopeVars, false);
        }
      }
      break;

    case 'TryStatement':
      if (stmt.block) {
        instrumentBlock(stmt.block.body, scopeVars, false);
      }
      if (stmt.handler && stmt.handler.body) {
        const catchVars = [...scopeVars];
        if (stmt.handler.param) {
          instrumentExpression(stmt.handler.param, scopeVars);
          extractPatternNames(stmt.handler.param, catchVars);
        }
        instrumentBlock(stmt.handler.body.body, catchVars, false);
      }
      if (stmt.finalizer) {
        instrumentBlock(stmt.finalizer.body, scopeVars, false);
      }
      break;

    case 'BlockStatement':
      instrumentBlock(stmt.body, scopeVars, false);
      break;

    case 'VariableDeclaration':
      for (const decl of stmt.declarations) {
        instrumentExpression(decl.id, scopeVars);
        if (decl.init) {
          if (decl.id.type === 'Identifier') inferName(decl.init, decl.id.name);
          instrumentExpression(decl.init, scopeVars);
        }
      }
      break;

    case 'ExpressionStatement':
      instrumentExpression(stmt.expression, scopeVars);
      break;

    case 'ReturnStatement':
    case 'ThrowStatement':
      if (stmt.argument) {
        instrumentExpression(stmt.argument, scopeVars);
      }
      break;

    case 'ClassDeclaration':
      instrumentClass(stmt, scopeVars);
      break;

    case 'WithStatement':
      instrumentExpression(stmt.object, scopeVars);
      if (stmt.body.type !== 'BlockStatement') stmt.body = { type: 'BlockStatement', body: [stmt.body] };
      instrumentBlock(stmt.body.body, scopeVars, false);
      break;

    case 'EmptyStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
    case 'DebuggerStatement':
      break;

    default:
      throw new UnsupportedSyntaxError(stmt);
  }
}

/**
 * The parts of each expression (and destructuring pattern) that can hold
 * code: instrumentExpression walks them to reach every function, wherever it
 * is (an argument of new, a call in a member chain, after ! or await,
 * a default value). A type missing here is an UnsupportedSyntaxError (#46).
 */
const EXPRESSION_CHILDREN: Record<string, readonly string[]> = {
  Identifier: [], Literal: [], ThisExpression: [], Super: [], MetaProperty: [], PrivateIdentifier: [], TemplateElement: [],
  ArrayExpression: ['elements'], ObjectExpression: ['properties'], Property: ['key', 'value'], SpreadElement: ['argument'],
  UnaryExpression: ['argument'], UpdateExpression: ['argument'], AwaitExpression: ['argument'], YieldExpression: ['argument'],
  BinaryExpression: ['left', 'right'], LogicalExpression: ['left', 'right'], AssignmentExpression: ['left', 'right'],
  ConditionalExpression: ['test', 'consequent', 'alternate'],
  CallExpression: ['callee', 'arguments'], NewExpression: ['callee', 'arguments'],
  MemberExpression: ['object', 'property'], ChainExpression: ['expression'], SequenceExpression: ['expressions'],
  TemplateLiteral: ['expressions'], TaggedTemplateExpression: ['tag', 'quasi'], ParenthesizedExpression: ['expression'],
  ImportExpression: ['source', 'options'],
  ObjectPattern: ['properties'], ArrayPattern: ['elements'], AssignmentPattern: ['left', 'right'], RestElement: ['argument'],
};

/**
 * Walk an expression (or pattern) to instrument every function and class in
 * it, naming anonymous ones as JavaScript does.
 */
function instrumentExpression(expr: AnyNode, scopeVars: string[]): void {
  if (!expr) return;

  switch (expr.type) {
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      instrumentFunction(expr, scopeVars);
      return;
    case 'ClassExpression':
      instrumentClass(expr, scopeVars);
      return;
  }

  const children = EXPRESSION_CHILDREN[expr.type];
  if (!children) throw new UnsupportedSyntaxError(expr);
  if (expr.type === 'Property' && !expr.computed) inferName(expr.value, keyName(expr.key));
  if ((expr.type === 'AssignmentExpression' || expr.type === 'AssignmentPattern') && expr.left.type === 'Identifier') {
    inferName(expr.right, expr.left.name);
  }
  for (const key of children) {
    const child = expr[key];
    if (Array.isArray(child)) {
      for (const c of child) if (c) instrumentExpression(c, scopeVars);
    } else if (child) {
      instrumentExpression(child, scopeVars);
    }
  }
}

/**
 * Instrument a function declaration/expression/arrow.
 */
function instrumentFunction(fn: AnyNode, _parentVars: string[]): void {
  // Functions create their own scope — clear block-scope tracking
  const savedParentVarNames = _parentVarNames;
  _parentVarNames = null;

  // Save and update closure tracking state
  const savedClosureVarNames = _closureVarNames;
  const savedFunctionDepth = _functionDepth;
  _functionDepth++;

  // If inside another function, the outer scope vars are closure variables.
  // Also inherit any closure vars from the enclosing function (for deep nesting).
  const outerClosureVars = _functionDepth > 1 ? _parentVars.slice() : null;
  if (outerClosureVars && savedClosureVarNames) {
    for (const name of savedClosureVarNames) {
      if (!outerClosureVars.includes(name)) {
        outerClosureVars.push(name);
      }
    }
  }
  _closureVarNames = outerClosureVars;

  // A function is named as JavaScript names it: its own name, else the variable or class member it is defined as.
  const name = fn.id?.name || fn._inferredName || '<anonymous>';
  const paramNames: string[] = [];
  for (const param of fn.params) {
    extractPatternNames(param, paramNames);
  }

  // Get the function body
  const fnEndLine: number | undefined = fn.body.type === 'BlockStatement' ? fn.body.loc?.end?.line : undefined;
  let body: AnyNode[];
  if (fn.body.type === 'BlockStatement') {
    body = fn.body.body;
  } else {
    // Arrow function with expression body: convert to block with return
    const returnStmt = {
      type: 'ReturnStatement',
      argument: fn.body,
      loc: fn.body.loc,
    };
    fn.body = {
      type: 'BlockStatement',
      body: [returnStmt],
    };
    body = fn.body.body;
  }

  // Scope: params are available immediately; local declarations will be
  // discovered incrementally by instrumentBlock to avoid TDZ errors.
  const fnScopeVars = [...paramNames];
  // Functions in the parameters' default values (#46).
  for (const param of fn.params) instrumentExpression(param, fnScopeVars);

  // Instrument body statements. The capture before the first one is the
  // step entering the function, with its parameters bound (instrumentFunction
  // prepends __pushFrame__ before it).
  instrumentBlock(body, fnScopeVars, false);

  // Wrap return values so the frame pops AFTER the expression evaluates.
  // Do this BEFORE wrapping the body in try/finally — otherwise the recursion
  // into the user-level try would also rewrite our synthetic try.
  wrapReturnsWithPopFrame(body);

  // A generator's or async function's frame leaves the stack at each yield
  // and await, and comes back when it resumes (#44).
  if (fn.async || fn.generator) suspendAtYieldAndAwait({ type: 'BlockStatement', body });

  // Wrap the body in `try { ... } finally { __leave__(__fr__); }`, so the
  // frame (and any loop frames above it) leaves the stack however the
  // function ends: a return (whose __popFrame__ has already popped it), a
  // throw, or a generator's return(). Without it, a throw skips the trailing
  // __popFrame__ and the frame leaks onto every later step.
  const userBody = body.splice(0, body.length);
  // The fall-through pop sits inside the try; reaching the closing brace is a
  // return step there (an arrow function's expression body returns before it).
  userBody.push(buildPopFrame(fnEndLine));
  body.push(leaveAfter(userBody, '__fr__'));

  // The frame is pushed at the very beginning of the function body (outside
  // the try), before any user-visible operation, and kept as __fr__.
  // Arrow functions don't have their own `this`, so only capture it for regular functions.
  // Derived class constructors must not read \`this\` before super() returns.
  const captureThis = fn.type !== 'ArrowFunctionExpression' && !fn._skipThisCapture;
  body.unshift(declareFrame('__fr__', buildPushFrame(name, paramNames, false, _closureVarNames, captureThis), 'var'));

  // Restore saved state
  _functionDepth = savedFunctionDepth;
  _closureVarNames = savedClosureVarNames;
  _parentVarNames = savedParentVarNames;
}

/**
 * Wrap every ReturnStatement's argument so the frame pops AFTER the
 * return expression is evaluated:
 *   return expr  →  return __popFrame__(expr, line)
 *   return       →  return __popFrame__(undefined, line)
 *
 * The line number lets __popFrame__ emit a snapshot showing the return
 * value before the frame is removed from the call stack.
 */
function wrapReturnsWithPopFrame(body: AnyNode[]): void {
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (stmt.type === 'ReturnStatement') {
      const line = stmt.loc?.start?.line ?? 0;
      const retArg = stmt.argument
        ? stmt.argument
        : { type: 'Identifier', name: 'undefined' };
      stmt.argument = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: '__popFrame__' },
        arguments: [retArg, { type: 'Literal', value: line }],
        optional: false,
      };
    } else {
      wrapReturnsInBranches(stmt);
    }
  }
}

/**
 * Recurse into nested control-flow statements to find ReturnStatements
 * that need __popFrame__ wrapping. Without this, a `return` inside a
 * try/catch/finally/for/while/switch/labeled block exits the function
 * with the call-stack frame still pushed, leaving phantom frames on
 * every subsequent visualization.
 *
 * Does NOT recurse into nested function/class bodies — those have their
 * own __pushFrame__/__popFrame__ pairs.
 */
function wrapReturnsInBranches(stmt: AnyNode): void {
  if (!stmt) return;
  switch (stmt.type) {
    case 'IfStatement':
      if (stmt.consequent?.type === 'BlockStatement') {
        wrapReturnsWithPopFrame(stmt.consequent.body);
      } else if (stmt.consequent) {
        wrapReturnsInBranches(stmt.consequent);
      }
      if (stmt.alternate?.type === 'BlockStatement') {
        wrapReturnsWithPopFrame(stmt.alternate.body);
      } else if (stmt.alternate) {
        wrapReturnsInBranches(stmt.alternate);
      }
      break;
    case 'BlockStatement':
      wrapReturnsWithPopFrame(stmt.body);
      break;
    case 'TryStatement':
      if (stmt.block) wrapReturnsWithPopFrame(stmt.block.body);
      if (stmt.handler?.body) wrapReturnsWithPopFrame(stmt.handler.body.body);
      if (stmt.finalizer) wrapReturnsWithPopFrame(stmt.finalizer.body);
      break;
    case 'SwitchStatement':
      for (const c of stmt.cases) {
        if (c.consequent) wrapReturnsWithPopFrame(c.consequent);
      }
      break;
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'LabeledStatement':
      if (stmt.body?.type === 'BlockStatement') {
        wrapReturnsWithPopFrame(stmt.body.body);
      } else if (stmt.body) {
        wrapReturnsInBranches(stmt.body);
      }
      break;
    // Do NOT recurse into function or class bodies — they manage their
    // own frame lifecycle.
  }
}

/**
 * Instrument a loop statement (for, while, do-while, for-in, for-of).
 */
function instrumentLoop(stmt: AnyNode, scopeVars: string[]): void {
  // The functions in the loop's head: a for's declarations, test and update, a
  // for-in/for-of's target and source, a while's test (#46).
  if (stmt.init) {
    if (stmt.init.type === 'VariableDeclaration') {
      for (const decl of stmt.init.declarations) { instrumentExpression(decl.id, scopeVars); if (decl.init) instrumentExpression(decl.init, scopeVars); }
    } else {
      instrumentExpression(stmt.init, scopeVars);
    }
  }
  if (stmt.test) instrumentExpression(stmt.test, scopeVars);
  if (stmt.update) instrumentExpression(stmt.update, scopeVars);
  if (stmt.right) instrumentExpression(stmt.right, scopeVars);
  if (stmt.left) {
    if (stmt.left.type === 'VariableDeclaration') for (const decl of stmt.left.declarations) instrumentExpression(decl.id, scopeVars);
    else instrumentExpression(stmt.left, scopeVars);
  }

  // Collect loop-specific variable declarations
  const loopVars = [...scopeVars];
  const blockScopedVars: string[] = [];

  if (stmt.type === 'ForStatement' && stmt.init?.type === 'VariableDeclaration') {
    const isBlockScoped = stmt.init.kind === 'let' || stmt.init.kind === 'const';
    for (const decl of stmt.init.declarations) {
      const names: string[] = [];
      extractPatternNames(decl.id, names);
      loopVars.push(...names);
      if (isBlockScoped) blockScopedVars.push(...names);
    }
  } else if (
    (stmt.type === 'ForInStatement' || stmt.type === 'ForOfStatement') &&
    stmt.left?.type === 'VariableDeclaration'
  ) {
    const isBlockScoped = stmt.left.kind === 'let' || stmt.left.kind === 'const';
    for (const decl of stmt.left.declarations) {
      const names: string[] = [];
      extractPatternNames(decl.id, names);
      loopVars.push(...names);
      if (isBlockScoped) blockScopedVars.push(...names);
    }
  }

  // If instrumentBlock pre-extracted a let/const for-init, pick up the stashed names.
  // They are NOT in scopeVars (we skip adding them to the parent's declaredSoFar),
  // so add them to both loopVars and blockScopedVars here.
  if (stmt._blockScopeVars) {
    for (const name of stmt._blockScopeVars as string[]) {
      if (!blockScopedVars.includes(name)) blockScopedVars.push(name);
      if (!loopVars.includes(name)) loopVars.push(name);
    }
    delete stmt._blockScopeVars;
  }

  // For while/do-while loops, scan the body for let/const declarations.
  // These are block-scoped to the loop body, just like for-loop init vars.
  if (stmt.type === 'WhileStatement' || stmt.type === 'DoWhileStatement') {
    const bodyStmts = stmt.body.type === 'BlockStatement' ? stmt.body.body : [stmt.body];
    for (const s of bodyStmts) {
      if (s.type === 'VariableDeclaration' && (s.kind === 'let' || s.kind === 'const')) {
        for (const decl of s.declarations) {
          const names: string[] = [];
          extractPatternNames(decl.id, names);
          for (const name of names) {
            if (!blockScopedVars.includes(name)) blockScopedVars.push(name);
            if (!loopVars.includes(name)) loopVars.push(name);
          }
        }
      }
    }
  }

  // Wrap loop test expressions with __condition__ (like if statements)
  if (stmt.test && (stmt.type === 'WhileStatement' || stmt.type === 'DoWhileStatement' || stmt.type === 'ForStatement')) {
    // For for-loops, pass the test's column range (stashed by instrumentBlock)
    const testColRange = stmt._testColRange ?? undefined;
    delete stmt._testColRange;
    const isWhileLoop = stmt.type === 'WhileStatement' || stmt.type === 'DoWhileStatement';
    if (blockScopedVars.length > 0 && (isWhileLoop || stmt.init === null)) {
      // The loop's frame is pushed around the loop, so it is alive at the
      // test: the test's variables go there and to its parent frame.
      const savedParentVarNames = _parentVarNames;
      const ancestorVars = savedParentVarNames || [];
      _parentVarNames = scopeVars.filter((n: string) => !blockScopedVars.includes(n) && !ancestorVars.includes(n));
      stmt.test = buildConditionWrapper(stmt.test, testColRange, scopeVars.filter((n: string) => !ancestorVars.includes(n)));
      _parentVarNames = savedParentVarNames;
    } else if (blockScopedVars.length > 0) {
      // A for loop's let/const variables live in a frame pushed in its body
      // (per-iteration bindings): the test's step shows them in a frame of its own.
      stmt.test = buildConditionWrapper(stmt.test, testColRange, scopeVars, { name: 'for', vars: blockScopedVars });
    } else {
      stmt.test = buildConditionWrapper(stmt.test, testColRange, loopVars);
    }
  }

  // Ensure the body is a block statement
  if (stmt.body.type !== 'BlockStatement') {
    stmt.body = {
      type: 'BlockStatement',
      body: [stmt.body],
    };
  }

  // Insert loop guard at the top
  stmt.body.body.unshift(buildLoopGuard());

  // NOTE: We intentionally do NOT move the for-update expression (e.g. `i++`)
  // into the loop body. For `for (let i = 0; ...; i++)`, the spec requires the
  // update to run in the freshly-created per-iteration env, leaving the
  // previous iteration's env frozen — that's what makes
  //   `for (let i...) funcs.push(() => i)` capture distinct `i` values.
  // Moving `i++` into the body mutates the same env the closure captured,
  // collapsing all closures onto the post-increment value. The tradeoff is
  // that there is no dedicated snapshot at the update line; the user steps
  // from the body of one iteration directly into the body of the next.
  if (stmt.type === 'ForStatement') {
    delete stmt._updateColRange;
  }

  if (blockScopedVars.length > 0) {
    // Determine descriptive frame name
    const loopName = stmt.type === 'ForInStatement' ? 'for...in'
      : stmt.type === 'ForOfStatement' ? 'for...of'
        : stmt.type === 'WhileStatement' ? 'while'
          : stmt.type === 'DoWhileStatement' ? 'do...while' : 'for';

    // For while/do-while, body-declared vars aren't available yet at push time
    // (TDZ), so push with empty params — they'll appear in subsequent captures.
    const isWhileStyle = stmt.type === 'WhileStatement' || stmt.type === 'DoWhileStatement';
    const pushNode = buildPushFrame(loopName, isWhileStyle ? [] : blockScopedVars, true);

    if (stmt.type === 'ForStatement' && stmt.init === null) {
      // let/const init was pre-extracted into the parent block: push/pop go in a
      // wrapper block around the for statement so the frame is alive during every
      // condition check. instrumentBlock will apply the wrapper after this returns.
      stmt._blockWrap = { push: pushNode };
    } else if (isWhileStyle) {
      // while/do-while: wrap the loop so the block frame is alive during condition
      // checks (same approach as for-loops with extracted init).
      stmt._blockWrap = { push: pushNode };
    } else {
      // for...in / for...of: no separate condition step, so the frame is pushed
      // in the body (per-iteration bindings) and left in a finally, once the
      // body is instrumented, so continue and break pop it too (#44).
      stmt.body.body.splice(1, 0, pushNode);
    }

    // Set parent var context so captures distribute vars correctly.
    // Exclude block-scoped loop vars — they belong to the block frame, not the parent.
    const savedParentVarNames = _parentVarNames;

    // When nesting block scopes (savedParentVarNames already set), exclude
    // ancestor-frame variables. The two-frame distribution in __capture__
    // would misplace them in the immediate parent rather than their actual
    // owning frame. They are already captured correctly there.
    const ancestorVars = savedParentVarNames || [];
    _parentVarNames = scopeVars.filter(
      (n: string) => !blockScopedVars.includes(n) && !ancestorVars.includes(n),
    );
    // For while/do-while, block-scoped vars are declared inside the body
    // and must NOT be pre-included — let instrumentBlock discover them
    // incrementally to respect TDZ (temporal dead zone).
    const effectiveLoopVars = loopVars.filter(
      (n: string) => !ancestorVars.includes(n) && !(isWhileStyle && blockScopedVars.includes(n)),
    );

    instrumentBlock(stmt.body.body, effectiveLoopVars, false);

    const pushAt = stmt.body.body.indexOf(pushNode);
    if (pushAt !== -1) {
      const rest = stmt.body.body.splice(pushAt + 1);
      stmt.body.body[pushAt] = declareFrame('__bf__', pushNode);
      stmt.body.body.push(leaveAfter(rest, '__bf__'));
    }

    _parentVarNames = savedParentVarNames;
  } else {
    // No block-scoped vars (e.g. var-based loop) — normal instrumentation
    instrumentBlock(stmt.body.body, loopVars, false);
  }
}

/**
 * Instrument a class declaration/expression: its methods, its fields'
 * values (an arrow function in a field is a common idiom), its static blocks,
 * computed keys and the superclass expression (#46).
 */
function instrumentClass(cls: AnyNode, scopeVars: string[]): void {
  const isDerived = !!cls.superClass;
  if (cls.superClass) instrumentExpression(cls.superClass, scopeVars);
  const className: string | undefined = cls.id?.name ?? cls._inferredName;
  for (const member of cls.body?.body ?? []) {
    if (member.computed) instrumentExpression(member.key, scopeVars);
    if (member.type === 'MethodDefinition') {
      // In a derived class constructor, `this` is unbound until super()
      // returns. Reading it (e.g. as the 5th arg to __pushFrame__) throws
      // a ReferenceError, so flag the constructor to skip the this capture.
      if (isDerived && member.kind === 'constructor') {
        member.value._skipThisCapture = true;
      }
      member.value._inferredName = member.kind === 'constructor' ? className
        : member.computed ? undefined : keyName(member.key);
      instrumentFunction(member.value, scopeVars);
    } else if (member.type === 'PropertyDefinition') {
      if (member.value) {
        if (!member.computed) inferName(member.value, keyName(member.key));
        instrumentExpression(member.value, scopeVars);
      }
    } else if (member.type === 'StaticBlock') {
      instrumentStaticBlock(member, scopeVars);
    } else {
      throw new UnsupportedSyntaxError(member);
    }
  }
}

/**
 * A static block runs once, when its class is defined, like a function body
 * whose `this` is the class: it gets a frame, named as V8's debugger
 * names it, and steps (#46).
 */
function instrumentStaticBlock(block: AnyNode, scopeVars: string[]): void {
  const savedParentVarNames = _parentVarNames;
  const savedClosureVarNames = _closureVarNames;
  const savedFunctionDepth = _functionDepth;
  _parentVarNames = null;
  _functionDepth++;
  const outerClosureVars = _functionDepth > 1 ? scopeVars.slice() : null;
  if (outerClosureVars && savedClosureVarNames) {
    for (const name of savedClosureVarNames) if (!outerClosureVars.includes(name)) outerClosureVars.push(name);
  }
  _closureVarNames = outerClosureVars;

  instrumentBlock(block.body, [], false);
  const body = block.body.splice(0, block.body.length);
  block.body.push(
    declareFrame('__fr__', buildPushFrame('<static_initializer>', [], false, _closureVarNames, true), 'var'),
    leaveAfter(body, '__fr__'),
  );

  _functionDepth = savedFunctionDepth;
  _closureVarNames = savedClosureVarNames;
  _parentVarNames = savedParentVarNames;
}
