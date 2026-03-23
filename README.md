# JSTutor

A free, browser-based code execution visualizer. Write a snippet of code, step through it line by line, and watch the call stack, heap, and console update in real time.

**Live sites:** [jstutor.org](https://jstutor.org) (JavaScript) · [pytutor.org](https://pytutor.org) (Python)

---

## What It Does

JSTutor instruments your code, runs it inside a sandboxed Web Worker, and captures a snapshot of program state at every step. You can then step forward and backward through execution to see exactly what the runtime is doing at each moment.

At each step the visualizer shows:

- **Call Stack** — active function frames and block scopes with live variable values, closures, and `this` context
- **Heap** — objects, arrays, functions, classes, Maps, Sets, and more displayed as cards with pointer arrows linking references (filterable by all frames / current frame, with an option to hide function objects)
- **Console** — output from `console.log` / `print()`
- **Condition badges** — `true`/`false` pills annotated directly in the editor for `if`/`else if` and loop conditions
- **Value change detection** — variables that changed between steps flash yellow so you can spot what just updated
- **Sub-line highlighting** — for-loop init, condition, and update clauses are individually highlighted as they execute
- **Share & embed** — compress your code into a URL to share, or generate an embeddable `<iframe>` snippet (view options like "hide functions" are preserved in the link)

Everything runs in your browser. No server, no account, no data collection.

---

## Multi-Language Support

The app is built around a **pluggable engine system**. Each language implements a `LanguageEngine` interface; the UI is entirely language-agnostic. Build targets produce standalone single-language sites, each deployable to its own domain.

| Target | Dev server | Production build | Output | Domain |
|--------|-----------|-----------------|--------|--------|
| JavaScript | `npm run dev:js` | `npm run build:js` | `docs/` | jstutor.org |
| Python | `npm run dev:py` | `npm run build:py` | `docs-py/` | pytutor.org |

Build targets use Vite's `--mode` flag, which loads per-language env files (`.env.js`, `.env.py`) containing branding variables (app name, color, domain, tagline). Each build bundles only its target engine — tree-shaking removes everything else.

The **JavaScript engine** uses Acorn AST transformation to inject tracing hooks, then runs the instrumented code in disposable blob-URL Web Workers. The **Python engine** uses [Pyodide](https://pyodide.org) (CPython compiled to WebAssembly) with `sys.settrace()` to intercept execution events, running in a persistent module Web Worker. Pyodide (~12 MB) is loaded eagerly from CDN at page load so it's ready by the time the user clicks "Visualize".

---

## Architecture

```
User Code (CodeMirror editor)
        │
        ▼
LanguageEngine.execute(source)   (src/engines/<lang>/)
  [language-specific pipeline]
        │
        ▼
ExecutionSnapshot[]
        │
        ▼
Zustand store  (src/store/useStore.ts)
  language, snapshots[], currentStep, code, isRunning, error
        │
        ▼
React UI  (src/components/)
  EditorPanel  ·  FramesView  ·  HeapView  ·  PointerArrows  ·  ConsolePanel
```

The **JavaScript engine** uses Acorn for AST instrumentation, a runtime preamble for state capture, and disposable blob-URL Web Workers for sandboxed execution. The **Python engine** uses Pyodide (CPython/WASM) with `sys.settrace()` in a persistent module Web Worker for step-by-step tracing.

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/<your-org>/jstutor.git
cd jstutor
npm install
npm run dev          # JS dev server at http://localhost:3000
npm run dev:py       # Python dev server
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | JS dev server (alias for `dev:js`) |
| `npm run dev:js` | JS dev server with HMR |
| `npm run dev:py` | Python dev server with HMR |
| `npm run build` | JS type-check + build to `docs/` |
| `npm run build:js` | Same as `build` |
| `npm run build:py` | Python build to `docs-py/` |
| `npm run build:all` | Build all language targets |
| `npm run test` | Run tests (Vitest, 263 tests) |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

---

## Project Structure

```
src/
├── config/
│   └── branding.ts             # Build-time branding (reads VITE_* env vars)
├── engines/                    # Pluggable language engine system
│   ├── registry.ts             # getEngine(), getEngineSync(), SUPPORTED_LANGUAGES
│   ├── js/                     # JavaScript engine
│   │   ├── index.ts            # LanguageEngine implementation
│   │   ├── instrumenter.ts     # Acorn AST transform — injects runtime hooks
│   │   ├── runtime.ts          # Worker preamble: __capture__, serialization, heap registry
│   │   ├── executor.ts         # instrument → worker → snapshots (no store coupling)
│   │   ├── examples.ts         # Built-in JS example snippets
│   │   └── security.ts         # Suspicious code pattern detection
│   └── py/                     # Python engine (Pyodide + sys.settrace)
│       ├── index.ts            # LanguageEngine implementation
│       ├── tracer.ts           # Python tracing script (sys.settrace) as a string
│       ├── worker.ts           # Persistent Pyodide Web Worker (module worker)
│       ├── executor.ts         # Pyodide worker lifecycle management
│       ├── examples.ts         # Python example snippets
│       └── security.ts         # Suspicious code pattern detection
├── engine/
│   └── executor.ts             # Thin dispatcher: store → engine → store
├── components/
│   ├── AppNavbar.tsx           # Navbar (Sandbox / Examples / About) — branding-driven
│   ├── ControlBar.tsx          # Visualize / step controls / share / embed
│   ├── EditorPanel.tsx         # CodeMirror editor with line/sub-line highlight + condition badges
│   ├── VisualizationPanel.tsx
│   ├── FramesView.tsx          # Recursive call stack + block scopes, closures, this context
│   ├── HeapView.tsx            # Heap object cards with frame filter + hide functions toggle
│   ├── PointerArrows.tsx       # SVG overlay drawing reference arrows
│   └── ConsolePanel.tsx        # Captured console output
├── pages/
│   ├── AboutPage.tsx           # About / usage guide (branding-driven)
│   ├── ExamplePage.tsx         # Loads a built-in example by slug
│   ├── ShareWarningPage.tsx    # Security interstitial for shared-code links
│   └── EmbedPage.tsx           # Iframe-friendly embed mode
├── store/
│   └── useStore.ts             # Zustand store (language, code, snapshots, step, view options)
├── types/
│   ├── snapshot.ts             # ExecutionSnapshot, StackFrame, HeapObject, etc.
│   └── engine.ts               # LanguageEngine interface, LanguageId, CodeExample
├── utils/
│   ├── share.ts                # LZ-string URL compression
│   └── diffSnapshots.ts        # Detects changed values between steps (yellow flash)
├── App.tsx                     # Main layout (resizable split, keyboard shortcuts)
├── main.tsx                    # React entry point + HashRouter routes
├── env.d.ts                    # TypeScript declarations for VITE_* env vars
└── index.css                   # Custom styles (layout, animations, condition badges, scope sections)

# Root config files
.env.js                         # JS build branding (VITE_APP_NAME=JSTutor, etc.)
.env.py                         # Python build branding (VITE_APP_NAME=PyTutor, etc.)
vite.config.ts                  # Build config — mode-based outDir + language targeting
```

---

## Key Design Decisions

**Single-language builds** — each `npm run build:<lang>` produces a standalone site bundling only that language's engine. Vite's `--mode` flag loads the matching `.env.<mode>` file, and `import.meta.env.VITE_LANGUAGE` is statically replaced at build time so tree-shaking eliminates the unused engines entirely.

**Branding via env vars** — app name, colors, domain, and tagline are defined in `.env.js` / `.env.py` and flow through `src/config/branding.ts` to all components. No hardcoded "JSTutor" strings exist in the UI code.

**JS engine: Native JS in disposable Web Workers** — code runs as real JavaScript in blob-URL workers, so the full Web API surface is available. A fresh worker is created for each run; no shared state can leak between executions.

**Python engine: Pyodide + sys.settrace** — CPython compiled to WebAssembly runs in a persistent module Web Worker. Python's built-in `sys.settrace()` intercepts call/line/return events to build snapshots without needing an AST transformer. Pyodide is loaded eagerly from CDN at page load to minimize wait time on first run.

**TDZ-aware instrumentation** — `let`/`const` declarations are tracked incrementally so the visualizer never reads variables before they are initialized.

**Block scopes rendered inline** — `for`, `while`, and `do...while` loop bodies with `let`/`const` appear as nested sections inside their parent frame card rather than as separate call-stack entries.

**Closure & `this` tracking** — when a nested function executes, variables closed over from enclosing scopes are displayed in a dedicated "Closure" section. Method calls show the `this` receiver object.

**Sub-line for-loop highlighting** — for-loop init, condition, and update expressions carry column ranges through the snapshot pipeline, enabling precise sub-expression highlighting in the editor instead of whole-line highlighting.

**URL-based sharing** — the Share button LZ-string-compresses the code into the URL. Shared links open a security interstitial with a read-only code preview and a static analysis scan before execution. View options (like "hide functions") are encoded as query parameters.

---

## Built With

- [React](https://react.dev) 19 + [TypeScript](https://www.typescriptlang.org) 5.9
- [Vite](https://vite.dev) 7 — build tooling, dev server, HMR, multi-mode builds
- [React Bootstrap](https://react-bootstrap.github.io) / [Bootstrap](https://getbootstrap.com) 5
- [CodeMirror 6](https://codemirror.net) — code editor (with `@codemirror/lang-javascript` and `@codemirror/lang-python`)
- [Acorn](https://github.com/acornjs/acorn) — JavaScript parser (AST instrumentation)
- [Astring](https://github.com/davidbonnet/astring) — JavaScript code generator
- [Pyodide](https://pyodide.org) — CPython compiled to WebAssembly (Python engine, loaded from CDN)
- [Zustand](https://zustand.docs.pmnd.rs) — state management
- [React Router](https://reactrouter.com) 7 — client-side routing (HashRouter)
- [lz-string](https://github.com/pieroxy/lz-string) — URL-compressed share links

---

## Deployment

Each language target builds to its own output directory and deploys to its own domain via GitHub Pages:

```bash
npm run build:js     # outputs to docs/  → jstutor.org
npm run build:py     # outputs to docs-py/ → pytutor.org
npm run build:all    # build everything
```

GitHub Pages serves `docs/` at [jstutor.org](https://jstutor.org) (configured via `docs/CNAME`). Non-JS output directories (`docs-*/`) are gitignored and deployed separately to their respective domains. HashRouter is used so all routes resolve correctly without server rewrites.

---

## License

MIT — Copyright 2026 [Cole Nelson](https://coletnelson.us), University of Wisconsin–Madison ([cs.wisc.edu](https://cs.wisc.edu)).
