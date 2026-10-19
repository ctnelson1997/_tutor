/**
 * Runs that don't leak into each other (#35, #36's decision B): a PySession
 * restores each program's interpreter from a memory snapshot taken once, so
 * what one program changes never reaches the next. The pairs are the analysis
 * branch's py-leak.mjs and #36's table, run one after the other in one
 * session; the second program must print what it prints in a fresh CPython.
 * Also the session itself: the snapshot, the fallback to full loads, and a
 * failed restore.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WorkerMessage } from '../../../types/snapshot';
import { PySession, type SessionPyodide } from '../session';
import { getTracerCode } from '../tracer';
import { loadNodePyodide, type NodePyodide } from './cpython/pyodideNode';

const tracer = getTracerCode();
let session: PySession<NodePyodide>;

beforeAll(async () => {
  session = new PySession<NodePyodide>(options => loadNodePyodide(options), tracer, py => {
    py.setStdout({ batched: () => {} });
    py.setStderr({ batched: () => {} });
  });
  await session.init();
}, 60_000);

afterEach(() => vi.restoreAllMocks());

/** What a run printed, and how it ended. */
function outcome(reply: WorkerMessage): string {
  if (reply.type === 'error') return `error before running: ${reply.message}`;
  const out = reply.snapshots[reply.snapshots.length - 1]?.stdout.join('\n') ?? '';
  return reply.error ? `${out} !! ${reply.error.message}` : out;
}

const PAIRS: [string, string, string, string][] = [
  // [what A does, program A, program B, B's output in a fresh CPython]
  ['patches a module', 'import math\nmath.pi = 3\nprint(math.pi)\n', 'import math\nprint(math.pi)\n', '3.141592653589793'],
  ['lowers the recursion limit', 'import sys\nsys.setrecursionlimit(60)\n', 'def d(n):\n    return 0 if n == 0 else 1 + d(n - 1)\nprint(d(100))\n', '100'],
  ['puts a module in sys.modules', 'import sys, types\nm = types.ModuleType("helper")\nm.x = 41\nsys.modules["helper"] = m\n', 'try:\n    import helper\n    print(helper.x)\nexcept ModuleNotFoundError as e:\n    print(e)\n', "No module named 'helper'"],
  ['replaces a builtin', 'import builtins\nbuiltins.len = lambda x: 99\n', 'print(len([1, 2]))\n', '2'],
  ['breaks print', 'import builtins\nbuiltins.print = None\n', 'print("still prints")\n', 'still prints'],
  ['redirects stdout and leaves it', 'import sys, io\nsys.stdout = io.StringIO()\nprint("hidden")\n', 'import sys\nsys.stdout.write("direct\\n")\nprint("next")\n', 'direct\nnext'],
  ['adds to sys.path', 'import sys\nsys.path.append("/tmp/extra")\n', 'import sys\nprint("/tmp/extra" in sys.path)\n', 'False'],
  ['writes a file', 'with open("notes.txt", "w") as f:\n    f.write("secret")\n', 'try:\n    open("notes.txt")\nexcept FileNotFoundError:\n    print("no file")\n', 'no file'],
  ['defines a global', 'leftover = 1\n', 'print("leftover" in globals())\n', 'False'],
  ['changes the working directory', 'import os\nos.makedirs("/tmp/w", exist_ok=True)\nos.chdir("/tmp/w")\n', 'import os\nprint(os.getcwd())\n', '/home/pyodide'],
];

describe('a run leaves nothing behind for the next', () => {
  for (const [what, a, b, want] of PAIRS) {
    it(`when the first program ${what}`, async () => {
      await session.run(a);
      expect(outcome(await session.run(b))).toBe(want);
    }, 30_000);
  }

  it("when the first program seeds random: the next one's draws aren't that sequence", async () => {
    const first = outcome(await session.run('import random\nrandom.seed(1)\nprint(random.random(), random.random())\n')).split(' ');
    const next = outcome(await session.run('import random\nprint(random.random())\n'));
    expect(next).not.toBe(first[1]);
  }, 30_000);

  it('reads input afresh for each run', async () => {
    expect(outcome(await session.run('print(input())\n', { stdin: 'one\ntwo\n' }))).toBe('one');
    expect(outcome(await session.run('print(input())\n', { stdin: 'three\n' }))).toBe('three');
  }, 30_000);

  it('uses snapshots, so a fresh interpreter is quick', async () => {
    expect(session.fallbackReason).toBeNull();
    const t0 = performance.now();
    for (let i = 0; i < 3; i++) await session.run('x = 1\n');
    expect(performance.now() - t0).toBeLessThan(3000);
  }, 30_000);
});

describe('PySession without snapshots', () => {
  /** A fake Pyodide: runs nothing, replies with the number of the interpreter it is. */
  function fakeLoader(snapshots: boolean, failRestore = false) {
    let count = 0;
    const loads: string[] = [];
    const load = async (options: { _makeSnapshot?: boolean; _loadSnapshot?: Uint8Array }): Promise<SessionPyodide> => {
      const id = ++count;
      loads.push(options._loadSnapshot ? 'restore' : options._makeSnapshot ? 'base' : 'full');
      if (options._loadSnapshot && failRestore) throw new Error('restore failed');
      const py: SessionPyodide = {
        runPython: () => undefined,
        globals: { get: () => () => JSON.stringify({ type: 'result', snapshots: [], interpreter: id }) },
      };
      if (snapshots) py.makeMemorySnapshot = () => new Uint8Array([1]);
      return py;
    };
    return { load, loads };
  }
  const interpreter = (r: WorkerMessage) => (r as unknown as { interpreter: number }).interpreter;

  it('gives each run its own interpreter, restored from the snapshot', async () => {
    const { load, loads } = fakeLoader(true);
    const s = new PySession(load, 'TRACER');
    await s.init();
    const ids = [interpreter(await s.run('a')), interpreter(await s.run('b'))];
    expect(new Set(ids).size).toBe(2);
    expect(loads.slice(0, 3)).toEqual(['base', 'restore', 'restore']);
  });

  it('loads in full for each run when no snapshot can be made', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { load, loads } = fakeLoader(false);
    const s = new PySession(load, 'TRACER');
    await s.init();
    expect(s.fallbackReason).toMatch(/no memory snapshots/);
    const ids = [interpreter(await s.run('a')), interpreter(await s.run('b'))];
    expect(ids).toEqual([1, 2]);
    expect(loads.slice(0, 2)).toEqual(['base', 'full']);
  });

  it('falls back to full loads when restoring fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { load, loads } = fakeLoader(true, true);
    const s = new PySession(load, 'TRACER');
    await s.init();
    expect((await s.run('a')).type).toBe('result');
    expect(s.fallbackReason).toBe('restore failed');
    expect(loads).toContain('full');
  });

  it("fails to start when Pyodide can't be loaded at all", async () => {
    const s = new PySession(async () => { throw new Error('offline'); }, 'TRACER');
    await expect(s.init()).rejects.toThrow('offline');
  });
});
