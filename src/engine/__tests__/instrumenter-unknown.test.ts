/**
 * Syntax the instrumenter doesn't know is an error, never code left to run
 * unseen (#46). Acorn produces no such node today, so its parser is wrapped to
 * swap one in: a future expression, statement or class member.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('acorn', async (importOriginal) => {
  const real = await importOriginal<typeof import('acorn')>();
  return {
    ...real,
    parse: (source: string, options: Parameters<typeof real.parse>[1]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ast = real.parse(source, options) as any;
      const first = ast.body[0];
      const future = (type: string) => ({ type, start: first.start, end: first.end, loc: first.loc });
      if (source.includes('FUTURE_EXPRESSION')) first.expression.arguments[0] = future('PipelineExpression');
      if (source.includes('FUTURE_STATEMENT')) ast.body[1] = future('UsingDeclaration');
      if (source.includes('FUTURE_MEMBER')) first.body.body.push(future('AccessorProperty'));
      return ast;
    },
  };
});

const { instrument, UnsupportedSyntaxError } = await import('../../engines/js/instrumenter');
const { prepareProgram } = await import('../../engines/js/executor');

describe('syntax the instrumenter does not know (#46)', () => {
  it('is an error naming it, for an expression, a statement and a class member', () => {
    expect(() => instrument('f(FUTURE_EXPRESSION);')).toThrow(UnsupportedSyntaxError);
    expect(() => instrument('f(FUTURE_EXPRESSION);')).toThrow("pipeline expression isn't supported in JSTutor yet");
    expect(() => instrument('let a = 1;\nFUTURE_STATEMENT;')).toThrow("using declaration isn't supported in JSTutor yet");
    expect(() => instrument('class C { FUTURE_MEMBER() {} }')).toThrow("accessor property isn't supported in JSTutor yet");
  });

  it('stops the program before it runs, at its line', () => {
    expect(prepareProgram('let a = 1;\nFUTURE_STATEMENT;')).toEqual({
      reply: { type: 'error', message: "using declaration isn't supported in JSTutor yet", line: 1 },
    });
  });
});
