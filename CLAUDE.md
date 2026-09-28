# CLAUDE.md — Project Instructions for Tutor

## Documentation Policy

When making codebase changes (new engines, scripts, store fields, utilities, architecture, dependencies, etc.), update **README.md** and **CLAUDE.md** in the same commit to keep documentation current. Do not let docs fall out of date.

## What This Is

A **client-side-only** React app that visualizes code execution step-by-step. Students write code in a CodeMirror editor and see call stack, variables, heap objects, and console output at every line. No backend — everything runs in the browser.

The architecture supports **multi-language builds**: each language has a `LanguageEngine` under `src/engines/`, and the Vite build system produces a standalone single-language site per target. Each target deploys to its own domain (e.g. jstutor.org, pytutor.org).

## Commands

```bash
npm run dev               # JS dev server (localhost:3000), alias for dev:js
npm run dev:js            # JS dev server
npm run dev:py            # Python dev server
npm run dev:java          # Java dev server
npm run dev:viewer:js     # Live viewer template (no examples baked in) — for renderer development
npm run dev:viewer:py     # Same, Python
npm run dev:viewer:java   # Same, Java
npm run build             # JS production build (tsc + vite, outputs to docs/) + viewer-js.html
npm run build:js          # Same as above (main + viewer)
npm run build:py          # Python build + viewer-py.html
npm run build:java        # Java build + viewer-java.html
npm run build:viewer:js   # Just the viewer template (docs/viewer-js.html); skips main build + tsc
npm run build:viewer:py   # Just the Python viewer template
npm run build:viewer:java # Just the Java viewer template
npm run build:viewer:all  # All three viewer templates
npm run build:all         # Build all language targets (js, py, java) — each emits both main + viewer
npm run test              # vitest run
npm run test:watch        # vitest in watch mode
npm run test:java:golden  # Regenerate the JDK differential goldens (needs JDK 21); `-- <filter>` limits, `-- --check` only verifies
npm run lint              # ESLint

npx tsx scripts/java-diff.ts [filter]                  # Every Java case's differences from real Java, tagged with its known-failure issue (no JDK needed)
npx tsx scripts/java-viz.ts <case id | file.java | example:slug> [--final] [--steps=a-b] [--stdin=...]  # Print each snapshot's frames + heap
```

`tsx` is a devDependency; the `scripts/` tools and `test:java:golden` run through it.

Build targets use Vite's `--mode` flag. Modes are either a language id (`js`/`py`/`java`) or `viewer-<lang>` for the standalone viewer build. `vite.config.ts` derives the language from either form and explicitly calls `loadEnv(lang, …)` so both modes pull from the same `.env.<lang>` file — there is no `.env.viewer-<lang>` file.

### Quick Instrumenter Testing

To inspect instrumented output without running the full test suite, use `npx tsx -e` with a direct import. This is the fastest way to verify instrumentation changes:

```bash
npx tsx -e "import { instrument } from './src/engines/js/instrumenter'; console.log(instrument('let x = 1;\nconsole.log(x);'));"
```

- **Import path**: `'./src/engines/js/instrumenter'` (no `.ts` extension, relative from project root)
- **Use single quotes** inside the JS source string passed to `instrument()`, or escape double quotes
- **The output is the full instrumented JS source** — look for `__capture__`, `__pushFrame__`, `__popFrame__`, `__condition__`, and `__loopCount` calls
- To check specific details, filter the output:
  ```bash
  npx tsx -e "import { instrument } from './src/engines/js/instrumenter'; const out = instrument('function foo() { return 1; }\nlet x = foo();'); const match = out.match(/__capture__\((\d+)/); console.log('first capture line:', match[1]);"
  ```

## Architecture

```
User code
  -> LanguageEngine.execute(source)
    -> [language-specific pipeline]
    -> ExecutionSnapshot[]
  -> Zustand store
  -> React UI (language-agnostic)
```

### Build-Time Language Targeting

Each build bundles **only one language engine**. Controlled by:

- **`.env.js` / `.env.py` / `.env.java`** — per-language env vars (name, color, domain, tagline)
- **`src/config/branding.ts`** — reads `import.meta.env.VITE_*`, single source of truth for all UI branding
- **`src/engines/registry.ts`** — conditionally registers only the target engine based on `import.meta.env.VITE_LANGUAGE`; Vite tree-shakes the unused engine's code out of the bundle
- **`vite.config.ts`** — function form; detects `js`/`py`/`java` and `viewer-<lang>` modes, manually loads the matching `.env.<lang>` via `loadEnv`, exposes those values through `define`, and conditionally enables `vite-plugin-singlefile` + a `rename-viewer-output` hook for viewer builds

All hardcoded branding references and `#DD030B` colors have been replaced with `branding.*` imports. To add a new language target, create a new `.env.<lang>` file and add corresponding `dev:<lang>` / `build:<lang>` / `build:viewer:<lang>` scripts.

### Engine Layer (`src/engines/`)

Each language is a `LanguageEngine` (defined in `src/types/engine.ts`):

```
src/engines/
  registry.ts              # getEngine(), getEngineSync(), SUPPORTED_LANGUAGES, isLanguageId()
  js/
    index.ts               # jsEngine: LanguageEngine
    instrumenter.ts        # Acorn AST transform (938 lines, the core engine)
    runtime.ts             # getRuntimeCode() — JS string prepended to instrumented code
    executor.ts            # execute(source) -> Promise<WorkerMessage> (no store coupling)
    examples.ts            # 11 JS examples with language:'js' field
    security.ts            # analyzeCode() — regex-based suspicious pattern detection
  py/
    index.ts               # pyEngine: LanguageEngine (real Pyodide-based engine)
    tracer.ts              # getTracerCode() — Python sys.settrace() script as a string
    worker.ts              # Persistent module Web Worker — loads Pyodide from CDN, runs traced code
    executor.ts            # execute(source) -> Promise<WorkerMessage> — manages persistent worker lifecycle
    examples.ts            # 11 Python examples with language:'py' field
    security.ts            # analyzeCode() — regex-based suspicious pattern detection for Python
  java/
    index.ts               # javaEngine: LanguageEngine
    interpreter.ts         # AST-walking interpreter using java-parser CST (~3450 lines)
    references.ts          # Reference model: every assignable variable (local/static slot, field, array element) as get/set/declaredType, with null + bounds checks and assignment conversion
    literals.ts            # String/char/text-block literal values: single-pass escapes (octal, \uXXXX, \s), text block indentation stripping
    errors.ts              # InterpreterError, JavaRuntimeError (Java exceptions the runtime raises, e.g. NullPointerException), nullPointer(), UnsupportedFeatureError ("X isn't supported in JavaTutor yet")
    parser.ts              # Wrapper around java-parser: parseJava(), CST navigation helpers
    types.ts               # Java runtime type system (primitives, strings, arrays, objects, refs)
    executor.ts            # Ephemeral Web Worker executor (same pattern as JS engine); passes stdin through
    worker.ts              # Web Worker: posts runJava()'s reply
    run.ts                 # runJava(source, stdin): parse + interpret, building the worker's WorkerMessage (readable parse errors via describeParseError)
    examples.ts            # 18 Java examples with language:'java' field, including visualization-friendly data structures
    security.ts            # analyzeCode() — suspicious pattern detection for Java
    stdlib/                # Standard-library subset (pure fns over a small StdlibContext)
      context.ts           #   StdlibContext interface + HaltSignal (System.exit) + StdlibError
      format.ts            #   javaFormat() — String.format / printf conversions
      statics.ts           #   callStaticMethod/getStaticField: Math, wrappers, Character, Arrays, Objects, System, String, Collections, Comparator, List/Set/Map.of
      collections.ts       #   newBuiltin/callInstanceMethod/getIterableElements: List/Set/Map/Deque/Stack/Queue, Scanner, Random, Iterator, Map.Entry, library comparators
      exceptions.ts        #   exception class hierarchy (EXCEPTION_SUPER), exception objects, getMessage/getCause/toString, qualifiedExceptionName (java.lang.X)
      hierarchy.ts         #   supertypes of the emulated library classes, strings and boxed primitives, for instanceof / casts / catch
      util.ts              #   compareJava, compareValues, compareWith (Comparator objects), javaEquals, backing-array helpers, class-name sets
      index.ts             #   barrel exports
```

