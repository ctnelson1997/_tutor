/**
 * AST Instrumenter
 *
 * Parses user JavaScript with Acorn, then walks the AST and injects:
 *  - __capture__(line, { ...vars }) after each statement
 *  - __pushFrame__(name, { ...params }) at function entry
 *  - __popFrame__() at function exit
 *  - Loop guards to prevent infinite loops
 *  - Rewrites console.log/warn/error to __logOutput__
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

  const generated = generate(ast);
  return preamble + generated;
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
  const properties = varNames.map((name) => ({
    type: 'Property',
    key: { type: 'Identifier', name },
    value: { type: 'Identifier', name },
    kind: 'init',
    shorthand: true,
    computed: false,
    method: false,
  }));

  const args: AnyNode[] = [
    buildLineArg(line, columnRange),
    { type: 'ObjectExpression', properties },
  ];

  // If inside a block scope, pass parent var names as third argument
  // so the runtime can distribute vars to the correct frames.
  if (_parentVarNames) {
    args.push({
      type: 'ArrayExpression',
      elements: _parentVarNames.map((n) => ({
        type: 'Literal',
        value: n,
      })),
    });
  }

  // If inside a closure, pass closed-over variables as fourth argument
  // so the runtime can display them separately on the frame.
  if (_closureVarNames && _closureVarNames.length > 0) {
    // Ensure third arg exists (null placeholder if no block scope)
    if (!_parentVarNames) {
      args.push({ type: 'Literal', value: null, raw: 'null' });
    }
    const closureProps = _closureVarNames.map((name) => ({
      type: 'Property',
      key: { type: 'Identifier', name },
      value: { type: 'Identifier', name },
      kind: 'init',
      shorthand: true,
      computed: false,
      method: false,
    }));
    args.push({ type: 'ObjectExpression', properties: closureProps });
  }

  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: '__capture__' },
      arguments: args,
      optional: false,
    },
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

function buildPopFrame(): AnyNode {
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: '__popFrame__' },
      arguments: [],
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

function buildConditionWrapper(testExpr: AnyNode, columnRange?: { start: { column: number }; end: { column: number } }): AnyNode {
  const line = testExpr.loc?.start?.line ?? 0;
  const exprText = generate(testExpr);
  return {
    type: 'CallExpression',
    callee: { type: 'Identifier', name: '__condition__' },
    arguments: [
      testExpr,
      buildLineArg(line, columnRange),
      { type: 'Literal', value: exprText },
    ],
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

  // If top-level, add an initial capture with only the inherited scope vars
  if (isTopLevel && body.length > 0) {
    const firstLine = body[0]?.loc?.start?.line ?? 1;
    body.unshift(buildCaptureExpression(declaredSoFar, firstLine));
  }

  // We iterate and insert new statements. Use index tracking.
  let i = isTopLevel ? 1 : 0; // skip the initial capture we just inserted
  while (i < body.length) {
    const stmt = body[i];
    const line = stmt.loc?.start?.line ?? 0;

    // Extract for-loop init so it gets its own capture step.
    // var and expression inits are hoisted/function-scoped, so extracting
    // them before the for statement is safe. let/const inits are also extracted
    // so that the block-scope frame can be pushed before the condition check.
    if (stmt.type === 'ForStatement' && stmt.init) {
      // Stash test/update column ranges on the for-statement for instrumentLoop
      if (stmt.test?.loc) stmt._testColRange = stmt.test.loc;
      if (stmt.update?.loc) stmt._updateColRange = stmt.update.loc;

      if (stmt.init.type === 'VariableDeclaration' && stmt.init.kind === 'var') {
        const initDecl = stmt.init;
        initDecl._forColumnRange = initDecl.loc;
        stmt.init = null;
        body.splice(i, 0, initDecl);
        continue; // re-process at index i, which now points to initDecl
      } else if (
        stmt.init.type === 'VariableDeclaration' &&
        (stmt.init.kind === 'let' || stmt.init.kind === 'const')
      ) {
        // Extract let/const init so the variable is in scope before __pushFrame__
        // is called in the wrapper block (needed to keep the block-scope frame alive
        // during condition checks). Stash var names on the node for instrumentLoop.
        const bsvNames: string[] = [];
        for (const decl of stmt.init.declarations) {
          extractPatternNames(decl.id, bsvNames);
        }
        stmt._blockScopeVars = bsvNames;
        const initDecl = stmt.init;
        initDecl._isBlockScopeInit = true; // marks this decl as loop-local; skip parent captures
        initDecl._forColumnRange = initDecl.loc;
        stmt.init = null;
        body.splice(i, 0, initDecl);
        continue; // re-process at index i (initDecl), then the for-stmt
      } else if (stmt.init.type !== 'VariableDeclaration') {
        // Expression init (e.g. i = 0)
        const exprStmt: AnyNode = {
          type: 'ExpressionStatement',
          expression: stmt.init,
          loc: stmt.init.loc,
          _forColumnRange: stmt.init.loc,
        };
        stmt.init = null;
        body.splice(i, 0, exprStmt);
        continue; // re-process at index i, which now points to exprStmt
      }
    }

    // Before recursing, collect names this statement declares so that
    // the capture AFTER this statement can include them.
    // Skip block-scope-init declarations (extracted for-loop let/const vars) —
    // those belong only to the loop's block frame, not the parent scope.
    if (!stmt._isBlockScopeInit) {
      const newNames = collectDeclaredNamesFromStmt(stmt);
      for (const name of newNames) {
        if (!declaredSoFar.includes(name)) {
          declaredSoFar.push(name);
        }
      }
    }

    // Save block-scoped loop vars before instrumentStatement deletes them.
    // These were stashed by the for-init extraction path and belong only to
    // the loop's block frame — not the parent scope.
    const stmtBlockScopeVars: string[] | null = stmt._blockScopeVars
      ? [...(stmt._blockScopeVars as string[])]
      : null;

    // Recurse into nested structures first
    // Pass the full set of vars visible at this point
    instrumentStatement(stmt, declaredSoFar);

    // If instrumentLoop flagged a block-scope wrap (for let/const for-loops),
    // replace body[i] with: { __pushFrame__('for',{i},true); for(...){...}; __popFrame__(); }
    // This keeps the block-scope frame alive during every condition check.
    if (stmt._blockWrap) {
      const { push, pop } = stmt._blockWrap as { push: AnyNode; pop: AnyNode };
      delete stmt._blockWrap;
      body[i] = { type: 'BlockStatement', body: [push, stmt, pop] };
    }

    // Remove block-scoped loop vars from the parent scope so they don't appear
    // in captures after the loop ends (e.g. i in `for (let i...)` is loop-local).
    if (stmtBlockScopeVars) {
      for (const name of stmtBlockScopeVars) {
        const idx = declaredSoFar.indexOf(name);
        if (idx !== -1) declaredSoFar.splice(idx, 1);
      }
    }

    // For return/throw, insert capture BEFORE (capture after is dead code)
    if (stmt.type === 'ReturnStatement' || stmt.type === 'ThrowStatement') {
      const capture = buildCaptureExpression(declaredSoFar, line);
      body.splice(i, 0, capture);
      i += 2; // skip past inserted capture + the statement
    } else if (shouldCaptureAfter(stmt) && (!stmt._isBlockScopeInit || stmt._forColumnRange)) {
      const colRange = stmt._forColumnRange ?? undefined;
      const capture = buildCaptureExpression(declaredSoFar, line, colRange);
      body.splice(i + 1, 0, capture);
      i += 2; // skip past the original statement + inserted capture
    } else {
      i += 1;
    }
  }
}

/**
 * Determines if a capture call should be inserted after this statement.
 */
