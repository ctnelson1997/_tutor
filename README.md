# Tutor

A free, browser-based code execution visualizer for multiple programming languages. Write a snippet of code, step through it line by line, and watch the call stack, heap, and console update in real time.

Each language gets its own standalone site and domain:

- [jstutor.org](https://jstutor.org) — JavaScript
- [pytutor.org](https://pytutor.org) — Python
- [javatutor.org](https://javatutor.org) — Java

---

## What It Does

Tutor instruments your code, runs it inside a sandboxed Web Worker, and captures a snapshot of program state at every step. You can then step forward and backward through execution to see exactly what the runtime is doing at each moment.

At each step the visualizer shows:

- **Call Stack** — active function frames and block scopes with live variable values, closures, and `this` context
- **Heap** — objects, arrays, functions, classes, Maps, Sets, and more displayed as cards with pointer arrows linking references (filterable by all frames / current frame, with an option to hide function objects)
- **Console** — output from `console.log` / `print()`
- **Condition badges** — `true`/`false` pills annotated directly in the editor for `if`/`else if` and loop conditions
- **Value change detection** — variables that changed between steps flash yellow so you can spot what just updated
- **Sub-line highlighting** — for-loop init, condition, and update clauses are individually highlighted as they execute
- **Steps as on pythontutor.com** — each step shows the state before its line runs (▶ "About to execute", ✓ the line that just ran), entering a function shows its parameters, returning shows the value, and the last step is the final state, in every language
- **Share & embed** — compress your code into a URL to share, or generate an embeddable `<iframe>` snippet (view options like "hide functions" are preserved in the link)
- **Export to standalone HTML** — bake the current code + pre-computed snapshots into a single self-contained HTML file you can drop onto your own website. Recipients can step through, edit, and re-run the visualization without any backend

Everything runs in your browser. No server, no account, no data collection.

---

## Multi-Language Support

The app is built around a **pluggable engine system**. Each language implements a `LanguageEngine` interface; the UI is entirely language-agnostic. Build targets produce standalone single-language sites, each deployable to its own domain.

| Target | Dev server | Production build | Output | Domain |
|--------|-----------|-----------------|--------|--------|
| JavaScript | `npm run dev:js` | `npm run build:js` | `docs/` | jstutor.org |
| Python | `npm run dev:py` | `npm run build:py` | `docs/` | pytutor.org |
| Java | `npm run dev:java` | `npm run build:java` | `docs/` | javatutor.org |

Build targets use Vite's `--mode` flag, which loads per-language env files (`.env.js`, `.env.py`, `.env.java`) containing branding variables (app name, color, domain, tagline). Each build bundles only its target engine — tree-shaking removes everything else.

Each `build:<lang>` command also emits a **standalone viewer template** at `docs/viewer-<lang>.html` (mode `viewer-<lang>`, single-file via [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)). This is the prebuilt artifact that the in-app Export feature splices examples into.

The **JavaScript engine** uses Acorn AST transformation to inject tracing hooks, then runs the instrumented code in disposable blob-URL Web Workers. The **Python engine** uses [Pyodide](https://pyodide.org) (CPython compiled to WebAssembly) with `sys.settrace()` to intercept execution events, running in a persistent module Web Worker. Pyodide (~12 MB) is loaded eagerly from CDN at page load so it's ready by the time the user clicks "Visualize". The **Java engine** uses [java-parser](https://github.com/nicolo-ribaudo/java-parser) (Chevrotain-based) to parse Java source into a CST, then interprets it directly in a disposable Web Worker — supporting primitives, strings, text blocks, arrays of any dimension including `T[] a = {...}` and `new T[]{...}` initializers, custom object allocation with constructors (and `this(...)` chaining), field and instance/static initializers run in Java's order, readable/writable instance fields, instance methods, simple arity-based overloads, varargs, nested static classes, interfaces (constants, static methods, `instanceof`), static methods, checked casts, recursion, and standard control flow including labeled `break`/`continue`, every `switch` form (arrow rules, switch expressions with `yield`, patterns and `case null`), `instanceof` patterns, and try-with-resources. Numbers follow Java's rules: `int` arithmetic wraps at 32 bits, `long` is exact to 64 bits (so `20!` and `fib(50)` are right), `float` has single precision and prints as Java prints it, `char` arithmetic promotes to `int`, casts truncate and wrap as in Java, and integer division by zero throws `ArithmeticException` while `5.0 / 0` is `Infinity`. Hex, octal, binary and `L`/`f` literals, and `<<`, `>>`, `>>>`, work too. Output matches Java's too: `println` of a double gives `Double.toString`'s `1.0E7` or `0.30000000000000004`, `String.format`/`printf` round as Java's Formatter does (`%.1f` of 0.15 is `0.2`) and throw its exceptions for a bad argument, `%s` uses your `toString()`, and an array prints as `[I@…`, except a `char[]`, which prints its characters. System.err and printStackTrace() write to stderr, which the console shows in red among the program's other output, in order. Strings behave as in Java too: `==` compares identity, so `scanner.next() == "yes"` is false while `"h" + "i" == "hi"` is true, `split`, `matches` and `replaceAll` take Java regexes (translated, with the few constructs JavaScript can't match rejected by name), `compareTo` returns Java's difference, `charAt` past the end throws `StringIndexOutOfBoundsException`, StringBuilder has its editing methods, and an `Integer` or `Double` has `compareTo`, `equals`, `intValue()` and the rest. Constructs it can't run yet, such as record patterns or extending a collection class, stop the program with a message naming the construct and line rather than running it wrongly. It also accepts **multiple top-level classes in one source** (the class declaring `main` is the entry point, and `ClassName.method(...)` calls a static method on another class) — so the tester + logic split common in CS coursework works without splitting files.

The Java engine also ships an **emulated standard-library subset** (`src/engines/java/stdlib/`) covering what intro/intermediate courses use: an extended `Math`; the primitive wrappers and `Character`; `Arrays`, `Objects`, `System` (incl. `currentTimeMillis`/`arraycopy`); `String.format`/`printf`; the collections `ArrayList`, `LinkedList`, `Stack`, `ArrayDeque`, `HashSet`/`LinkedHashSet`/`TreeSet`, `HashMap`/`LinkedHashMap`/`TreeMap`, plus `Collections` and `List/Set/Map.of` — all usable with `for-each`, and sortable with a `Comparator` class of your own, a lambda, `Comparator.comparing(…)` or `Collections.reverseOrder()`; their functional methods (`forEach`, `removeIf`, `computeIfAbsent`, `merge`, …); lazy **streams** (`filter`, `map`, `sorted`, `collect(Collectors.toList())`, `groupingBy`, `joining`, `IntStream.range`, …) and `Optional`. They behave as java.util does: a `HashMap` or `HashSet` prints and iterates in Java's hash order, a `PriorityQueue` as its heap, `keySet()`/`values()`/`entrySet()`/`subList()` are live views, `List.of` and `Arrays.asList` refuse the changes Java refuses, and changing a collection inside its for-each loop throws `ConcurrentModificationException`; and `java.util.Random` (Java's exact seeded sequence). **`Scanner`** works too: since a browser has no console, the editor shows an **Input (stdin)** box whose contents feed `new Scanner(System.in)` with real Java tokenization (`nextInt`/`next`/`nextLine`/`hasNext…`). User-defined classes always take precedence over same-named built-ins, and are drawn as ordinary objects with their own fields (a student's `LinkedList` class shows its `head` and `tail`).

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

The **JavaScript engine** uses Acorn for AST instrumentation, a runtime preamble for state capture, and disposable blob-URL Web Workers for sandboxed execution. The **Python engine** uses Pyodide (CPython/WASM) with `sys.settrace()` in a persistent module Web Worker for step-by-step tracing. The **Java engine** parses with java-parser (Chevrotain), builds an AST, resolves names and types with its own binder, and runs the result in an evaluator with an explicit call stack, in disposable Web Workers.

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
git clone https://github.com/ctnelson1997/_tutor.git
cd _tutor
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
| `npm run dev:java` | Java dev server with HMR |
| `npm run build` | JS type-check + build to `docs/` |
| `npm run build:js` | Same as `build` |
| `npm run build:py` | Python build to `docs/` |
| `npm run build:java` | Java build to `docs/` |
| `npm run build:viewer:js` | Build only the JS standalone viewer template (`docs/viewer-js.html`) |
| `npm run build:viewer:py` | Build only the Python viewer template |
| `npm run build:viewer:java` | Build only the Java viewer template |
| `npm run build:viewer:all` | Build all three viewer templates |
| `npm run build:all` | Build all language targets |
| `npm run test` | Run tests (Vitest) |
| `npm run test:integration` | Build viewer-js then run integration tests against the real built `docs/viewer-js.html` |
| `npm run test:java:golden` | Regenerate the Java engine's JDK goldens (needs JDK 21, see below) |
| `npm run test:js:golden` | Regenerate the JS engine's Node goldens (needs Node 24, see below) |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

### Testing the Java engine against real Java

The Java engine re-implements Java, so its main test compares it with the real thing. [`src/engines/java/__tests__/jdk/`](src/engines/java/__tests__/jdk/) holds a corpus of Java programs: typical CS1/CS2 programs, targeted checks, programs `javac` rejects, and every shipped example. Each program has a committed golden file that records what JDK 21's `java` printed. `npm test` runs each program through the interpreter and compares its stdout and any uncaught exception with the golden; for a program `javac` rejects, it checks that nothing runs and that the console lists javac's errors exactly as the golden recorded them. It also checks the snapshots: heap references are valid, line numbers are in the file, no JavaScript error text reaches the user, no stale block variables are shown, only objects the program can still reach are drawn, and the main class's static fields show at every step. No JDK is needed for any of this.

Checks that fail today are listed in `known-failures.json`, each with the roadmap issue ([#3](https://github.com/ctnelson1997/_tutor/issues/3)) that should fix it. They run as expected failures, so the suite stays green. When a fix makes one pass, the suite turns red, and you delete the entry. A known failure that waits on a construct JavaTutor rejects must still stop with an error; printing wrong output instead fails the suite. The test run ends with a summary: how many programs pass, how many print wrong output with no error, and how many fail with an error.

| Task | How |
|---|---|
| Add a program | Put `<name>.java` (and optionally `<name>.stdin`) in `cases/<category>/`, then run `npm run test:java:golden -- <category>/<name>` and commit both |
| Regenerate every golden | `npm run test:java:golden` (JDK 21's `java` on `PATH`, or set `JAVA_BIN`) |
| Check goldens are current, writing nothing | `npm run test:java:golden -- --check` |
| See every difference from real Java, case by case | `npx tsx scripts/java-diff.ts [filter]` |
| Regenerate the JDK's method names per library class (after adding a class to the stubs; needs JDK 21) | `npx tsx scripts/java-jdk-members.ts` |
| Print each step's frames and heap | `npx tsx scripts/java-viz.ts <case id \| file.java \| example:slug> [--final]` |
| Measure snapshot size and time | `npx tsx scripts/java-payload.ts [--quick]` |

### Testing the JS engine against Node

The JS engine runs your code for real, but it instruments it first, and the instrumentation can change what you see. [`src/engines/js/__tests__/node/`](src/engines/js/__tests__/node/) holds a corpus of JavaScript programs: typical intro-course programs, targeted checks (console output, async code, generators, errors, limits, …), programs that don't parse, and every shipped example. Each program has a committed golden file that records what Node 24 did when it ran the program as a browser runs a worker's script, timers included: what its console printed (line by line, stdout and stderr), every uncaught exception and unhandled rejection, which lines ran (V8's block coverage), and the final value of each top-level name. `npm test` runs each program through JSTutor exactly as the app does, in a worker (a Node thread standing in for the Web Worker), and checks:
- the console at the last step against Node's, text for text (JSTutor prints in Node's format, [#43](https://github.com/ctnelson1997/_tutor/issues/43));
- that the run ends as Node's did: normally, with the same uncaught exception, at the step cap for an endless loop, or with V8's syntax error;
- that every line that ran got a step, and that the last step shows the right final values;
- the snapshots: references resolve, lines are in the file, no instrumentation names leak, only reachable objects are drawn, and no frame is left at the end.

As for Java, checks that fail today are listed in `known-failures.json` with the roadmap issue ([#41](https://github.com/ctnelson1997/_tutor/issues/41)) that should fix them. They run as expected failures, and a fix that makes one pass turns the suite red until you delete the entry. The run ends with a summary in #41's terms: matches, layout-only differences, wrong output, wrong steps or state, failures, and parse errors.

| Task | How |
|---|---|
| Add a program | Put `<name>.js` in `cases/<category>/`, then run `npm run test:js:golden -- <category>/<name>` and commit both |
| Regenerate every golden | `npm run test:js:golden` (with Node 24; other versions are refused) |
| Check goldens are current, writing nothing | `npm run test:js:golden -- --check` |
| See every difference from Node, case by case | `npx tsx scripts/js-diff.ts [filter] [--issue=<n>]` |
| Print each step's frames and heap, and what Node printed | `npx tsx scripts/js-viz.ts <case id \| file.js \| example:slug> [--final] [--steps=a-b]` |
| Measure the reply's size and time | `npx tsx scripts/js-payload.ts [--quick]` |

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
│   │   ├── security.ts         # Suspicious code pattern detection
│   │   └── __tests__/node/     # Differential corpus: JS programs + Node 24 goldens, known-failures.json
│   ├── py/                     # Python engine (Pyodide + sys.settrace)
│   │   ├── index.ts            # LanguageEngine implementation
│   │   ├── tracer.ts           # Python tracing script (sys.settrace) as a string
│   │   ├── worker.ts           # Persistent Pyodide Web Worker (module worker)
│   │   ├── executor.ts         # Pyodide worker lifecycle management
│   │   ├── examples.ts         # Python example snippets
│   │   └── security.ts         # Suspicious code pattern detection
│   └── java/                   # Java engine (parser → AST → binder → evaluator)
│       ├── index.ts            # LanguageEngine implementation
│       ├── interpreter.ts      # JavaInterpreter: runs the three stages; a program javac would reject stops before any step
│       ├── ast/                # The Java AST: node types, CST → AST conversion, printer (#12)
│       ├── semantic/           # The binder: library stubs, static types, name resolution, overloads (#13), javac's flow checks (#23)
│       ├── eval/               # The evaluator: frames on an explicit stack, pythontutor.com-style steps, heap drawing (#14)
│       ├── references.ts       # Reference model: assignable variables (locals, fields, statics, array elements)
│       ├── numeric.ts          # Java arithmetic: promotion, conversions, operators, exact long, float, Float.toString
│       ├── literals.ts         # Literal values: numbers (hex/octal/binary, L/f suffixes), strings, chars, text blocks
│       ├── errors.ts           # InterpreterError, JavaRuntimeError (NullPointerException, …), UnsupportedFeatureError
│       ├── parser.ts           # java-parser wrapper: parseJava(), CST navigation helpers
│       ├── compileErrors.ts    # Compile errors as javac reports them: syntax errors in javac's words, javac's listing
│       ├── types.ts            # Java runtime type system (primitives, strings, arrays, objects)
│       ├── executor.ts         # Ephemeral Web Worker executor (passes stdin through)
│       ├── worker.ts           # Web Worker: posts runJava()'s reply
│       ├── run.ts              # runJava(): parse + interpret, building the worker's reply (steps, and why a run stopped early)
│       ├── examples.ts         # Java example snippets, including visualization-friendly OOP data structures
│       ├── security.ts         # Suspicious code pattern detection
│       ├── stdlib/             # Emulated standard library (Math, wrappers, Arrays, collections, Scanner, Random, functions, streams, …)
│       └── __tests__/jdk/      # Differential corpus: Java programs + JDK 21 goldens, known-failures.json
├── engine/
│   └── executor.ts             # Thin dispatcher: store → engine → store
├── components/
│   ├── AppNavbar.tsx           # Navbar (Sandbox / Examples / About) — Examples uses cascading category submenus
│   ├── ControlBar.tsx          # Visualize / step controls / share / embed / export
│   ├── EditorPanel.tsx         # CodeMirror editor with line/sub-line highlight + condition badges
│   ├── VisualizationPanel.tsx
│   ├── FramesView.tsx          # Recursive call stack + block scopes, closures, this context
│   ├── HeapView.tsx            # Heap object cards with frame filter + hide functions toggle
│   ├── PointerArrows.tsx       # SVG overlay drawing reference arrows
│   ├── ConsolePanel.tsx        # Captured console output
│   ├── ExportModal.tsx         # "Export as standalone HTML" modal triggered from ControlBar
│   ├── ViewerApp.tsx           # Wrapper used by viewer.html — minimal navbar + <App embed viewer />
│   └── ExamplePicker.tsx       # Dropdown shown in the viewer when __EXAMPLES__ has 2+ entries
├── pages/
│   ├── AboutPage.tsx           # About / usage guide (branding-driven)
│   ├── ExamplePage.tsx         # Loads a built-in example by slug
│   ├── ShareWarningPage.tsx    # Security interstitial for shared-code links
│   └── EmbedPage.tsx           # Iframe-friendly embed mode
├── store/
│   └── useStore.ts             # Zustand store (language, code, snapshots, step, view options)
├── types/
│   ├── snapshot.ts             # ExecutionSnapshot, StackFrame, HeapObject, etc.
│   ├── engine.ts               # LanguageEngine interface, LanguageId, CodeExample
│   └── viewer.ts               # ViewerExample shape + window.__EXAMPLES__ declaration
├── utils/
│   ├── share.ts                # LZ-string URL compression
│   ├── diffSnapshots.ts        # Detects changed values between steps (yellow flash)
│   ├── promoteToHeap.ts        # Promotes inline primitives to heap objects (Python reference mode)
│   ├── exportHtml.ts           # Splices examples into the viewer template + downloads (Export feature)
│   └── runError.ts             # Labels for how a run ended early (error banner, step bar)
├── App.tsx                     # Main layout (resizable split, keyboard shortcuts)
├── main.tsx                    # React entry point + HashRouter routes
├── viewer-main.tsx             # Entry point for viewer-<lang>.html builds (reads window.__EXAMPLES__)
├── env.d.ts                    # TypeScript declarations for VITE_* env vars
└── index.css                   # Custom styles (layout, animations, condition badges, scope sections)

# Root config files
.env.js                         # JS build branding (VITE_APP_NAME=JSTutor, etc.)
.env.py                         # Python build branding (VITE_APP_NAME=PyTutor, etc.)
.env.java                       # Java build branding (VITE_APP_NAME=JavaTutor, etc.)
viewer.html                     # HTML entry for the viewer-<lang> build (contains the __EXAMPLES__ placeholder)
vite.config.ts                  # Build config — mode-based outDir + language targeting + singlefile viewer mode
scripts/                        # Dev tools, run with tsx: java-golden.ts (JDK goldens), java-diff.ts, java-viz.ts, java-payload.ts, js-golden.ts (Node goldens), js-diff.ts, js-viz.ts, js-payload.ts
```

---

## Key Design Decisions

**Single-language builds** — each `npm run build:<lang>` produces a standalone site bundling only that language's engine. Vite's `--mode` flag loads the matching `.env.<mode>` file, and `import.meta.env.VITE_LANGUAGE` is statically replaced at build time so tree-shaking eliminates the unused engines entirely.

**Branding via env vars** — app name, colors, domain, and tagline are defined in `.env.js` / `.env.py` / `.env.java` and flow through `src/config/branding.ts` to all components. No hardcoded "JSTutor" strings exist in the UI code.

**JS engine: Native JS in disposable Web Workers** — code runs as real JavaScript in blob-URL workers, so the full Web API surface is available. A fresh worker is created for each run; no shared state can leak between executions. Its steps follow pythontutor.com, as the Python and Java engines' do: a capture before each statement, a step at each condition with the variables it sees, a step entering each function call and one returning (with the value, or `undefined` at the closing brace), and the final state last. A frame is on the stack only while its code runs: a loop's goes at `break` or `continue`, and a generator's or async function's leaves at each `yield` or `await` and comes back when it resumes. Asynchronous code runs before the visualization ends: promise callbacks, `await` continuations and timers take steps in the order Node runs them, each callback's first step labeled (`setTimeout callback`, `promise callback`, `resumed after await`) with its frame alone under Global. Timers run by virtual time, so a 2-second `setTimeout` takes no time, and a rejected promise nothing handles ends the run as Node ends it. The console prints what `node` prints (`[ 1, 2, 3 ]`, `Map(1) { 1 => 'a' }`, `[ 1, <1 empty item>, 3 ]`, `Point { x: 1 }`, `[Function: greet]`), with printf-style `%s`/`%d`/`%o` and every console method (`table`, `group`, `count`, `assert`, `dir`, `time`); `console.error` and `console.warn` go to stderr, shown in red in program order. Printing never calls the program's getters or `toJSON`. Every place code can run is visualized: labeled loops, class fields holding arrow functions, `static {}` blocks, and callbacks wherever they are written (`new Promise(…)`, `a.map(f).filter(g)`, `!function () {…}()`); syntax the engine doesn't know yet stops the program with a message naming it, rather than running unseen. Each step shares what didn't change with the steps before it, so even 5,000 steps of an insertion sort take under 2 MB to send from the worker. Values are drawn as what they are: `NaN`, `Infinity` and `-0` as themselves, an array's holes as `empty`, Symbol keys as `[Symbol(id)]`, and an object used as a Map key as an arrow to that object. The program can't tell it is being traced: `fn.toString()` returns the function as written, and a stack trace names its own functions and lines (`at divide (main.js:2)`). Chrome's DevTools would show the same values in their own style.

**Python engine: Pyodide + sys.settrace** — CPython compiled to WebAssembly runs in a persistent module Web Worker. Python's built-in `sys.settrace()` intercepts call/line/return events to build snapshots without needing an AST transformer. Pyodide is loaded eagerly from CDN at page load to minimize wait time on first run.

**Java engine: parser, binder, evaluator** — Java source is parsed with java-parser (Chevrotain-based) and converted to an AST. A binder then does what javac's front end does: it resolves every name, gives every expression its type, picks overloads and constructors by argument type, infers generic type arguments, and makes conversions (widening, boxing, unboxing, casts) explicit. A program javac would reject doesn't run: the console lists its errors exactly as javac does (`Main.java:5: error: cannot find symbol`, the line, a caret, `symbol:   variable z`), all of them, in javac's order, and the editor marks each line. Besides type errors, that includes javac's flow checks (unreachable code, a missing return, a variable that might not have been initialized, a `final` assigned twice, an unreported checked exception), a misspelled library method (`s.lenght()`), and syntax errors in javac's words (`';' expected`, `reached end of file while parsing`, `unclosed string literal`). The evaluator runs the bound program with Java frames on its own stack, so deep recursion doesn't depend on JavaScript's stack and becomes a catchable `StackOverflowError` past its limit. Steps follow pythontutor.com: each step shows the state before its line runs, and entering and returning from a method (with the returned value) are steps of their own. Supports Java primitives, strings, arrays of any dimension, classes with fields, constructors and initializers, inheritance (abstract classes, `super`, overriding, hidden fields), interfaces with default methods, Object's methods (`equals`, `hashCode`, `toString`, `getClass()`, array `clone()`), nested static classes, inner, local and anonymous classes, enums, records, lambdas and method references (drawn as function objects with what they captured, their calls in frames named as javac names them), the collections' functional methods, comparators built with `Comparator.comparing`, lazy streams with the common collectors, `Optional`, overloads, varargs, generics, boxing (with the `Integer` cache), casts, recursion, and Java's statements. javac's class-model errors (a missing implementation of an abstract method, cyclic inheritance, an incompatible override) stop the program before it runs. A single source may declare **multiple top-level classes** — the class defining `main` is the entry point, and `ClassName.method(...)` dispatches a static call to another class (the tester + logic split common in coursework). Dotted names and assignment targets (`a.b.c = v`, `arr[i].f++`, `Main.count += 1`) all resolve through one reference model, with Java's evaluation order, `NullPointerException` on null receivers, array bounds checks, and compound assignment narrowing back to the variable's type. Each class has its own static fields, and a class is initialized lazily at its first use, as in Java. Runs in disposable Web Workers like the JS engine.

The Java engine is a teaching-oriented subset, not a full JVM. It does not currently support record patterns, extending a library class other than an exception, access control, file/network I/O, threads, or reflection. These stop the program with an "isn't supported in JavaTutor yet" message that names the line. (Multiple top-level classes, interfaces, and `try`/`catch` exceptions *are* supported.) Its standard library is an emulated subset (the classes listed above), not the real JDK — a method the real class has but the subset lacks raises an `Unknown method` error when called.

**A run that ends early keeps its steps** — in all three engines, an uncaught exception, the 5,000-step cap or the time budget ends the run but keeps every step recorded so far. The error shows at the last step: a banner with the line (marked in the editor), and what the program printed to stderr (a Java stack trace, a Python traceback) in the console. Java also records a step where a runtime exception such as `/ by zero` starts, so a caught one shows the method that threw it. A Java recursion more than 1,200 calls deep becomes a catchable `StackOverflowError`, and an internal engine failure is reported without JavaScript text. Only a program that doesn't compile, or code that runs 10 seconds without yielding, produces no steps.

**Steps share what didn't change** — consecutive snapshots reuse every frame, variable, heap object and output line that is unchanged (`src/utils/snapshotSharing.ts`), so a run costs what changes at each step rather than the whole heap again. The Java engine shares as it records, so its worker sends far less (an insertion sort of 300 ints: 75 MB before, 2.3 MB now); the store shares the steps of every engine, which cuts what JS and Python runs keep in memory.

**What a Java step shows** — the frames and heap show the program's real state:
- **Static fields** appear in a "Static fields" frame before `main`'s, as `Main.moves`. A class's static fields appear when the class is initialized, at its first use, as in Java.
- **Only objects the program can still reach** are drawn: from a variable, `this` or a static field. An array replaced by `Arrays.copyOf`, or the copy a `for (k : map.keySet())` loop walks, disappears the way garbage would.
- **A local declared without a value** (`int count;`) isn't shown until it is assigned. Reading it before every path assigns it is javac's "might not have been initialized", reported before the program runs.
- **Blocks are labeled by construct** (`for`, `if`, `try`, `catch`, `finally`), and `this` is shown apart from the variables.
- **Values show as Java writes them**: a `char` as `'B'` (not like the String `"B"`), a whole-number `double` as `5.0` (and a large one as `1.0E7`, as `println` prints it), a `float` with the digits Java prints, a `long` exactly, and a String with its escapes (`"a\nb"`).
- **Library objects show their state**: a `Scanner` the input it has left (line breaks as `
`, so the `nextInt`/`nextLine` gotcha is visible), an `Iterator` its collection and cursor, and a `Random` its seed.

**TDZ-aware instrumentation** — `let`/`const` declarations are tracked incrementally so the visualizer never reads variables before they are initialized.

**Block scopes rendered inline** — `for`, `while`, and `do...while` loop bodies with `let`/`const` appear as nested sections inside their parent frame card rather than as separate call-stack entries.

**Closure & `this` tracking** — when a nested function executes, variables closed over from enclosing scopes are displayed in a dedicated "Closure" section. Method calls show the `this` receiver object.

**Sub-line for-loop highlighting** — for-loop init, condition, and update expressions carry column ranges through the snapshot pipeline, enabling precise sub-expression highlighting in the editor instead of whole-line highlighting.

**URL-based sharing** — the Share button LZ-string-compresses the code into the URL. Shared links open a security interstitial with a read-only code preview and a static analysis scan before execution. View options (like "hide functions") are encoded as query parameters.

**Standalone HTML export** — the Export button (next to Share/Embed) downloads a self-contained `.html` file. The flow:

1. The viewer build (`vite build --mode viewer-<lang>` with [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)) bundles the React app + the target engine into a single HTML file at `docs/viewer-<lang>.html`, with an empty `window.__EXAMPLES__ = []` between explicit `EXPORT_PLACEHOLDER_START` / `EXPORT_PLACEHOLDER_END` markers.
2. When the user clicks Export, the live app calls `runCode` (if needed) to capture snapshots, fetches `./viewer-<lang>.html` from the same origin, then splices a JSON-stringified example object into the placeholder via `src/utils/exportHtml.ts`.
3. The resulting HTML downloads as a single file. Recipients can open it offline (network only required for Python's Pyodide CDN load) and edit/re-run code with the full engine onboard.
4. To combine multiple visualizations, paste additional example objects into the `__EXAMPLES__` array between the placeholder markers — the viewer shows a picker in the navbar whenever the array has 2+ entries.

The Python and Java engines use Vite's `?worker&inline` syntax for their Web Workers so the workers serialize as base64 blob URLs inside the singlefile bundle.

**Versioned, upgradeable engine** — the viewer build tags the inlined engine `<script>` with `data-tutor-engine="X.Y.Z"` (taken from `package.json` at build time), exposes the same string at runtime as `window.__TUTOR_ENGINE_VERSION__`, and shows it as `engine vX.Y.Z` in the viewer's navbar. A block comment above the engine script in every exported file documents the upgrade procedure:

1. Download a fresh `viewer-<lang>.html` from the live site (or rebuild it locally).
2. In a text editor, replace **only** the `<script ... data-tutor-engine="...">` block in the old export with the new one.
3. Save — the `window.__EXAMPLES__` array above the engine block is preserved.

The splice utility uses `lastIndexOf` to find the `tutor-examples` script tag so any false positives inside the bundled engine source (e.g. the marker text appearing in string literals) can't shadow the real placeholder block at the bottom of the file.

**Data schema versioning** — independent of the engine version, every example carries a `schemaVersion: 1` field (declared by `CURRENT_EXAMPLE_SCHEMA_VERSION` in `src/types/viewer.ts`). The viewer compares this against its own supported version on load. If an example was produced by a newer engine than the one running, the viewer renders a dismissible warning banner above the navbar but still attempts to display the visualization. Bumping the schema is a deliberate, documented act — increment the constant whenever a snapshot/example field changes in a way the previous engine wouldn't tolerate.

---

## Built With

- [React](https://react.dev) 19 + [TypeScript](https://www.typescriptlang.org) 5.9
- [Vite](https://vite.dev) 7 — build tooling, dev server, HMR, multi-mode builds
- [React Bootstrap](https://react-bootstrap.github.io) / [Bootstrap](https://getbootstrap.com) 5
- [CodeMirror 6](https://codemirror.net) — code editor (with `@codemirror/lang-javascript` and `@codemirror/lang-python`)
- [Acorn](https://github.com/acornjs/acorn) — JavaScript parser (AST instrumentation)
- [Astring](https://github.com/davidbonnet/astring) — JavaScript code generator
- [Pyodide](https://pyodide.org) — CPython compiled to WebAssembly (Python engine, loaded from CDN)
- [java-parser](https://github.com/nicolo-ribaudo/java-parser) — Chevrotain-based Java parser (Java engine, CST interpretation)
- [Zustand](https://zustand.docs.pmnd.rs) — state management
- [React Router](https://reactrouter.com) 7 — client-side routing (HashRouter)
- [lz-string](https://github.com/pieroxy/lz-string) — URL-compressed share links

---

## Deployment

Each language target builds to its own output directory and deploys to its own domain via GitHub Pages:

```bash
npm run build:js     # outputs to docs/  → jstutor.org
npm run build:py     # outputs to docs/  → pytutor.org
npm run build:java   # outputs to docs/  → javatutor.org
npm run build:all    # build everything
```

GitHub Pages serves `docs/` at [jstutor.org](https://jstutor.org). Non-JS output directories (`docs-*/`) are gitignored and deployed separately to their respective domains. The CNAME file is generated at build time based on the target language. HashRouter is used so all routes resolve correctly without server rewrites.

---

## License

GPL-3.0 — Copyright 2026 [Cole Nelson](https://coletnelson.us), University of Wisconsin–Madison ([cs.wisc.edu](https://cs.wisc.edu)). See [LICENSE](LICENSE) for details.