The **dispatcher** at `src/engine/executor.ts` is a thin layer that reads `language` from the store, calls `getEngine(language)`, delegates to `engine.execute()`, and updates the store. All UI components import `runCode` from here.

**The result contract (`WorkerMessage` in `src/types/snapshot.ts`, #7).** Every engine replies `{ type: 'result', snapshots, error? }` once the program has run, even if it ended early. `error` is a `RunError` with these fields:
- `message`;
- `line`: where it happened, which the editor marks;
- `kind`: `'exception'` (an uncaught exception), `'limit'` (the step cap or time budget) or `'error'` (the engine stopped it: an unsupported construct, a problem javac would reject, an internal failure);
- `stderr`: what the program's stderr would show, such as Java's stack trace or Python's traceback, shown in the console at the last step.

`{ type: 'error', message, line? }` is only for failures before anything ran: a parse error, the engine failing to load, or the worker's 10-second timeout. The dispatcher sets the snapshots first and then the error, because `setSnapshots` clears `error`. The UI treats an error that has snapshots as belonging to the last step:
- `EditorPanel` shows the banner (warning-colored for `limit`) and marks `error.line` with `.cm-error-line`.
- `ConsolePanel` appends `stderr` in red.
- `ControlBar` adds a link ("ends with an exception" / "stopped early") that jumps to the last step.
The labels live in `src/utils/runError.ts`. The console keeps whitespace (`white-space: pre-wrap`), so `printf` padding and stack traces line up.

### Adding a New Language

1. Create `src/engines/<lang>/` with an `index.ts` exporting a `LanguageEngine` object
2. Add a conditional registration block in `src/engines/registry.ts`
3. Expand `LanguageId` type in `src/types/engine.ts`
4. Create `.env.<lang>` with branding vars (`VITE_LANGUAGE`, `VITE_APP_NAME`, `VITE_BRAND_COLOR`, etc.)
5. Add `dev:<lang>`, `build:<lang>`, `dev:viewer:<lang>`, and `build:viewer:<lang>` scripts to `package.json`
6. Add the new language to the `LANGS` array in `vite.config.ts`

### Branding (`src/config/branding.ts`)

All UI branding (app name, colors, tagline, domain) flows from `import.meta.env.VITE_*` variables through a single `branding` object. Components import `branding` instead of using hardcoded strings. The env vars are set per build target via `.env.js` / `.env.py` / `.env.java` files loaded by Vite's `--mode` flag.

### Store (`src/store/useStore.ts`)

Zustand store with: `language`, `code`, `stdin`, `snapshots`, `currentStep`, `isRunning`, `error`, `hideFunctions`, `showReferences`. The `language` field defaults to `branding.languageId` and drives which engine is used and which editor extension / examples / sandbox code are shown. The `showReferences` flag enables Python's "everything is an object" visualization mode, where primitives are promoted to heap objects via `src/utils/promoteToHeap.ts`. The `stdin` field holds the preset console input consumed by Java's `Scanner` — it is edited via the `StdinPanel` (shown in the editor column for Java builds), passed to `engine.execute(source, { stdin })` by the dispatcher, and threaded into the interpreter constructor. `error` is a `RunError` (see the result contract above); alongside snapshots it describes how the run ended, at the last step.

### Routing (`src/main.tsx`)

HashRouter with routes:

```
/                           Main editor
/examples/:slug             Example
/share/:encoded             Shared code (legacy, defaults to build target)
/share/:lang/:encoded       Language-specific shared code
/embed/:encoded             Embed (legacy)
/embed/:lang/:encoded       Language-specific embed
```

Legacy share/embed routes (without `:lang`) default to `branding.languageId` — the build target language.

### Standalone Viewer (`viewer.html` + `src/viewer-main.tsx`)

The export feature ships a parallel entry point that runs without React Router. `viewer.html` (at the project root) is the HTML input for the `viewer-<lang>` build mode; `src/viewer-main.tsx` reads `window.__EXAMPLES__` (an array baked into the HTML by the export feature) and mounts `<ViewerApp />`. `ViewerApp` renders its own minimal navbar (brand + `ExamplePicker` when 2+ examples are present), then delegates to the existing `<App embed viewer />` for the rest of the layout.

`App` accepts a `viewer` prop in addition to `embed`. `ControlBar` treats `embed || viewer` as the condition for hiding Share/Embed/Export; the "Open in `<AppName>`" link points to `https://<branding.domain>` in viewer mode (rather than the share URL it would generate in embed mode).

The full app — engine included — is bundled into the single viewer HTML, so users opening an exported file can edit code and re-run the visualization with `runCode()` like in the live app.

### Export Feature

- **Trigger**: Export button in `ControlBar`, next to Share/Embed (hidden in `embed`/`viewer` modes). Opens `src/components/ExportModal.tsx`.
- **Pipeline**: `ExportModal` → `runCode` (if no snapshots yet) → `fetchViewerTemplate('./viewer-<lang>.html')` → `buildExportHtml(template, example)` → `downloadHtml(...)`. All splicing logic lives in `src/utils/exportHtml.ts`.
- **Template placeholder**: `viewer.html` contains `/* EXPORT_PLACEHOLDER_START */ window.__EXAMPLES__ = []; /* EXPORT_PLACEHOLDER_END */` inside a `<script id="tutor-examples">` block. `buildExportHtml` replaces the assignment between those markers with a single-example array (the markers themselves are preserved so future appends remain easy).
- **Multi-example merge**: users hand-edit the EXAMPLES array of an exported file to append entries from other exports. `ExamplePicker` shows a navbar dropdown when the array has 2+ entries.
- **Worker inlining**: the Python and Java executors import their workers via `?worker&inline` (`import PyWorker from './worker.ts?worker&inline'`). This causes Vite to serialize the worker as a base64 blob URL inside the singlefile bundle — required for the standalone HTML to run without external chunks. The same import works in the main builds too (just chunked there).
- **Engine versioning**: the `tutor-engine-version-marker` plugin in [vite.config.ts](vite.config.ts) tags the inlined module `<script>` with `data-tutor-engine="X.Y.Z"` (read from `package.json` at build time), injects `window.__TUTOR_ENGINE_VERSION__=...` at the very top of that script's body, and prepends a multi-line HTML comment with explicit upgrade instructions (download a fresh `viewer-<lang>.html`, replace just the data-tutor-engine script block, EXAMPLES survives). The version is also shown in the viewer's navbar as `engine vX.Y.Z`. The main app's [AppFooter](src/components/AppFooter.tsx) reads the same value via the `__TUTOR_ENGINE_VERSION__` compile-time constant injected by `define`.
- **Data schema versioning**: `CURRENT_EXAMPLE_SCHEMA_VERSION` in [src/types/viewer.ts](src/types/viewer.ts) is the contract version of the `ViewerExample` shape (currently `2` — `2` added the optional `stdin` field so exported Java `Scanner` programs re-run with their original input; `ExportModal` reads `stdin` from the store and `viewer-main.tsx` restores it). `buildExportHtml` stamps it into every payload; `viewer-main.tsx` compares each example's `schemaVersion` against the constant and passes a `schemaMismatch` flag down to `ViewerApp`, which renders a dismissible warning alert when an example was produced by a newer engine than what's running. Bump the constant when adding required fields to `ViewerExample` or to `ExecutionSnapshot` so previously-exported files can't masquerade as the new shape. The optional `error` field (how the recorded run ended, #7) was added without a bump, since an older viewer still shows the steps; `ExportModal` writes the store's error, and `viewer-main.tsx` / `ExamplePicker` restore it (and `stdin`).
- **Splice safety**: `buildExportHtml` uses `lastIndexOf` to locate the `tutor-examples` script tag, AND assembles the marker strings from concatenated char fragments in source (`'<' + 'script id="tutor-examples">'`). Both guard against the same `exportHtml.ts` source being bundled into the engine: if the regex source or error messages contained the literal marker text, the splice could false-match inside the engine bundle and corrupt it. The `ignores marker strings that appear inside the bundled engine source` test in [exportHtml.test.ts](src/utils/__tests__/exportHtml.test.ts) covers this regression.

## TypeScript Constraints

- **`erasableSyntaxOnly: true`** — No `enum`, no parameter properties (`constructor(readonly x)`), no `namespace`. Use `type` unions and plain class fields instead.
- **`verbatimModuleSyntax: true`** — Use `import type` for type-only imports.
- **`noUnusedLocals` / `noUnusedParameters`** — Prefix unused params with `_` if needed.
- Test files (`__tests__/`) are excluded from `tsconfig.app.json` via the `exclude` array — they use Node APIs (`node:vm`) that aren't in the app's type scope.

## Testing

**Framework**: Vitest 4.x (reads `vite.config.ts` automatically, no separate config needed).

**Test suites**:

| Suite | Location | What it tests |
|---|---|---|
| Instrumenter | `src/engine/__tests__/instrumenter.test.ts` | `instrument()` output: capture injection, loop guards, condition wrapping, destructuring, closures, classes, all examples |
| Pipeline | `src/engine/__tests__/pipeline.test.ts` | Full instrument -> runtime -> eval -> snapshots pipeline using `node:vm` sandboxed contexts. `runPipelineResult` builds the reply as the worker does (`__runResult__`), so runs that end early are tested: an uncaught throw keeps its steps (the last one is the throw), a runtime `TypeError` or thrown non-Error value becomes an `exception` error, and an endless loop or 5000+ steps stops with a `limit` notice |
| Dispatcher | `src/engine/__tests__/executor.test.ts` | `runCode` against a mocked registry: a finished run, a run that stopped early (steps and error both kept), an error before the first step, no steps and no error, a pre-run `{ type: 'error' }`, and an engine that throws |
| Behavior comparison | `src/engine/__tests__/behavior-comparison.test.ts` | Runs each snippet as plain JS AND through the full instrumented pipeline, then asserts identical `console.log` output (and, for control-flow cases, a clean final call stack). Add new cases here when fixing engine bugs found via real-world code — it catches semantic regressions across instrumenter + runtime in one place. |
| diffSnapshots | `src/utils/__tests__/diffSnapshots.test.ts` | `getChangedKeys()`: variable changes, heap property changes, closure vars, this context |
| Share | `src/utils/__tests__/share.test.ts` | `encodeShareCode`/`decodeShareCode` round-trips + `analyzeCode` suspicious pattern detection |
| Store | `src/store/__tests__/useStore.test.ts` | Zustand actions: step navigation, clamping, reset, error handling, and an error set after snapshots (which `setSnapshots` clears) |
| Run error labels | `src/utils/__tests__/runError.test.ts` | The error banner titles and step-bar labels for each `RunError` kind |
| Registry | `src/engines/__tests__/registry.test.ts` | Engine loading, contract validation, branding-store integration |
| Branding | `src/config/__tests__/branding.test.ts` | Branding field shape, types, defaults, hex color validation |
| Python Engine | `src/engines/py/__tests__/engine.test.ts` | Engine contract, heapTypeConfig shape, example validation, analyzeCode integration |
| Python Tracer | `src/engines/py/__tests__/tracer.test.ts` | Tracer script structure: settrace events, serialization, limits, security sandbox, baseline filtering |
| Python Security | `src/engines/py/__tests__/security.test.ts` | All suspicious patterns, false positive avoidance, edge cases |
| Java Interpreter | `src/engines/java/__tests__/interpreter.test.ts` | Variables, arithmetic, control flow, methods, arrays, strings, snapshots, block scopes |
| Java references | `src/engines/java/__tests__/references.test.ts` | Assignment targets and the reference model (#5). Covers every target shape: local, parameter, static (unqualified, qualified, another class's), field of a local, explicit/implicit `this` field, `this` chain, array element (incl. 2D), field of an array element, element of a field, three-part chain, method-result chains, a side-effecting index, and a parenthesized variable. Each shape is tried with `=`, `+=`, prefix `++` and postfix `--`, plus witness values (nothing else written) and call counts (subexpressions run once). Also covers JLS §15.26 evaluation order, narrowing and assignment conversion, NPE/AIOOBE, name-resolution order, loud failures for unsupported constructs, and direct tests of `references.ts`. Expected outputs were verified against JDK 21. |
| Java failures | `src/engines/java/__tests__/failures.test.ts` | Runs that end early (#7), through `runJava`. An uncaught exception keeps every step, ending at the throw site, and is reported as `java` reports it, stack trace included (checked against JDK 21), for nested exception classes, constructors (`<init>`), a user `toString()`, library errors (with the call's line) and a trimmed `StackOverflowError` trace. A caught runtime exception shows the throwing frame, then the catch. Limits: 5000 steps with a notice, lowered limits, endless work inside `toString()` (`maxWork`), the time budget, and no finally after a limit. Engine errors: a line even when the error has none, unsupported declarations before any step, and internal failures with no JavaScript text for students. No error for normal ends, `return` or `System.exit`. Parse errors: a missing `;` on javac's line, and code that ends too early. |
| Java rendering | `src/engines/java/__tests__/rendering.test.ts` | User classes named after library classes (#8). Every shipped example's final step draws user classes as objects with their declared fields, and the Linked List example's `head`/`tail` point at its nodes. A user `Stack` draws as an object and runs its own methods. A user `HashMap`, `ArrayList` or `StringBuilder` isn't printed, iterated or type-checked as the library class. `__`-prefixed user fields are shown, and library collections still draw as collections. |
| Java syntax | `src/engines/java/__tests__/syntax.test.ts` | Syntax coverage (#6). Every construct JavaTutor rejects stops the program with its exact "… isn't supported in JavaTutor yet" message and line: lambdas, method and constructor references, class literals, anonymous classes, nested, top-level and local enums and records, interface default methods, inheritance, local classes and interfaces, annotation types, library classes it lacks, hex float literals, duplicate nested class names, for-each over a user Iterable, and inner classes using their enclosing object. It also checks when a rejection happens (declarations before any step, expressions when reached, finally blocks skipped). And it checks what the steps show: an `instanceof` pattern variable scoped to its `if` (and kept after `if (!(o instanceof T t)) return;`), switch-block scope, `<clinit>` frames for static initializers (lazily for non-entry classes), instance initializers in the constructor's frame without its parameters, `this(…)` as its own frame, `args` bound only when main uses it, no loop scopes left after a labeled break, try-with-resources variables only in the try block, and `assert` taking a step without evaluating. Class initialization order is checked against JDK output. |
| Java literals | `src/engines/java/__tests__/literals.test.ts` | `literals.ts`: single-pass escapes (octal, Unicode escapes and the even-backslash rule, `\s`, line continuation), string and char literal values, and text block indentation stripping, trailing whitespace and escapes. Expected values from JDK 21. |
| Java stdlib | `src/engines/java/__tests__/stdlib.test.ts` | Unit tests for `src/engines/java/stdlib` driven through a lightweight Map-backed `StdlibContext` (no full interpreter): `javaFormat` specifiers, `callStaticMethod`/`getStaticField` (Math/wrappers/Character/Arrays/Objects/Collections), collection instance methods (list/set/map/stack/deque), `Scanner` tokenization, and `Random` determinism/bounds. Also comparators: a user comparator (through `invokeUserMethod`) in `Collections.sort`/`List.sort`/`Arrays.sort`/`max`/`min`; `naturalOrder`/`reverseOrder`/`reversed()`/`CASE_INSENSITIVE_ORDER`; `PriorityQueue`/`TreeSet`/`TreeMap` keeping their comparator (and `TreeSet` treating compare == 0 as equal); ClassCastException for objects with no natural order. Plus map copy constructors, the library type hierarchy (`isLibrarySubtype`, boxed and string types) and `qualifiedExceptionName`. |
| JDK differential | `src/engines/java/__tests__/jdk/jdk-differential.test.ts` | Runs every Java corpus case (`jdk/cases/`, plus every shipped example read live from `examples.ts`) through `JavaInterpreter` and compares it with a committed golden recorded from real JDK 21 `java`: stdout, and whether (and which class of) exception escaped; for `compile-errors/` cases, that the interpreter errors before any step runs. Also asserts snapshot invariants on every case, and that a known failure waiting on a rejected construct (#6, #15, #16) fails with an error rather than wrong output. Known failures run as `it.fails` (see "JDK differential suite" below). Needs no JDK. |
| JDK harness | `src/engines/java/__tests__/jdk/jdk-harness.test.ts` | Unit tests for the differential harness itself: golden parsing of `java` output (uncaught exceptions, javac diagnostics, launcher frames), `compareOutput` verdicts, each invariant checker against snapshots that break it (the scope table keys instance initializer blocks by class name and static blocks as `<clinit>`), `mustFailLoudly`, and `known-failures.json` validation. |
| Java behavior comparison | `src/engines/java/__tests__/behavior-comparison.test.ts` | End-to-end snippets with hand-computed expected stdout (matching real javac semantics). For bugs found in real-world Java code, prefer adding the program to the JDK differential corpus so its expectation comes from the JDK. Includes regression coverage for short-circuit `&&` / `||`, inline `new int[]{...}` literals, return-inside-for stack cleanup, StringBuilder chained calls (`sb.append("a").append("b")`), static inner class instance methods, numeric assignment conversion (int→double widening, per the Newton's-method √2013 regression), and the stdlib subset: `Arrays.toString`/`sort`, `String.format`/`printf`, `Math`/`Integer`/`Character` helpers, `System.arraycopy`, constants (`Math.PI`), `ArrayList`+for-each+`Collections.sort`, `HashSet`, `TreeSet`, `HashMap.keySet`/`getOrDefault`, `LinkedHashMap`/`TreeMap` toString, `Stack`, `ArrayDeque`, `entrySet`, and `Scanner` reading from a supplied stdin (via `execJavaWithInput`). |
| Python behavior comparison | `src/engines/py/__tests__/behavior-comparison.test.ts` | Runs each snippet as plain Python via `python` subprocess AND through the tracer script, asserts identical stdout (and, for selected cases, heap-object fidelity — including `__slots__` classes which used to render as empty objects). Auto-skipped when no `python` is on PATH. Add new cases here when fixing tracer bugs found via real-world Python code. Also runs that end early (#7): an uncaught exception keeps its steps and ends where it was raised, with a traceback; no fake `return ↵ None` step for a frame an exception leaves; the step cap stops an endless loop even inside `try/except Exception`; a syntax error returns its line; `raise SystemExit` ends quietly. |
| Export HTML | `src/utils/__tests__/exportHtml.test.ts` | `buildExportHtml` placeholder splicing, `<script>`-safe escaping, multi-example merge round-trip, `slugifyFilename` edge cases, missing-marker error path, schemaVersion stamping, the optional `error` of a run that stopped early, and the engine-bundle false-match regression |
| Export HTML integration | `src/utils/__tests__/exportHtml.integration.test.ts` | Runs `buildExportHtml` against the *real* built `docs/viewer-js.html`. Verifies the engine bundle (`data-tutor-engine`, comment block, `__TUTOR_ENGINE_VERSION__`) survives the splice, output size stays within ±200 KB of the template, and `schemaVersion` is stamped. Auto-skipped when the viewer hasn't been built; CI runs `npm run test:integration` which builds the JS viewer first. |

**Note**: The project uses `@vitejs/plugin-react-swc` (SWC) instead of `@vitejs/plugin-react` (Babel). The Babel plugin had a global init race condition on Windows that caused intermittent "Cannot read properties of undefined (reading 'config')" test failures. SWC is a drop-in replacement that eliminates this issue.

Pipeline tests use `node:vm` (`createContext` + `runInContext`) instead of `eval` because Vitest's ESM transform strips the `eval` identifier. Each pipeline test gets a fresh sandboxed context with needed builtins (Map, Set, Array, Date, etc.) so there's no global state leakage between tests.

Note: In test mode, `VITE_LANGUAGE` is unset so branding defaults to JS. The Python and Java engines are tested directly via their own test files rather than through the registry.

### JDK differential suite (Java)

The Java engine re-implements Java, so it's tested against real `java`. This is the acceptance test for the Java overhaul (roadmap: GitHub issue #3; this suite is #4). Everything lives in `src/engines/java/__tests__/jdk/`:

- **Cases.** `cases/<category>/<name>.java`, with an optional `<name>.stdin` for `Scanner`. Categories: `realistic/` (typical CS1/CS2 programs), `core/`, `collections/`, `oop/`, `misc/`, `extra/` (targeted checks), and `compile-errors/` (programs `javac` rejects). Every example in `examples.ts` is also a case, `examples/<slug>`, read live; its directory holds only goldens. So **adding or editing a Java example means regenerating its golden** (`npm run test:java:golden -- examples/<slug>`), or `npm test` fails. The case id `<category>/<name>` is the key everywhere.
- **Goldens.** `<name>.golden.json` is `{ stdout, stderr, exitCode, exception: { class, message } | null, compileError, sourceSha256 }`. `npm run test:java:golden` ([scripts/java-golden.ts](scripts/java-golden.ts)) writes them. It refuses any JDK but 21 (set `JAVA_BIN` to pick one) and runs each case as `java Main.java` (the single-file source launcher runs the **first** top-level class, so put `main`'s class first) in a temp dir, 8 at a time, with a 30 s timeout. Line endings are normalized and source-launcher stack frames are stripped from stderr. Goldens are committed, so `npm test` needs no JDK. `sourceSha256` hashes the source and stdin: editing a case without regenerating fails the suite's "golden is current" test and skips that case. A full regeneration also deletes orphaned goldens.
- **Output check** (`compareOutput` in [harness.ts](src/engines/java/__tests__/jdk/harness.ts)). It compares the last snapshot's stdout with the golden's (one trailing newline dropped on both sides). It also checks whether an exception escaped, and its simple class name: the interpreter reports `Exception in thread "main" X: msg` for a `throw` and `Line N: X: msg` for built-in errors. A `compile-errors/` case passes only if the interpreter errors with zero snapshots. A failure is either **wrong** (no interpreter error, which is the harmful kind) or **error**.
- **Snapshot invariants**, one test each per case: `refs` (every value is well formed and every ref resolves in the same snapshot; this catches sparse-array holes), `lines` (1..N), `js-errors` (no raw JavaScript error text such as "Cannot read properties" or "Maximum call stack"), and `scopes`. `scopes` checks that block-scope frames of the innermost method only show locals whose lexical scope contains the step's line; ranges come from the CST via `blockScopedDeclarations`, and frames are matched to methods by name (constructors by class name). `reachable` (no unreachable heap objects) is implemented but not in `ENFORCED_INVARIANTS` until #9 removes dead objects. It currently fails in about 90 cases, and `scripts/java-diff.ts` reports the count.
- **Known failures.** `known-failures.json` has two maps. `output` maps case id → `{ issues, reason }`, and `invariants` maps case id → invariant → `{ issues, reason }`. `issues` lists the roadmap issue(s) the failure waits on, main one first. Listed checks run as `it.fails`, so the suite stays green, and a fix that makes one pass turns it red: delete the entry. A check that newly fails needs a fix, or an entry naming the issue that fixes it. `scripts/java-diff.ts` prints every difference with its issue tag, flags entries that are missing or out of date, and exits 1 if any are.
- **Fail loudly (#6's guard).** When a known failure's main issue is in `LOUD_FAILURE_ISSUES` (#6 syntax, #15 inheritance, #16 enums/records/inner and anonymous classes/lambdas), the construct is one JavaTutor rejects. So the case also gets a normal test, "fails with an error, not wrong output", and `java-diff` flags it if it prints wrong output. A program the engine can't run must stop with an `UnsupportedFeatureError`, never print a plausible wrong answer.
- **Summary.** The suite prints pass / wrong output with no error / error counts. Vitest's agent reporter (auto-selected when run by an AI agent) hides console output from passing tests, so pass `--reporter=default` to see it: `npx vitest run src/engines/java/__tests__/jdk --reporter=default`.
- **Workflow for fixing a roadmap issue.** Run `npx tsx scripts/java-diff.ts`, find the cases tagged with the issue, fix them (`scripts/java-viz.ts <case id>` shows every step), run the suite, and delete the entries that now pass. Add a regression case to `cases/` for anything the corpus didn't cover.

Baseline at 90ac603, matching the analysis in #3: 115 of 252 programs pass (all 19 examples, 96 of 233 new programs), 77 print wrong output with no error, 60 fail with an error, and 1 of 8 compile-error cases is rejected before running. After #5 (the reference model): 147 of 255 programs pass (the corpus gained three `core/assign-*` cases), 63 print wrong output with no error, and 45 fail with an error. After #6 (syntax coverage): 194 of 278 programs pass (171 of the 255 above, plus 23 new cases), 42 print wrong output with no error, and 42 fail with an error. No wrong-output case waits on #6, #15 or #16. After #7 (runs that end early): 195 pass (`core/stack-overflow` catches its StackOverflowError), 42 wrong output with no error, 41 error.

## Key Design Notes

- **Single-language builds** — each build bundles only its target engine; tree-shaking removes unused engines
- **JS engine**: Native JS in disposable blob-URL Web Workers — fresh global scope each run
- **Python engine**: Pyodide (CPython compiled to WASM) in a persistent module Web Worker — `sys.settrace()` intercepts execution events to build snapshots; Pyodide is loaded eagerly from CDN at page load
- **Java engine**: AST-walking interpreter using `java-parser` (Chevrotain-based) — parses Java source into a CST, then interprets it directly in a disposable Web Worker; supports primitives, strings, text blocks, arrays of any dimension (`new int[2][3][4]`, `new int[3][]`) including `T[] a = {...}` and `new T[]{...}` initializers, custom object allocation with constructors, readable/writable instance fields, unqualified instance field/method access inside instance contexts, instance methods, arity-based overloads and varargs, nested static classes, interfaces, static methods, primitive and checked reference casts, common numeric wrapper constants, recursion, and standard control flow (see the classes and statements notes below). **Short-circuit `&&` / `||`** are implemented via operand thunks in `evalBinaryExpression` — operands are stored as lazy `() => JavaValue` and only forced when the operator needs them, so `false && side()` correctly skips `side()`.
- **Java names and selector chains** — every primary expression is a *base* followed by *selectors*. The base is a simple name, `this`, an unqualified call or an expression (literal, parenthesized, cast, `new`). The selectors are `.field`, `[index]` and `.method(args)`. `buildPrimaryChain` derives the chain once per CST node (cached in `chainCache`), and `evalChain` walks it left to right. Reads, method calls and writes share this one route, so `head.next.getVal()`, `sb.append("a").append("b")`, `Main.total`, `Counter.created++` and `java.util.Arrays.toString(a)` all resolve the same way. A dotted name `a.b.c(x)` arrives as the name `a.b.c` plus a call suffix, so its last part is the method name. A simple name resolves in Java's order: local or parameter, then a field of `this`, then a static field in scope (`findStatic`: the current class's, a constant of an interface it implements, then the same for each class it is nested in), then a class (user or library, `LIBRARY_CLASSES`). Anything else stays *unresolved*: a package prefix such as `java.util`, or an undefined name, which is reported only if used as a value. Method calls go through `invokeMethod` (on a value; a null receiver throws NPE), `invokeStatic` (on a class; user classes shadow library ones) or `invokeUnqualified` (the enclosing class and the classes it is nested in, then the entry class, then `this`). Arity is matched exactly or through a varargs parameter; there is no fallback to another overload. Constructs the chain can't handle (`super.m()`, `Outer.this`, `.class`, `int.class`, method references, `outer.new Inner()`) throw `UnsupportedFeatureError` rather than being skipped.
- **Java multiple top-level classes**: a single source may declare more than one top-level class (e.g. a `Tester` class alongside the `Logic` class it exercises — the standard CS1/CS2 tester+logic split). `execute()` iterates **all** `typeDeclaration`s (not just the first), registers each into `methodsByClass`, then picks the **entry class** as the first one declaring a static `main`; that class's method table is aliased to `this.methods` so single-class programs behave exactly as before. `ClassName.method()` calls dispatch statics against `methodsByClass.get(ClassName)` (checked before the stdlib fallback, so a user `class Math {}` shadows the built-in). Each call-stack frame (and every `MethodDef`) records its declaring `className`; `currentClassName()` reads the innermost frame so an **unqualified** call resolves against the enclosing class first — this is what lets a helper in a *non-entry* class find its own siblings, and what lets one instance method call a sibling instance method unqualified (dispatched on `this`). `javac` forbids two *public* top-level classes per file, but this educational engine is intentionally lenient.
- **Java standard library (`src/engines/java/stdlib/`)**: a broad emulated subset for CS1/CS2 coursework, implemented as pure functions over a small `StdlibContext` (heap + alloc + `random()` + `stdin`) so it lives outside the interpreter. The interpreter delegates at three points, always **after** checking user-defined classes (a user `class Stack {}` shadows the built-in): `callStaticMethod` in `invokeStatic` (plus `getStaticField` in `staticMember` for constants like `Math.PI` / `Integer.MAX_VALUE`), `newBuiltin` in object creation, and `callInstanceMethod` in `invokeMethod`. Coverage: extended `Math`; wrappers `Integer/Long/Short/Byte/Double/Float/Boolean/Character` (parse/valueOf/radix strings/constants/compare); `Arrays` (toString, sort, fill, copyOf/Range, equals, binarySearch, asList); `Objects`; `System` (`currentTimeMillis`, `nanoTime`, `arraycopy`, `exit` → `HaltSignal`, caught in `execute()`); `String.format` + `System.out.printf` (shared `javaFormat`); `Collections` and `List/Set/Map.of`; the collections `ArrayList/LinkedList/Vector/Stack/ArrayDeque/HashSet/LinkedHashSet/TreeSet/HashMap/LinkedHashMap/TreeMap/PriorityQueue`; `Scanner` (real tokenization over `stdin`, incl. the `nextInt`→`nextLine` gotcha); and `Random` (Java's 48-bit LCG, so seeded sequences match `java.util.Random`). `StringBuilder`/`StringBuffer` remain native in the interpreter (`evalStringBuilderMethod`; `append`/`insert` go through `stringify`, so a user `toString()` is used). **Comparators**: `compareWith(cmp, a, b)` in `util.ts` orders by a user object's `compare()` (through `invokeUserMethod`) or a library comparator, which is a `Comparator` heap object with a hidden `__order__` field (`Collections.reverseOrder()`, `Comparator.naturalOrder()`/`reverseOrder()`, `String.CASE_INSENSITIVE_ORDER`, `reversed()`). `Collections.sort`/`max`/`min`, `List.sort` and `Arrays.sort` take one. A `PriorityQueue`/`TreeSet`/`TreeMap` built with one keeps it in `__cmp__`, and a `TreeSet`/`TreeMap` with a comparator treats elements that compare as 0 as equal. Natural ordering of an object with no `compareTo` throws ClassCastException, as Java does. Map copy constructors (`new HashMap<>(other)`) copy the entries.
- **Java collection representation & rendering**: lists/sets/queues store elements in a `__data__` backing array; maps use parallel `__keys__`/`__values__` arrays (so keys keep their JavaValue type and insertion/sorted order — enabling typed `keySet()`/`entrySet()` and `TreeMap`). `emitSnapshot`'s `serializeObject` renders these inline with `list`/`set`/`map` objectTypes, omits the raw backing arrays, and hides internal `__`-prefixed fields on other library objects; `javaValueToString` (in `types.ts`) formats collections (`[a, b, c]`), maps (`{k=v}`), `Map.Entry` (`k=v`), and `StringBuilder` (its text). `for (x : coll)` works over any collection via `getIterableElements`. **Library objects are tagged, not recognized by name (#8):** everything the stdlib allocates (`ctx.allocObject`), plus `StringBuilder` and `new Object()`, is a `JavaObject` with `builtin: true` (`isBuiltinObject`). Drawing, printing (`stringify`, `javaValueToString`), method dispatch (`invokeMethod` → `callInstanceMethod` / `evalStringBuilderMethod`), for-each, `instanceof` (the library hierarchy) and comparator detection all check that tag. So a student's `LinkedList`, `Stack` or `HashMap` class is an ordinary object showing every declared field (even `__`-prefixed ones), and runs its own methods.
- **Java stdout model**: the interpreter accumulates a single `stdoutBuffer` string (`print`/`println`/`printf` all append; `println` adds `\n`); `snapshotStdout()` splits it into display lines, dropping one trailing newline. This fixes the older array-based model where a `print`/`printf` after a `println` glued onto the previous line.
- **Java assignments go through the reference model (`references.ts`, #5)** — `resolveReference` evaluates everything except the last selector with the normal read path. The last selector (or a bare name) becomes a `Reference` { `get`, `set`, `declaredType` }: a local or static slot (`slotReference`), an instance field (`fieldReference`) or an array element (`arrayElementReference`). `=`, every compound operator and prefix/postfix `++`/`--` all use it, so `a.next.next = v`, `this.data[this.size] = v`, `people[1].age = 31` and `counts[i]++` write exactly the variable named in the source.
  - An undeclared name is an error; there are no implicit locals.
  - Null and bounds checks run when a reference is *accessed*, which gives JLS order. `a[i] = e` evaluates `a`, `i`, then `e`, then checks, so the right-hand side runs before an `ArrayIndexOutOfBoundsException`. Compound assignment reads the variable first (JLS §15.26.2), so it checks before evaluating the right-hand side, and `x += (x = 5)` uses the old `x`.
  - Compound assignment and `++`/`--` narrow the result back to the declared type (`narrowToDeclaredType`), so `salary *= 1.5` stays an int and `c += 2` stays a char.
  - A field access, method call or array access on `null` throws a catchable `NullPointerException` (a `JavaRuntimeError`). Its message names the null expression the way Java's helpful NPE messages do, e.g. `Cannot read field "val" because "n.next" is null`. Array writes are bounds-checked with Java's message.
  - The RHS is evaluated once, which keeps heap allocations connected to the variable or field that receives them.
- **Java numeric assignment conversion** — `assignmentConversion()` (in `references.ts`) performs JLS widening primitive conversion whenever a value is stored in a variable, parameter, field or array element of declared floating-point (or `long`) type. It is applied in `setVariable`/`updateVariable` and by every `Reference` store. Without it, `double x = 1;` kept the int literal's `javaType`, so a later `x / 2` (or `target / x`) ran *integer* division — the cause of the Newton's-method √2013 bug that converged to 44 instead of 44.866. Narrowing (e.g. `double`→`int`) is intentionally not automatic, since Java requires an explicit cast there. `++`/`--` (`stepValue()`) likewise preserve the operand's numeric type so `double d = 1.5; d++` yields 2.5.
- **Java classes, statics and initialization (#6)** — registration builds a `ClassInfo` per class or interface. Each holds `outer` (the enclosing class of a nested one), `isInner` (non-static nested), `superclass` (only a library exception class; extending anything else throws `UnsupportedFeatureError` until #15), `interfaces`, and two initializer lists in textual order: `staticInit` (static field initializers and `static {}` blocks) and `instanceInit` (instance field initializers and `{}` blocks).
  - **Statics are per class** (`staticFields: Map<class, Map<name, StaticSlot>>`), so same-named statics in two classes don't collide. Interface fields are static constants of the interface.
  - **Class initialization is lazy** (JLS §12.4): `initClass` runs a class's `staticInit` once, at its first `new`, static method call or static field access, in a `<clinit>` frame. The entry class is initialized before `main`. A class being initialized isn't re-entered, so a static read during its own initialization sees the default value. An exception from a static initializer becomes `ExceptionInInitializerError`, and later uses throw `NoClassDefFoundError`.
  - **Constants don't trigger initialization:** a `final` primitive or String static with a literal-only initializer (`isLiteralConstant`) is a *constant*, set by `initConstants()` before the program starts, and reading it doesn't initialize its class (javac inlines it). `staticReference` initializes on access, so `C.x = f()` runs `f()` before initializing `C`, as the bytecode does.
  - **Objects:** `new` initializes the class before evaluating arguments, allocates the object with default field values, then runs `construct`. A class with no constructor gets the default one, which only runs `instanceInit`. A constructor either delegates with `this(…)` (another frame, which runs the initializers) or runs `superConstructor` (for a library exception: message and cause from `super(msg)`, `super(msg, cause)` or `super(cause)`) and then `runInstanceInitializers`, before its body. Initializers run in the constructor's frame with a scope holding only `this`, so they can't see its parameters or the caller's locals. There is no fallback when no constructor matches the argument count.
  - **`instanceof`, casts and `catch`** use `isSubclass`: a user class, its interfaces (transitively) and its library exception superclass, then the library's own hierarchy (`stdlib/hierarchy.ts`: collections, exceptions, `String`/`CharSequence`, boxed primitives as `Integer`/`Number`, arrays as `Object`/`Cloneable`). A reference cast to a type JavaTutor knows is checked (`ClassCastException`); a cast to a type variable isn't, as in Java. Exceptions print with Java's names: `Main$MyException` for a nested user class, `java.lang.IllegalStateException` for a library one (`binaryName`).
  - **Varargs:** a varargs parameter receives the trailing arguments as a new array, unless one array is passed. `main`'s `String[] args` is bound to an empty array only when main's body mentions it, so other programs' steps are unchanged.
- **Java statements and unsupported constructs (#6)** — every statement and expression node either runs or throws. Nothing falls through to `null` or is silently skipped.
  - **Labels:** labeled statements pass their labels to loops (`targets()` matches `break label`/`continue label`), and `executeLabeled` catches a `break` naming it.
  - **Switch:** `evalSwitch` handles statements and expressions: arrow rules (no fall-through; expression, block or throw), colon groups (fall-through until `break`, or `yield` in an expression), several labels per case, `default` anywhere (it applies only if no label matches), `case null`, and type patterns with `when` guards. A null selector without `case null` throws NPE. The switch block is one scope (labelled "switch").
  - **try:** `runTryCatchFinally` is shared by plain try and try-with-resources, which opens resources in order in a scope visible only to the try block, closes the opened ones in reverse, and suppresses a close exception when another is propagating. `System.exit` (`HaltSignal`) skips catch and finally, as in Java, and so does an engine error such as an `UnsupportedFeatureError` or the step limit. Only Java exceptions (`exceptionClassOf`, which doesn't allocate) are catchable.
  - **Patterns:** an `if` whose condition has an `instanceof` pattern evaluates it in a scope of its own (labelled "if"), so the variable is visible in the branches and gone after. It is copied to the enclosing scope for `if (!(o instanceof T t)) return;`, JLS flow scoping, approximated by `canCompleteNormally`. Elsewhere a pattern binds in the current scope.
  - **Other statements:** `synchronized` runs its block after a null check. `assert` takes a step but isn't evaluated, since `java` runs without `-ea`. `yield` is a `YieldSignal`.
  - **Unsupported constructs** throw `UnsupportedFeatureError(construct, line)` with messages like `Line 5: Lambda expressions aren't supported in JavaTutor yet`: lambdas, method references, class literals, anonymous classes, enums and records (nested, top-level or local), interface default methods, inheritance, local classes, annotation types, inner classes that use their enclosing object's members, `outer.new`, `Outer.this`, `super.x`, library classes the stdlib lacks (`new Thread()`), hex float literals, for-each over a user `Iterable`. Declarations are rejected at registration, before any step. Expressions are rejected when evaluated, so earlier steps remain. java-parser reads a nested `record P(int x) {}` as a method returning type `record`, and `registerMethod` rejects that.
- **Java failures (#7)** — `execute()` returns `ExecuteResult`: `snapshots`, a one-line `error` summary (what tests and the harness read), and `failure` (the `RunError` the worker sends).
  - **Frame lines.** Every `Frame` records its `kind` (method, constructor, `<clinit>`) and the `line` it is executing. `executeStatement` and local declarations set it, loops set it at each iteration, and calls set the caller's line to the call site.
  - **`atFailureSite(e)`.** Every catch point calls it (`callMethod`, `callConstructor`, the default constructor, `initClass`, try/catch/finally, try-with-resources, `execute`). The first time a failure passes, while its frames are still on the stack, it records the line and a Java stack trace (`Main$Point.<init>(Main.java:6)`, at most 64 frames) in `failureSites`. For a runtime exception (`/ by zero`, a null field, a library error) it also records a step at the throwing line, so a caught one shows the throwing method's frame before the catch. A `throw` statement has already recorded its own step. Engine errors get no extra step, because the program never really got there, and compile-error cases stay stepless.
  - **Uncaught exceptions** are summarized as `Exception in thread "main" java.lang.ArithmeticException: / by zero` (user classes by binary name, `Main$Oops`, using their own `toString()` if they have one), with the trace in `failure.stderr`.
  - **Stack overflow.** A JavaScript stack overflow becomes a catchable `java.lang.StackOverflowError`. `isStackOverflow` avoids regular expressions, since compiling one at the stack limit can itself overflow, and `exceptionClassOf` reads `JavaRuntimeError.className` directly.
  - **Standard-library errors.** A `StdlibError` from a library call is re-thrown with the call's line (`stdlib(line, call)`).
  - **Internal errors.** Any other JavaScript error becomes "Internal JavaTutor error (please report it)" for students. The summary keeps the JavaScript text, so the `js-errors` invariant still flags engine bugs.
  - **Limits** (`RunLimits`, lowerable in tests via `new JavaInterpreter(stdin, limits)` or `runJava(source, stdin, limits)`): 5000 steps (`maxSteps`), 1,000,000 units of work, counting steps recorded or not (`maxWork`, which also stops an endless loop inside `toString()`, replacing the old per-loop iteration cap), and 8.5 seconds (`timeBudgetMs`). Each throws `ExecutionLimit`. It isn't a Java exception, so no catch or finally runs.
  - **Parse errors.** `describeParseError` turns java-parser's "Sad sad panda…" into `Syntax error: expected ';' but found 'System'`, with a missing `;` put on the line it belongs at the end of, as javac does.
- **Java subset limits** — this is not a full JVM. Generic *type parameters* parse but are not enforced (erased). It does not currently support inheritance beyond extending a library exception (#15), enums, records, inner classes that use their enclosing object, lambdas/streams and anonymous classes (#16), interface default methods, access control, overloaded constructor/method resolution by argument type (#13), file/network I/O, threads, or reflection. These are rejected with `UnsupportedFeatureError`, not guessed at. Multiple top-level classes in one source **are** supported (see the multiple-top-level-classes note above), as are interfaces with constants and static methods. The standard library is an emulated subset (see the stdlib note above), not the real JDK — only the listed classes/methods exist; anything else throws `Unknown method`.
- **TDZ-aware instrumentation** — `let`/`const` tracked incrementally; `var`/`function` hoisted
- **Block scopes** — Loops with `let`/`const` use `isBlockScope` flag, rendered nested inside parent frame
- **Per-iteration bindings preserved** — `for (let i...)` keeps its init and update in the for-statement slots (not extracted into the parent block) so closures created inside the body capture distinct per-iteration values, matching ECMA-262 semantics
- **Throw cleanup** — every function body is wrapped in a synthetic `try { ... } catch (e) { __popThrowingFrame__(); throw e; }` so a throw propagating out of the function still pops the call-stack frame (otherwise frames leak across visualizations)
- **Derived class constructors** — instrumenter detects `extends` and skips reading `this` in the constructor's `__pushFrame__` call, avoiding a ReferenceError before `super()` returns
- **Getter/setter-safe serialization** — `__serializeHeapObject__` uses `Object.getOwnPropertyDescriptor` to detect accessor properties and renders them as `<getter>` / `<setter>` placeholders rather than invoking them (a getter that reads `this` would re-enter the runtime and recurse without bound)
- **Condition tracking** — `__condition__()` wraps if/else-if tests, emits snapshots with `condition` field
- **Pre-call capture** — Statements containing function calls get a snapshot *before* the call executes, so the line indicator pauses on the call site before stepping into the function body
- **Value change animation** — `diffSnapshots.ts` compares consecutive snapshots, applies `value-changed` CSS class
- **Snapshot limit**: 5000 per execution. At the cap every engine stops the program and returns its steps with a `limit` error: the JS runtime throws `__STOP__` from `__capture__`, the Python tracer raises `_TutorStop` (a `BaseException`, so `except Exception` can't swallow it), and the Java interpreter throws `ExecutionLimit`. Java and Python also stop themselves after 8.5 seconds, so partial steps survive the worker's 10-second kill. That kill (the only case that loses the steps) remains for code that never yields to the engine, such as a Python `while True: pass`, which emits no trace events.
- **Runs that end early (#7)**:
  - **JS:** the worker's reply comes from the runtime's `__runResult__(err?)`: an uncaught throw is an `exception` (`TypeError: …`, stderr `Uncaught …`), and the loop guard or step cap is a `limit`. `throw` statements already have a pre-capture, so the last step is the throw.
  - **Python:** `run_traced` returns the steps plus an `exception` error with a Python-style traceback of the user's frames (`File "main.py", line N, in f`). A syntax error comes back as `{ type: 'error', line }`. A frame that an exception leaves gets no fake `return ↵ None` step (frames are marked on the `exception` event, unmarked on the next `line`), so the last step is where the exception was raised.
  - **Java:** see the Java failures note below.
- **Security**: shared links show warning interstitial, `eval` blocked, static analysis flags suspicious APIs
- **`HeapObjectType`** is an open string union — engines can emit custom types (e.g. Python's `dict`, `tuple`)
- **Target engine eagerly loaded** at startup in `main.tsx` via `getEngine(branding.languageId)`
- **Python engine** uses `sys.settrace()` in Pyodide; baseline namespace keys are snapshotted before execution to filter builtins from variable display. **Object serialization is user-code-safe** — `_serialize_heap_object` iterates `obj.__dict__` directly (never via attribute access) so `@property` descriptors and `__getattr__` hooks aren't triggered during snapshot building. **`__slots__` classes are also rendered correctly** — slots are read via `getattr` (slot descriptors don't invoke user code) and wrapped in try/except so a slot raising on read doesn't corrupt the whole snapshot
- **Python reference mode** — `showReferences` store flag + `promoteToHeap()` utility converts inline primitives to heap objects, modeling Python's "everything is an object" semantics with value deduplication (reflects interning)
- `acorn-walk` is an unused legacy dependency — can be removed

## Deployment

Each language target builds to its own output directory and deploys to its own domain:

| Language | Build command | Output dir | Domain |
|----------|--------------|------------|--------|
| JavaScript | `npm run build:js` | `docs/` (`index.html` + `viewer-js.html`) | jstutor.org |
| Python | `npm run build:py` | `docs/` (`index.html` + `viewer-py.html`) | pytutor.org |
| Java | `npm run build:java` | `docs/` (`index.html` + `viewer-java.html`) | javatutor.org |

Each `build:<lang>` command emits both the main site and a sibling `viewer-<lang>.html` — the prebuilt single-file template that the Export feature fetches at runtime via `./viewer-<lang>.html`. The viewer build uses `emptyOutDir: false` so it appends to the main site's `docs/` rather than wiping it; the main build runs first.

GitHub Pages serves `docs/` for the JS site. Non-JS output directories (`docs-*/`) are gitignored and deployed separately.
