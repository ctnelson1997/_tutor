/**
 * The Java interpreter: the CST from java-parser becomes the AST (ast/,
 * #12), the binder resolves names and types (semantic/, #13), and the
 * evaluator runs the bound tree, recording a step at each point
 * pythontutor.com would (eval/, #14, #24).
 *
 * A program the binder rejects stops before any step: a construct JavaTutor
 * doesn't support yet with its "… aren't supported in JavaTutor yet"
 * message, and a program javac would reject with javac's error.
 */

import type { CstNode } from './parser';
import { sourceOf } from './parser';
import { toAst, type CstNode as AstCstNode } from './ast/convert';
import { bindProgram, type Diagnostic } from './semantic/binder';
import { Evaluator, type ExecuteResult, type RunLimits } from './eval/evaluator';

export { STATIC_FIELDS_FRAME, RETURN_VALUE, DEFAULT_LIMITS } from './eval/evaluator';
export type { ExecuteResult, RunLimits } from './eval/evaluator';

export class JavaInterpreter {
  private readonly stdin: string;
  private readonly limits: Partial<RunLimits>;

  constructor(stdin = '', limits: Partial<RunLimits> = {}) {
    this.stdin = stdin;
    this.limits = limits;
  }

  /** Run a program parsed by parseJava (or pass its source when the CST came from elsewhere). */
  execute(cst: CstNode, source = sourceOf(cst)): ExecuteResult {
    if (source === undefined) throw new Error('JavaInterpreter.execute needs the source the CST was parsed from');
    let bound;
    try {
      bound = bindProgram(toAst(cst as unknown as AstCstNode, source));
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const internal = 'Internal JavaTutor error (please report it)';
      return { snapshots: [], error: `${internal}: ${raw}`, failure: { kind: 'error', message: internal } };
    }
    const rejected = firstOf(bound.diagnostics, 'unsupported') ?? firstOf(bound.diagnostics, 'error');
    if (rejected) {
      const line = rejected.range.line;
      return { snapshots: [], error: `Line ${line}: ${rejected.message}`, failure: { kind: 'error', message: rejected.message, line } };
    }
    return new Evaluator(bound.program, source, this.stdin, this.limits).execute();
  }
}

/** The diagnostic of this kind that comes first in the source. */
function firstOf(diagnostics: Diagnostic[], kind: Diagnostic['kind']): Diagnostic | undefined {
  let first: Diagnostic | undefined;
  for (const d of diagnostics) if (d.kind === kind && (!first || d.range.start < first.range.start)) first = d;
  return first;
}
