# CLAUDE.md — Project Instructions for Tutor

## Documentation Policy

When making codebase changes (new engines, scripts, store fields, utilities, architecture, dependencies, etc.), update **README.md** and **CLAUDE.md** in the same commit to keep documentation current. Do not let docs fall out of date.

## What This Is

A **client-side-only** React app that visualizes code execution step-by-step. Students write code in a CodeMirror editor and see call stack, variables, heap objects, and console output at every line. No backend — everything runs in the browser.

The architecture supports **multi-language builds**: each language has a `LanguageEngine` under `src/engines/`, and the Vite build system produces a standalone single-language site per target. Each target deploys to its own domain (e.g. jstutor.org, pytutor.org).

## Commands

```bash
npm run dev          # JS dev server (localhost:3000), alias for dev:js
npm run dev:js       # JS dev server
npm run dev:py       # Python dev server
npm run dev:java     # Java dev server
npm run build        # JS production build (tsc + vite, outputs to docs/)
npm run build:js     # Same as above
npm run build:py     # Python production build
npm run build:java   # Java production build
npm run build:all    # Build all language targets (js, py, java)
npm run test         # vitest run
npm run test:watch   # vitest in watch mode
npm run lint         # ESLint
```

Build targets use Vite's `--mode` flag, which loads the corresponding `.env.<mode>` file (`.env.js`, `.env.py`). The env file sets `VITE_LANGUAGE`, `VITE_APP_NAME`, branding colors, domain, etc.

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
- **`vite.config.ts`** — function form; `mode` determines `outDir`

All hardcoded branding references and `#DD030B` colors have been replaced with `branding.*` imports. To add a new language target, create a new `.env.<lang>` file and add corresponding `dev:<lang>` / `build:<lang>` scripts.

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
    interpreter.ts         # AST-walking interpreter using java-parser CST (~1960 lines)
    parser.ts              # Wrapper around java-parser: parseJava(), CST navigation helpers
    types.ts               # Java runtime type system (primitives, strings, arrays, objects, refs)
    executor.ts            # Ephemeral Web Worker executor (same pattern as JS engine)
    worker.ts              # Web Worker: parses + interprets Java source, returns snapshots
    examples.ts            # 11 Java examples with language:'java' field
    security.ts            # analyzeCode() — suspicious pattern detection for Java
