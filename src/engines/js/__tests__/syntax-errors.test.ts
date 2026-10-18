/**
 * Programs that don't parse (#50): reported in the browser's own words, as a
 * `compile` RunError with no steps, the line marked and the console listing
 * the line with a caret under the column.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeProgram, syntaxErrorReply, syntaxProblemFromEvent } from '../executor';
import { runJsTutor } from './node/harness';

describe('syntax errors (#50)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the browser's error event: Chrome's and Firefox's messages, the 1-based column made 0-based", () => {
    expect(syntaxProblemFromEvent({ message: 'Uncaught SyntaxError: missing ) after argument list', lineno: 7, colno: 31 }))
      .toEqual({ message: 'missing ) after argument list', line: 7, column: 30 });
    expect(syntaxProblemFromEvent({ message: 'SyntaxError: unexpected token: identifier', lineno: 4, colno: 0 }))
      .toEqual({ message: 'unexpected token: identifier', line: 4, column: null });
    expect(syntaxProblemFromEvent({ message: 'Uncaught TypeError: x is not a function', lineno: 2 })).toBeNull();
  });

  it('is a compile error with no steps, its line marked, and a listing with a caret (tabs kept)', () => {
    expect(syntaxErrorReply('let a = 1;\n\tconsole.log("x", a;', { message: 'missing ) after argument list', line: 2, column: 18 })).toEqual({
      type: 'result',
      snapshots: [],
      error: {
        kind: 'compile',
        message: 'SyntaxError: missing ) after argument list',
        line: 2,
        lines: [2],
        stderr: 'Uncaught SyntaxError: missing ) after argument list\n    at main.js:2:19\n\tconsole.log("x", a;\n\t                 ^',
      },
    });
  });

  it("prefers the engine's words, and falls back to the parser's when the engine has none", async () => {
    const source = 'let a = 1;\nconsole.log("x", a;';
    const engine = await executeProgram(source, { checkScript: async () => ({ message: 'missing ) after argument list', line: 2, column: 18 }) });
    expect(engine.type === 'result' && engine.error?.message).toBe('SyntaxError: missing ) after argument list');
    const parser = await executeProgram(source, { checkScript: async () => null });
    expect(parser.type === 'result' && parser.error).toMatchObject({ kind: 'compile', message: 'SyntaxError: Unexpected token', line: 2, lines: [2] });
  });

  it('asks the browser by loading the program as a worker script, whose error event says what is wrong', async () => {
    const loaded: string[] = [];
    class BrowserWorker {
      onerror: ((e: unknown) => void) | null = null;
      terminated = false;
      constructor(url: string) {
        loaded.push(url);
        setTimeout(() => this.onerror?.({ message: 'Uncaught SyntaxError: Unexpected end of input', lineno: 3, colno: 1, preventDefault() {} }), 0);
      }
      terminate() { this.terminated = true; }
    }
    vi.stubGlobal('Worker', BrowserWorker);
    const reply = await executeProgram('function f() {\n  return 1;\n');
    expect(loaded).toHaveLength(1);
    expect(reply.type === 'result' && reply.error).toMatchObject({ kind: 'compile', message: 'SyntaxError: Unexpected end of input', line: 3 });
  });

  it('matches V8 end to end through the worker harness', async () => {
    const reply = await runJsTutor('const MAX;\nconsole.log(MAX);');
    expect(reply).toMatchObject({ type: 'result', snapshots: [], error: { kind: 'compile', message: 'SyntaxError: Missing initializer in const declaration', line: 1 } });
  });
});
