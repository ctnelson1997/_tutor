/**
 * The dispatcher (src/engine/executor.ts): how an engine's reply lands in the
 * store. A run that stopped early keeps its steps and its error (#7).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExecutionSnapshot, WorkerMessage } from '../../types/snapshot';

let reply: WorkerMessage | Error = { type: 'result', snapshots: [] };

vi.mock('../../engines/registry', () => ({
  getEngine: async () => ({
    execute: async () => {
      if (reply instanceof Error) throw reply;
      return reply;
    },
  }),
}));

const { runCode } = await import('../executor');
const { useStore } = await import('../../store/useStore');

function step(line: number): ExecutionSnapshot {
  return { step: line - 1, line, callStack: [{ name: 'main', variables: [] }], heap: [], stdout: [] };
}

describe('runCode', () => {
  beforeEach(() => useStore.getState().reset());

  it('stores the steps of a run that finished', async () => {
    reply = { type: 'result', snapshots: [step(1), step(2)] };
    await runCode('code');
    const state = useStore.getState();
    expect(state.snapshots).toHaveLength(2);
    expect(state.error).toBeNull();
    expect(state.isRunning).toBe(false);
  });

  it('keeps both the steps and the error of a run that stopped early', async () => {
    reply = {
      type: 'result',
      snapshots: [step(1), step(2), step(3)],
      error: { kind: 'exception', message: 'java.lang.ArithmeticException: / by zero', line: 3, stderr: 'Exception in thread "main" …' },
    };
    await runCode('code');
    const state = useStore.getState();
    expect(state.snapshots).toHaveLength(3);
    expect(state.error).toEqual(reply.error);
  });

  it('shows the error of a run that stopped before its first step', async () => {
    reply = { type: 'result', snapshots: [], error: { kind: 'error', message: "Enums aren't supported in JavaTutor yet", line: 2 } };
    await runCode('code');
    expect(useStore.getState().snapshots).toHaveLength(0);
    expect(useStore.getState().error).toEqual({ kind: 'error', message: "Enums aren't supported in JavaTutor yet", line: 2 });
  });

  it('explains a run with no steps and no error', async () => {
    reply = { type: 'result', snapshots: [] };
    await runCode('code');
    expect(useStore.getState().error?.message).toMatch(/^No execution steps were captured/);
  });

  it('shows a program that does not compile: no steps, every error kept (#23)', async () => {
    const error = { kind: 'compile' as const, message: "';' expected", line: 3, lines: [3, 5], stderr: "Main.java:3: error: ';' expected\n…\n2 errors" };
    reply = { type: 'result', snapshots: [], error };
    await runCode('code');
    expect(useStore.getState().snapshots).toHaveLength(0);
    expect(useStore.getState().error).toEqual(error);
  });

  it('shows a failure before anything ran, such as a parse error', async () => {
    reply = { type: 'error', message: "Syntax error: expected ';' but found 'System'", line: 3 };
    await runCode('code');
    expect(useStore.getState().snapshots).toHaveLength(0);
    expect(useStore.getState().error).toEqual({ message: "Syntax error: expected ';' but found 'System'", line: 3 });
  });

  it('shows an engine that fails to load or run', async () => {
    reply = new Error('Python engine took too long to load.');
    await runCode('code');
    expect(useStore.getState().error).toEqual({ message: 'Python engine took too long to load.' });
    expect(useStore.getState().isRunning).toBe(false);
  });
});
