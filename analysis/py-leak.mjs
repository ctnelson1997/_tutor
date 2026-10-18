// PyTutor's worker keeps one Pyodide for every run. Does one program's state reach the next?
import { loadPyodide } from 'pyodide';
import { readFileSync } from 'node:fs';
const py = await loadPyodide();
py.setStdout({ batched: () => {} });
py.runPython(readFileSync(new URL('./tracer.py', import.meta.url), 'utf8'));
const run = src => { try { return run0(src); } catch (e) { return 'ENGINE THROWS ' + String(e.message).split('\n').filter(l => /Error/.test(l)).slice(-1)[0]; } };
const run0 = src => {
  const esc = src.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  const r = JSON.parse(py.runPython(`run_traced("""${esc}""")`));
  return r.type === 'error' ? 'ERROR ' + r.message : (r.snapshots.at(-1)?.stdout.join(' | ') + (r.error ? ' !! ' + r.error.message : ''));
};
const pairs = [
  ['monkeypatched module', 'import math\nmath.pi = 3\nprint(math.pi)', 'import math\nprint(math.pi)'],
  ['recursion limit', 'import sys\nsys.setrecursionlimit(60)\nprint(sys.getrecursionlimit())', 'def d(n):\n    return 0 if n == 0 else 1 + d(n - 1)\nprint(d(100))'],
  ['random state', 'import random\nrandom.seed(1)\nprint(random.random())', 'import random\nprint(random.random())'],
  ['user module in sys.modules', 'import sys, types\nm = types.ModuleType("helper")\nm.x = 41\nsys.modules["helper"] = m\nprint("made")', 'import helper\nprint(helper.x)'],
  ['builtins changed', 'import builtins\nbuiltins.len = lambda x: 99\nprint(len([1]))', 'print(len([1, 2]))'],
  ['stdout redirected', 'import sys, io\nsys.stdout = io.StringIO()\nprint("hidden?")', 'import sys\nsys.stdout.write("direct\\n")\nprint("next")'],
];
for (const [name, a, b] of pairs) {
  const ra = run(a), rb = run(b);
  console.log(`${name}:\n   A -> ${ra}\n   B -> ${rb}`);
}