function shouldCaptureAfter(stmt: AnyNode): boolean {
  switch (stmt.type) {
    case 'VariableDeclaration':
    case 'ExpressionStatement':
    case 'AssignmentExpression':
      return true;
    case 'ReturnStatement':
    case 'ThrowStatement':
      // Handled separately — capture is inserted BEFORE these (not after)
      return false;
    case 'IfStatement':
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'SwitchStatement':
    case 'TryStatement':
      // These have their own block instrumentation
      return false;
    case 'FunctionDeclaration':
      // Capture that the function was declared
      return true;
    case 'ClassDeclaration':
      return true;
    default:
      return false;
  }
}

/**
 * Instrument a single statement and its children.
 */
function instrumentStatement(stmt: AnyNode, scopeVars: string[]): void {
  switch (stmt.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      instrumentFunction(stmt, scopeVars);
      break;

    case 'IfStatement':
      // Wrap the test expression with __condition__ to track the decision
      // (skip synthetic loop guard nodes)
      if (!stmt._isLoopGuard) {
        stmt.test = buildConditionWrapper(stmt.test);
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
      instrumentLoop(stmt, scopeVars);
      break;

    case 'WhileStatement':
    case 'DoWhileStatement':
      instrumentLoop(stmt, scopeVars);
      break;

    case 'SwitchStatement':
      for (const c of stmt.cases) {
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
      // Check if any init is a function expression, instrument it
      for (const decl of stmt.declarations) {
        if (decl.init) {
          instrumentExpression(decl.init, scopeVars);
        }
      }
      break;

    case 'ExpressionStatement':
      instrumentExpression(stmt.expression, scopeVars);
      break;

    case 'ReturnStatement':
      if (stmt.argument) {
        instrumentExpression(stmt.argument, scopeVars);
      }
      break;

    case 'ClassDeclaration':
    case 'ClassExpression':
      instrumentClass(stmt, scopeVars);
      break;
  }
}

/**
 * Walk expressions to find nested functions, arrow functions, etc.
 */
function instrumentExpression(expr: AnyNode, scopeVars: string[]): void {
  if (!expr) return;

  switch (expr.type) {
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      instrumentFunction(expr, scopeVars);
      break;

    case 'CallExpression':
      instrumentExpression(expr.callee, scopeVars);
      for (const arg of expr.arguments) {
        instrumentExpression(arg, scopeVars);
      }
      break;

    case 'AssignmentExpression':
      instrumentExpression(expr.right, scopeVars);
      break;

    case 'BinaryExpression':
    case 'LogicalExpression':
      instrumentExpression(expr.left, scopeVars);
      instrumentExpression(expr.right, scopeVars);
      break;

    case 'ConditionalExpression':
      instrumentExpression(expr.test, scopeVars);
      instrumentExpression(expr.consequent, scopeVars);
      instrumentExpression(expr.alternate, scopeVars);
      break;

    case 'ArrayExpression':
      for (const elem of expr.elements) {
        if (elem) instrumentExpression(elem, scopeVars);
      }
      break;

    case 'ObjectExpression':
      for (const prop of expr.properties) {
        if (prop.value) instrumentExpression(prop.value, scopeVars);
      }
      break;

    case 'ClassExpression':
      instrumentClass(expr, scopeVars);
      break;

    case 'TemplateLiteral':
      for (const e of expr.expressions) {
        instrumentExpression(e, scopeVars);
      }
      break;
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

  const name = fn.id?.name || '<anonymous>';
  const paramNames: string[] = [];
  for (const param of fn.params) {
    extractPatternNames(param, paramNames);
  }

  // Get the function body
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

  // Instrument body statements (pass isTopLevel=true so an initial capture
  // is emitted — instrumentFunction then prepends __pushFrame__ before it,
  // giving us a snapshot on function entry)
  instrumentBlock(body, fnScopeVars, true);

  // Insert __pushFrame__ at the beginning of the function body
  // Arrow functions don't have their own `this`, so only capture it for regular functions
  const captureThis = fn.type !== 'ArrowFunctionExpression';
  body.unshift(buildPushFrame(name, paramNames, false, _closureVarNames, captureThis));

  // Wrap return values so the frame pops AFTER the expression evaluates
  wrapReturnsWithPopFrame(body);

  // Add __popFrame__ at the very end (for functions that fall through)
  body.push(buildPopFrame());

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
 * Recurse into branch-bearing statements (if/else) to find
 * ReturnStatements nested inside blocks.
 */
function wrapReturnsInBranches(stmt: AnyNode): void {
  if (stmt.type !== 'IfStatement') return;

  if (stmt.consequent?.type === 'BlockStatement') {
    wrapReturnsWithPopFrame(stmt.consequent.body);
  }
  if (stmt.alternate?.type === 'BlockStatement') {
    wrapReturnsWithPopFrame(stmt.alternate.body);
  } else if (stmt.alternate?.type === 'IfStatement') {
    wrapReturnsInBranches(stmt.alternate);
  }
}

/**
 * Instrument a loop statement (for, while, do-while, for-in, for-of).
 */
function instrumentLoop(stmt: AnyNode, scopeVars: string[]): void {
  // Wrap loop test expressions with __condition__ (like if statements)
  if (stmt.test && (stmt.type === 'WhileStatement' || stmt.type === 'DoWhileStatement' || stmt.type === 'ForStatement')) {
    // For for-loops, pass the test's column range (stashed by instrumentBlock)
    const testColRange = stmt._testColRange ?? undefined;
    delete stmt._testColRange;
    stmt.test = buildConditionWrapper(stmt.test, testColRange);
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

  // Ensure the body is a block statement
  if (stmt.body.type !== 'BlockStatement') {
    stmt.body = {
      type: 'BlockStatement',
      body: [stmt.body],
    };
  }

  // Insert loop guard at the top
  stmt.body.body.unshift(buildLoopGuard());

  // Move for-loop update into body so it gets its own capture step
  if (stmt.type === 'ForStatement' && stmt.update) {
    const updateColRange = stmt._updateColRange ?? undefined;
    delete stmt._updateColRange;
    const updateStmt: AnyNode = {
      type: 'ExpressionStatement',
      expression: stmt.update,
      loc: stmt.update.loc,
      _forColumnRange: updateColRange,
    };
    stmt.update = null;
    stmt.body.body.push(updateStmt);
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
    const popNode = buildPopFrame();

    if (stmt.type === 'ForStatement' && stmt.init === null) {
      // let/const init was pre-extracted into the parent block: push/pop go in a
      // wrapper block around the for statement so the frame is alive during every
      // condition check. instrumentBlock will apply the wrapper after this returns.
      stmt._blockWrap = { push: pushNode, pop: popNode };
    } else if (isWhileStyle) {
      // while/do-while: wrap the loop so the block frame is alive during condition
      // checks (same approach as for-loops with extracted init).
      stmt._blockWrap = { push: pushNode, pop: popNode };
    } else {
      // for...in / for...of: no separate condition step, so push/pop inside body is fine
      stmt.body.body.splice(1, 0, pushNode);
      stmt.body.body.push(popNode);
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

    _parentVarNames = savedParentVarNames;
  } else {
    // No block-scoped vars (e.g. var-based loop) — normal instrumentation
    instrumentBlock(stmt.body.body, loopVars, false);
  }
}

/**
 * Instrument a class declaration/expression.
 */
function instrumentClass(cls: AnyNode, scopeVars: string[]): void {
  if (cls.body?.body) {
    for (const method of cls.body.body) {
      if (method.type === 'MethodDefinition' && method.value) {
        instrumentFunction(method.value, scopeVars);
      }
    }
  }
}
