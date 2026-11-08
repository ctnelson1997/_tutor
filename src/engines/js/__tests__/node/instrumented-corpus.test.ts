/**
 * Every place code can appear is instrumented (#46), checked statically on
 * every corpus program: each statement JSTutor steps at has a capture (or a
 * condition, a return step, the script's last step) with its line, each
 * function keeps a frame, and each loop has its guard. The coverage check in
 * node-differential.test.ts checks the same by running the programs.
 */
import * as acorn from 'acorn';
import { describe, expect, it } from 'vitest';
import { instrument } from '../../instrumenter';
import { SYNTAX_ERRORS_CATEGORY, loadCases } from './corpus';
import { stepStatements } from './record';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

const STEP_CALLS = new Set(['__capture__', '__condition__', '__popFrame__', '__endScript__']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const LOOPS = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);

/** The runtime calls whose arguments are readers the instrumenter made (#87, #90, #93), not the program's functions. */
const READER_CALLS = new Set(['__pushFrame__', '__setGlobals__', '__privateNames__']);

function walk(node: AnyNode, visit: (n: AnyNode) => void): void {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && READER_CALLS.has(node.callee.name)) return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue;
    if (Array.isArray(value)) value.forEach(v => walk(v, visit));
    else if (value && typeof (value as AnyNode).type === 'string') walk(value, visit);
  }
}

/** The line a step call's argument names: a number, or [line, startCol, endCol]. */
function lineOf(arg: AnyNode): number | null {
  if (!arg) return null;
  if (arg.type === 'Literal' && typeof arg.value === 'number') return arg.value;
  if (arg.type === 'ArrayExpression' && arg.elements[0]?.type === 'Literal') return arg.elements[0].value;
  return null;
}

function check(source: string): string[] {
  const problems: string[] = [];
  const ast = acorn.parse(instrument(source), { ecmaVersion: 'latest', sourceType: 'script' }) as AnyNode;
  const stepLines = new Set<number>();
  walk(ast, n => {
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && STEP_CALLS.has(n.callee.name)) {
      const line = lineOf(n.callee.name === '__capture__' || n.callee.name === '__endScript__' ? n.arguments[0] : n.arguments[1]);
      if (line) stepLines.add(line);
    }
    if (FUNCTIONS.has(n.type)) {
      // (after its directives, which stay first, #89)
      const first = n.body.body?.find((st: AnyNode) => typeof st.directive !== 'string');
      const keepsFrame = first?.type === 'VariableDeclaration' && first.declarations[0]?.id.name === '__fr__';
      if (!keepsFrame) problems.push(`a function (${n.id?.name ?? 'anonymous'}) without a frame`);
    }
    if (LOOPS.has(n.type)) {
      const guard = n.body.body?.[0];
      if (!(guard?.type === 'ExpressionStatement' && guard.expression.callee?.name === '__loop__')) problems.push('a loop without its guard');
    }
  });
  for (const s of stepStatements(source)) {
    if (!stepLines.has(s.line)) problems.push(`no step for the statement at line ${s.line}`);
  }
  return [...new Set(problems)];
}

describe('every corpus program is instrumented everywhere (#46)', () => {
  for (const c of loadCases().filter(x => x.category !== SYNTAX_ERRORS_CATEGORY)) {
    it(c.id, () => {
      expect(check(c.source)).toEqual([]);
    });
  }
});
