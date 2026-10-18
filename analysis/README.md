# PyTutor and JSTutor: the analysis behind the roadmaps

This folder is the throwaway harness and corpus that produced the PyTutor and JSTutor roadmaps (see #26 and #27 for the method). The JDK harness attached to #4 played the same role for Java. It isn't wired into `npm test`: step 1 of each roadmap turns it into a committed differential suite.

## What it does

**PyTutor.** For each `py/cases/<category>/<name>.py` (plus `<name>.stdin`), `py-case.mjs` runs two separate processes with Pyodide 0.27.5 under Node:
- **golden**: CPython 3.12 runs the program plainly, with a minimal reference `sys.settrace` that records each `call`/`line`/`return` event of the user's frames, with the frame stack and the `repr` of each local.
- **traced**: PyTutor's tracer (`tracer.py`, generated from `src/engines/py/tracer.ts`) runs it exactly as `src/engines/py/worker.ts` does: the source is pasted into `run_traced("""…""")`, and stdin is Pyodide's browser-worker default, which throws.

`py-analyze.mjs` then compares:
- stdout, exceptions and tracebacks;
- snapshot invariants (refs resolve, lines are in range, no leaked names, everything on the heap is reachable);
- each step against the reference events (same line and frame stack, in order), with each local's value and `return ↵`;
- lines CPython ran that got no step;
- the final globals.

PyTutor's deliberate rules are encoded rather than reported: lines inside a multi-line statement are one step, a comprehension has its own frame, and `__module__`/`__qualname__` are hidden.

**JSTutor.** For each `js/cases/<category>/<name>.js`, `js-case.mjs` runs:
- **golden**: Node runs the program as a classic script in a fresh `vm` context with timers, waits until no timer is pending, and records three things:
  - every console call: its arguments as a canonical tree, and `util.format`'s text;
  - V8's precise block coverage, to know which statements ran;
  - the final value of each top-level name.
- **traced**: `instrument()` and the runtime (`jstutor.mjs`, bundled from `src/engines/js/`) run in a context built like the worker's, and the reply is taken when `executor.ts` takes it, right after the synchronous code. Console calls made after that are recorded as lost.

`js-analyze.mjs` then compares:
- the console's meaning (the values, in order) and its display (JSTutor's text vs Node's; a difference only in layout is counted separately);
- uncaught exceptions;
- lines that ran with no step;
- invariants (refs resolve, no instrumentation names, no frames left at the end);
- the final state.

Coverage counts a statement after a throw in the same block as run, so lines in programs that throw are reported as unsure.

`classify.mjs` assigns every program that doesn't match to the roadmap issue(s) that fix it (`results/<lang>-causes.json`). This is the seed of each suite's `known-failures.json`.

## Running it

```sh
cd analysis && npm install            # pyodide 0.27.5
cd .. && npx tsx analysis/prepare.ts  # tracer.py, jstutor.mjs, examples/ from the repo's source
cd analysis
node run-all.mjs py && node py-analyze.mjs && node classify.mjs py     # about 3 minutes
node run-all.mjs js && node js-analyze.mjs && node classify.mjs js
node py-analyze.mjs --case realistic/group-students --steps            # CPython's events and PyTutor's steps
node js-analyze.mjs --case control-flow/for-no-test-break --steps
node tagnotes.cjs py comprehension-side-effects                        # every case with a tag, with its notes
node py-leak.mjs                                                       # pairs of runs in one interpreter
```

`run-all.mjs` skips cases whose results are newer than the case file and the runner (`--force` reruns), and writes `results/<lang>/`. `node runpy.mjs <file.py>` runs one Python program in Pyodide plainly.

## Results at ea4eb9e

| | Matches | Layout only | Wrong output, no error | Wrong steps or state, no error | Fails | Total |
|---|---|---|---|---|---|---|
| PyTutor vs CPython 3.12 | 131 | n/a | 34 | 94 | 5 | 264 |
| JSTutor vs Node 24 | 53 | 93 | 89 | 31 | 1 | 279, including 12 parse errors, all worded differently from V8 |

Per category: `node py-analyze.mjs`, `node js-analyze.mjs`. Per case: `results/py-report.json`, `results/js-report.json`.

The corpus was written for this analysis to cover the programs students write, with edge cases the engines could get wrong. Every program was checked against the real runtime when written.
- **Python:** 45 realistic CS1/CS2 programs (15 reading `input()`), 195 targeted checks, 12 syntax errors and the 12 shipped examples.
- **JavaScript:** 45 realistic programs, 211 targeted checks, 12 parse errors and the 11 shipped examples.