```

The **dispatcher** at `src/engine/executor.ts` is a thin layer that reads `language` from the store, calls `getEngine(language)`, delegates to `engine.execute()`, and updates the store. All UI components import `runCode` from here.

### Adding a New Language

1. Create `src/engines/<lang>/` with an `index.ts` exporting a `LanguageEngine` object
2. Add a conditional registration block in `src/engines/registry.ts`
3. Expand `LanguageId` type in `src/types/engine.ts`
4. Create `.env.<lang>` with branding vars (`VITE_LANGUAGE`, `VITE_APP_NAME`, `VITE_BRAND_COLOR`, etc.)
5. Add `dev:<lang>` and `build:<lang>` scripts to `package.json`

### Branding (`src/config/branding.ts`)

All UI branding (app name, colors, tagline, domain) flows from `import.meta.env.VITE_*` variables through a single `branding` object. Components import `branding` instead of using hardcoded strings. The env vars are set per build target via `.env.js` / `.env.py` / `.env.java` files loaded by Vite's `--mode` flag.

### Store (`src/store/useStore.ts`)

Zustand store with: `language`, `code`, `snapshots`, `currentStep`, `isRunning`, `error`, `hideFunctions`, `showReferences`. The `language` field defaults to `branding.languageId` and drives which engine is used and which editor extension / examples / sandbox code are shown. The `showReferences` flag enables Python's "everything is an object" visualization mode, where primitives are promoted to heap objects via `src/utils/promoteToHeap.ts`.

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
| diffSnapshots | `src/utils/__tests__/diffSnapshots.test.ts` | `getChangedKeys()`: variable changes, heap property changes, closure vars, this context |
| Share | `src/utils/__tests__/share.test.ts` | `encodeShareCode`/`decodeShareCode` round-trips + `analyzeCode` suspicious pattern detection |
| Store | `src/store/__tests__/useStore.test.ts` | Zustand actions: step navigation, clamping, reset, error handling |
| Registry | `src/engines/__tests__/registry.test.ts` | Engine loading, contract validation, branding-store integration |
| Branding | `src/config/__tests__/branding.test.ts` | Branding field shape, types, defaults, hex color validation |
| Python Engine | `src/engines/py/__tests__/engine.test.ts` | Engine contract, heapTypeConfig shape, example validation, analyzeCode integration |
| Python Tracer | `src/engines/py/__tests__/tracer.test.ts` | Tracer script structure: settrace events, serialization, limits, security sandbox, baseline filtering |
| Python Security | `src/engines/py/__tests__/security.test.ts` | All suspicious patterns, false positive avoidance, edge cases |
| Java Interpreter | `src/engines/java/__tests__/interpreter.test.ts` | Variables, arithmetic, control flow, methods, arrays, strings, snapshots, block scopes |

**Note**: The project uses `@vitejs/plugin-react-swc` (SWC) instead of `@vitejs/plugin-react` (Babel). The Babel plugin had a global init race condition on Windows that caused intermittent "Cannot read properties of undefined (reading 'config')" test failures. SWC is a drop-in replacement that eliminates this issue.

Pipeline tests use `node:vm` (`createContext` + `runInContext`) instead of `eval` because Vitest's ESM transform strips the `eval` identifier. Each pipeline test gets a fresh sandboxed context with needed builtins (Map, Set, Array, Date, etc.) so there's no global state leakage between tests.

Note: In test mode, `VITE_LANGUAGE` is unset so branding defaults to JS. The Python and Java engines are tested directly via their own test files rather than through the registry.

## Key Design Notes

- **Single-language builds** — each build bundles only its target engine; tree-shaking removes unused engines
- **JS engine**: Native JS in disposable blob-URL Web Workers — fresh global scope each run
- **Python engine**: Pyodide (CPython compiled to WASM) in a persistent module Web Worker — `sys.settrace()` intercepts execution events to build snapshots; Pyodide is loaded eagerly from CDN at page load
- **Java engine**: AST-walking interpreter using `java-parser` (Chevrotain-based) — parses Java source into a CST, then interprets it directly in a disposable Web Worker; supports primitives, strings, arrays, objects, static methods, recursion, and standard control flow
- **TDZ-aware instrumentation** — `let`/`const` tracked incrementally; `var`/`function` hoisted
- **Block scopes** — Loops with `let`/`const` use `isBlockScope` flag, rendered nested inside parent frame
- **Condition tracking** — `__condition__()` wraps if/else-if tests, emits snapshots with `condition` field
- **Pre-call capture** — Statements containing function calls get a snapshot *before* the call executes, so the line indicator pauses on the call site before stepping into the function body
- **Value change animation** — `diffSnapshots.ts` compares consecutive snapshots, applies `value-changed` CSS class
- **Snapshot limit**: 5000 per execution, worker killed after 10 seconds
- **Security**: shared links show warning interstitial, `eval` blocked, static analysis flags suspicious APIs
- **`HeapObjectType`** is an open string union — engines can emit custom types (e.g. Python's `dict`, `tuple`)
- **Target engine eagerly loaded** at startup in `main.tsx` via `getEngine(branding.languageId)`
- **Python engine** uses `sys.settrace()` in Pyodide; baseline namespace keys are snapshotted before execution to filter builtins from variable display
- **Python reference mode** — `showReferences` store flag + `promoteToHeap()` utility converts inline primitives to heap objects, modeling Python's "everything is an object" semantics with value deduplication (reflects interning)
- `acorn-walk` is an unused legacy dependency — can be removed

## Deployment

Each language target builds to its own output directory and deploys to its own domain:

| Language | Build command | Output dir | Domain |
|----------|--------------|------------|--------|
| JavaScript | `npm run build:js` | `docs/` | jstutor.org |
| Python | `npm run build:py` | `docs/` | pytutor.org |
| Java | `npm run build:java` | `docs/` | javatutor.org |

GitHub Pages serves `docs/` for the JS site. Non-JS output directories (`docs-*/`) are gitignored and deployed separately.
