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
npm run lint              # ESLint
```

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
    interpreter.ts         # AST-walking interpreter using java-parser CST (~2000 lines)
    parser.ts              # Wrapper around java-parser: parseJava(), CST navigation helpers
    types.ts               # Java runtime type system (primitives, strings, arrays, objects, refs)
    executor.ts            # Ephemeral Web Worker executor (same pattern as JS engine); passes stdin through
    worker.ts              # Web Worker: parses + interprets Java source, returns snapshots
    examples.ts            # 18 Java examples with language:'java' field, including visualization-friendly data structures
    security.ts            # analyzeCode() — suspicious pattern detection for Java
    stdlib/                # Standard-library subset (pure fns over a small StdlibContext)
      context.ts           #   StdlibContext interface + HaltSignal (System.exit) + StdlibError
      format.ts            #   javaFormat() — String.format / printf conversions
      statics.ts           #   callStaticMethod/getStaticField: Math, wrappers, Character, Arrays, Objects, System, String, Collections, List/Set/Map.of
      collections.ts       #   newBuiltin/callInstanceMethod/getIterableElements: List/Set/Map/Deque/Stack/Queue, Scanner, Random, Iterator, Map.Entry
      util.ts              #   compareJava, javaEquals, backing-array helpers, class-name sets
      index.ts             #   barrel exports
```

The **dispatcher** at `src/engine/executor.ts` is a thin layer that reads `language` from the store, calls `getEngine(language)`, delegates to `engine.execute()`, and updates the store. All UI components import `runCode` from here.

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

Zustand store with: `language`, `code`, `stdin`, `snapshots`, `currentStep`, `isRunning`, `error`, `hideFunctions`, `showReferences`. The `language` field defaults to `branding.languageId` and drives which engine is used and which editor extension / examples / sandbox code are shown. The `showReferences` flag enables Python's "everything is an object" visualization mode, where primitives are promoted to heap objects via `src/utils/promoteToHeap.ts`. The `stdin` field holds the preset console input consumed by Java's `Scanner` — it is edited via the `StdinPanel` (shown in the editor column for Java builds), passed to `engine.execute(source, { stdin })` by the dispatcher, and threaded into the interpreter constructor.

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
- **Data schema versioning**: `CURRENT_EXAMPLE_SCHEMA_VERSION` in [src/types/viewer.ts](src/types/viewer.ts) is the contract version of the `ViewerExample` shape (currently `2` — `2` added the optional `stdin` field so exported Java `Scanner` programs re-run with their original input; `ExportModal` reads `stdin` from the store and `viewer-main.tsx` restores it). `buildExportHtml` stamps it into every payload; `viewer-main.tsx` compares each example's `schemaVersion` against the constant and passes a `schemaMismatch` flag down to `ViewerApp`, which renders a dismissible warning alert when an example was produced by a newer engine than what's running. Bump the constant when adding required fields to `ViewerExample` or to `ExecutionSnapshot` so previously-exported files can't masquerade as the new shape.
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
| Pipeline | `src/engine/__tests__/pipeline.test.ts` | Full instrument -> runtime -> eval -> snapshots pipeline using `node:vm` sandboxed contexts |
| Behavior comparison | `src/engine/__tests__/behavior-comparison.test.ts` | Runs each snippet as plain JS AND through the full instrumented pipeline, then asserts identical `console.log` output (and, for control-flow cases, a clean final call stack). Add new cases here when fixing engine bugs found via real-world code — it catches semantic regressions across instrumenter + runtime in one place. |
| diffSnapshots | `src/utils/__tests__/diffSnapshots.test.ts` | `getChangedKeys()`: variable changes, heap property changes, closure vars, this context |
| Share | `src/utils/__tests__/share.test.ts` | `encodeShareCode`/`decodeShareCode` round-trips + `analyzeCode` suspicious pattern detection |
| Store | `src/store/__tests__/useStore.test.ts` | Zustand actions: step navigation, clamping, reset, error handling |
| Registry | `src/engines/__tests__/registry.test.ts` | Engine loading, contract validation, branding-store integration |
| Branding | `src/config/__tests__/branding.test.ts` | Branding field shape, types, defaults, hex color validation |
| Python Engine | `src/engines/py/__tests__/engine.test.ts` | Engine contract, heapTypeConfig shape, example validation, analyzeCode integration |
| Python Tracer | `src/engines/py/__tests__/tracer.test.ts` | Tracer script structure: settrace events, serialization, limits, security sandbox, baseline filtering |
| Python Security | `src/engines/py/__tests__/security.test.ts` | All suspicious patterns, false positive avoidance, edge cases |
| Java Interpreter | `src/engines/java/__tests__/interpreter.test.ts` | Variables, arithmetic, control flow, methods, arrays, strings, snapshots, block scopes |
| Java stdlib | `src/engines/java/__tests__/stdlib.test.ts` | Unit tests for `src/engines/java/stdlib` driven through a lightweight Map-backed `StdlibContext` (no full interpreter): `javaFormat` specifiers, `callStaticMethod`/`getStaticField` (Math/wrappers/Character/Arrays/Objects/Collections), collection instance methods (list/set/map/stack/deque), `Scanner` tokenization, and `Random` determinism/bounds. |
| Java behavior comparison | `src/engines/java/__tests__/behavior-comparison.test.ts` | End-to-end snippets with hand-computed expected stdout (matching real javac semantics). Includes regression coverage for short-circuit `&&` / `||`, inline `new int[]{...}` literals, return-inside-for stack cleanup, StringBuilder chained calls (`sb.append("a").append("b")`), static inner class instance methods, numeric assignment conversion (int→double widening, per the Newton's-method √2013 regression), and the stdlib subset: `Arrays.toString`/`sort`, `String.format`/`printf`, `Math`/`Integer`/`Character` helpers, `System.arraycopy`, constants (`Math.PI`), `ArrayList`+for-each+`Collections.sort`, `HashSet`, `TreeSet`, `HashMap.keySet`/`getOrDefault`, `LinkedHashMap`/`TreeMap` toString, `Stack`, `ArrayDeque`, `entrySet`, and `Scanner` reading from a supplied stdin (via `execJavaWithInput`). Add new cases here when fixing engine bugs found via real-world Java code. |
| Python behavior comparison | `src/engines/py/__tests__/behavior-comparison.test.ts` | Runs each snippet as plain Python via `python` subprocess AND through the tracer script, asserts identical stdout (and, for selected cases, heap-object fidelity — including `__slots__` classes which used to render as empty objects). Auto-skipped when no `python` is on PATH. Add new cases here when fixing tracer bugs found via real-world Python code. |
| Export HTML | `src/utils/__tests__/exportHtml.test.ts` | `buildExportHtml` placeholder splicing, `<script>`-safe escaping, multi-example merge round-trip, `slugifyFilename` edge cases, missing-marker error path, schemaVersion stamping, and the engine-bundle false-match regression |
| Export HTML integration | `src/utils/__tests__/exportHtml.integration.test.ts` | Runs `buildExportHtml` against the *real* built `docs/viewer-js.html`. Verifies the engine bundle (`data-tutor-engine`, comment block, `__TUTOR_ENGINE_VERSION__`) survives the splice, output size stays within ±200 KB of the template, and `schemaVersion` is stamped. Auto-skipped when the viewer hasn't been built; CI runs `npm run test:integration` which builds the JS viewer first. |

**Note**: The project uses `@vitejs/plugin-react-swc` (SWC) instead of `@vitejs/plugin-react` (Babel). The Babel plugin had a global init race condition on Windows that caused intermittent "Cannot read properties of undefined (reading 'config')" test failures. SWC is a drop-in replacement that eliminates this issue.

Pipeline tests use `node:vm` (`createContext` + `runInContext`) instead of `eval` because Vitest's ESM transform strips the `eval` identifier. Each pipeline test gets a fresh sandboxed context with needed builtins (Map, Set, Array, Date, etc.) so there's no global state leakage between tests.

Note: In test mode, `VITE_LANGUAGE` is unset so branding defaults to JS. The Python and Java engines are tested directly via their own test files rather than through the registry.

## Key Design Notes

- **Single-language builds** — each build bundles only its target engine; tree-shaking removes unused engines
- **JS engine**: Native JS in disposable blob-URL Web Workers — fresh global scope each run
- **Python engine**: Pyodide (CPython compiled to WASM) in a persistent module Web Worker — `sys.settrace()` intercepts execution events to build snapshots; Pyodide is loaded eagerly from CDN at page load
- **Java engine**: AST-walking interpreter using `java-parser` (Chevrotain-based) — parses Java source into a CST, then interprets it directly in a disposable Web Worker; supports primitives, strings, arrays including `T[] a = {...}` and `new T[]{...}` initializers, custom object allocation with constructors, readable/writable instance fields, unqualified instance field/method access inside instance contexts, instance methods, simple arity-based overloads, nested static class methods, static methods, primitive casts, common numeric wrapper constants, recursion, and standard control flow. **Short-circuit `&&` / `||`** are implemented via operand thunks in `evalBinaryExpression` — operands are stored as lazy `() => JavaValue` and only forced when the operator needs them, so `false && side()` correctly skips `side()`. **Chained method calls** like `sb.append("a").append("b")` are detected in `evalPrimary` by pairing an identifier-only suffix with the following methodInvocationSuffix — otherwise the identifier would be looked up as a field on the receiver and throw.
- **Java multiple top-level classes**: a single source may declare more than one top-level class (e.g. a `Tester` class alongside the `Logic` class it exercises — the standard CS1/CS2 tester+logic split). `execute()` iterates **all** `typeDeclaration`s (not just the first), registers each into `methodsByClass`, then picks the **entry class** as the first one declaring a static `main`; that class's method table is aliased to `this.methods` so single-class programs behave exactly as before. `ClassName.method()` calls dispatch statics against `methodsByClass.get(ClassName)` (checked before the stdlib fallback, so a user `class Math {}` shadows the built-in). Each call-stack frame (and every `MethodDef`) records its declaring `className`; `currentClassName()` reads the innermost frame so an **unqualified** call resolves against the enclosing class first — this is what lets a helper in a *non-entry* class find its own siblings, and what lets one instance method call a sibling instance method unqualified (dispatched on `this`). `javac` forbids two *public* top-level classes per file, but this educational engine is intentionally lenient.
- **Java standard library (`src/engines/java/stdlib/`)**: a broad emulated subset for CS1/CS2 coursework, implemented as pure functions over a small `StdlibContext` (heap + alloc + `random()` + `stdin`) so it lives outside the interpreter. The interpreter delegates at three points, always **after** checking user-defined classes (a user `class Stack {}` shadows the built-in): `callStaticMethod` (general fallback before the "Unknown method" throw, plus `getStaticField` in `evalFqnOrRefType` for constants like `Math.PI` / `Integer.MAX_VALUE`), `newBuiltin` in object creation, and `callInstanceMethod` in the two instance-dispatch sites. Coverage: extended `Math`; wrappers `Integer/Long/Short/Byte/Double/Float/Boolean/Character` (parse/valueOf/radix strings/constants/compare); `Arrays` (toString, sort, fill, copyOf/Range, equals, binarySearch, asList); `Objects`; `System` (`currentTimeMillis`, `nanoTime`, `arraycopy`, `exit` → `HaltSignal`, caught in `execute()`); `String.format` + `System.out.printf` (shared `javaFormat`); `Collections` and `List/Set/Map.of`; the collections `ArrayList/LinkedList/Vector/Stack/ArrayDeque/HashSet/LinkedHashSet/TreeSet/HashMap/LinkedHashMap/TreeMap/PriorityQueue`; `Scanner` (real tokenization over `stdin`, incl. the `nextInt`→`nextLine` gotcha); and `Random` (Java's 48-bit LCG, so seeded sequences match `java.util.Random`). `StringBuilder`/`StringBuffer` remain native in the interpreter (`evalStringBuilderMethod`).
- **Java collection representation & rendering**: lists/sets/queues store elements in a `__data__` backing array; maps use parallel `__keys__`/`__values__` arrays (so keys keep their JavaValue type and insertion/sorted order — enabling typed `keySet()`/`entrySet()` and `TreeMap`). `emitSnapshot`'s `serializeObject` renders these inline with `list`/`set`/`map` objectTypes, omits the raw backing arrays, and hides internal `__`-prefixed fields on generic objects; `javaValueToString` (in `types.ts`) formats collections (`[a, b, c]`), maps (`{k=v}`), `Map.Entry` (`k=v`), and `StringBuilder` (its text). `for (x : coll)` works over any collection via `getIterableElements`.
- **Java stdout model**: the interpreter accumulates a single `stdoutBuffer` string (`print`/`println`/`printf` all append; `println` adds `\n`); `snapshotStdout()` splits it into display lines, dropping one trailing newline. This fixes the older array-based model where a `print`/`printf` after a `println` glued onto the previous line.
- **Java assignment evaluation** — assignment expressions evaluate their RHS once; this keeps heap allocations connected to the variable or field that receives them and avoids unreferenced duplicate arrays/objects in snapshots.
- **Java numeric assignment conversion** — `coerceToType()` (applied in `setVariable`/`updateVariable`) performs JLS widening primitive conversion when a value is bound to a variable or parameter of declared floating-point (or `long`) type. Without it, `double x = 1;` kept the int literal's `javaType`, so a later `x / 2` (or `target / x`) ran *integer* division — the cause of the Newton's-method √2013 bug that converged to 44 instead of 44.866. Narrowing (e.g. `double`→`int`) is intentionally not automatic, since Java requires an explicit cast there. `++`/`--` (`stepValue()`) likewise preserve the operand's numeric type so `double d = 1.5; d++` yields 2.5.
- **Java subset limits** — this is not a full JVM. Generic *type parameters* parse but are not enforced (erased). It does not currently support inheritance, interfaces, access control, overloaded constructor/method resolution beyond simple arity matching, packages, file/network I/O, threads, reflection, lambdas/streams, or user-implemented `Comparable`/comparators (collection ordering is natural-order only for primitives/strings). Multiple top-level classes in one source **are** supported (see the multiple-top-level-classes note above), but static fields are not namespaced per class — they share one global scope, so same-named statics across classes collide. The standard library is an emulated subset (see the stdlib note above), not the real JDK — only the listed classes/methods exist; anything else throws `Unknown method`.
- **TDZ-aware instrumentation** — `let`/`const` tracked incrementally; `var`/`function` hoisted
- **Block scopes** — Loops with `let`/`const` use `isBlockScope` flag, rendered nested inside parent frame
- **Per-iteration bindings preserved** — `for (let i...)` keeps its init and update in the for-statement slots (not extracted into the parent block) so closures created inside the body capture distinct per-iteration values, matching ECMA-262 semantics
- **Throw cleanup** — every function body is wrapped in a synthetic `try { ... } catch (e) { __popThrowingFrame__(); throw e; }` so a throw propagating out of the function still pops the call-stack frame (otherwise frames leak across visualizations)
- **Derived class constructors** — instrumenter detects `extends` and skips reading `this` in the constructor's `__pushFrame__` call, avoiding a ReferenceError before `super()` returns
- **Getter/setter-safe serialization** — `__serializeHeapObject__` uses `Object.getOwnPropertyDescriptor` to detect accessor properties and renders them as `<getter>` / `<setter>` placeholders rather than invoking them (a getter that reads `this` would re-enter the runtime and recurse without bound)
- **Condition tracking** — `__condition__()` wraps if/else-if tests, emits snapshots with `condition` field
- **Pre-call capture** — Statements containing function calls get a snapshot *before* the call executes, so the line indicator pauses on the call site before stepping into the function body
- **Value change animation** — `diffSnapshots.ts` compares consecutive snapshots, applies `value-changed` CSS class
- **Snapshot limit**: 5000 per execution, worker killed after 10 seconds
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
