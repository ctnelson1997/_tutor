/**
 * CPython differential corpus (#29): case discovery and the golden-file format.
 *
 * A case is a Python program:
 *   - `cases/<category>/<name>.py`, with an optional `<name>.stdin` (what
 *     `input()` reads);
 *   - every shipped example in `examples.ts`, as `examples/<slug>` (read live,
 *     so edited or new examples are covered automatically).
 *
 * Each case has a committed `<name>.golden.json` recording what CPython 3.12
 * (Pyodide PYODIDE_VERSION, the interpreter PyTutor ships) did with it.
 * `npm run test:py:golden` writes the goldens and cpython-differential.test.ts
 * reads them, so `npm test` needs no Python.
 *
 * Shared by the suite and by the scripts in `scripts/` (run with tsx).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { examples } from '../../examples';

export const CPYTHON_DIR = dirname(fileURLToPath(import.meta.url));
export const CASES_DIR = join(CPYTHON_DIR, 'cases');
export const KNOWN_FAILURES_PATH = join(CPYTHON_DIR, 'known-failures.json');

/** Category whose cases come from examples.ts; its directory holds goldens only. */
export const EXAMPLES_CATEGORY = 'examples';
/** Category for programs CPython rejects (their goldens carry `compileError`). */
export const SYNTAX_ERRORS_CATEGORY = 'syntax-errors';

export interface PyCase {
  /** `<category>/<name>`: the key used in known-failures.json and in test names. */
  id: string;
  category: string;
  name: string;
  /** Source with line endings normalized to `\n`. */
  source: string;
  /** What `input()` reads (`<name>.stdin`), or null when the case has none. */
  stdin: string | null;
  /** Where the source lives: a path relative to `cases/`, or `examples.ts#<slug>`. */
  origin: string;
  goldenPath: string;
}

/** A line of the console, and the stream the program wrote its first characters to. */
export interface GoldenLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

/**
 * One event of the reference trace: a minimal `sys.settrace` over the user's
 * frames only (filename `main.py`), recorded as CPython reports it.
 */
export interface GoldenEvent {
  event: 'call' | 'line' | 'return' | 'exception';
  line: number;
  /**
   * The user's frames, outermost first, by code name (`<module>`, `fib`,
   * `<genexpr>`), a run of n frames of one name written `name*n` (expandStack).
   */
  stack: string[];
  /**
   * The frame's variables, each as the reference repr (see REFERENCE_TRACER's
   * `_r`): `repr()` of a None, bool, int, float, complex or str (cut at 300
   * characters with `…`), `<int with N digits>` past Python's digit limit,
   * and `<TypeName>` for anything else. The module frame shows its globals
   * without dunder names.
   */
  locals: Record<string, string>;
  /** A return event's value, as a reference repr. */
  value?: string;
  /** A return event that is the frame unwinding (an exception passing through it): no value is returned. */
  unwinding?: true;
  /** An exception event's exception class. */
  exc?: string;
}

/** What CPython did with a case. */
export interface PyGolden {
  /** Everything written to stdout, and to stderr (without an uncaught exception's traceback). */
  stdout: string;
  stderr: string;
  /** The console in program order, as `python -u main.py` shows it. */
  console: GoldenLine[];
  /** The exception nothing caught: its class name and `str()`. */
  exception: { class: string; message: string } | null;
  /** What `python main.py` prints for that exception (`traceback.format_exception`, the user's frames only). */
  traceback: string | null;
  /** For a program CPython rejects: the SyntaxError and what CPython prints for it. */
  compileError: { class: string; msg: string; line: number | null; offset: number | null; text: string } | null;
  /** The program was still running after the recorder's time budget: an endless loop. */
  endless: boolean;
  /** The reference trace, at most MAX_GOLDEN_EVENTS events. */
  events: GoldenEvent[];
  /** The reference trace was cut at MAX_GOLDEN_EVENTS. */
  truncated: boolean;
  /** How many call, line and return events the user's frames had in all (at most 100,000), to tell whether the step cap is expected. */
  stepEvents: number;
  /** Each module-level name's final value (reference reprs), for a program that ended. */
  finalGlobals: Record<string, string>;
  /** Lines inside a multi-line statement that start no statement: PyTutor gives the statement one step. */
  continuation: number[];
  /** Hash of the source and stdin the golden was produced from. */
  sourceSha256: string;
}

export const MAX_GOLDEN_EVENTS = 8000;

/** A chunk one stream received, in the order the program wrote it. */
export interface ConsoleChunk {
  stream: 'stdout' | 'stderr';
  text: string;
}

/**
 * The console as lines: each line belongs to the stream that wrote its first
 * characters (as JavaTutor's console does, #22), and a final line without a
 * newline is kept.
 */
export function consoleLines(chunks: ConsoleChunk[]): GoldenLine[] {
  const lines: GoldenLine[] = [];
  let open: GoldenLine | null = null;
  for (const { stream, text } of chunks) {
    text.split('\n').forEach((part, i) => {
      if (i > 0) {
        // A newline ends the open line, or is an empty line of its own.
        if (!open) lines.push({ stream, text: '' });
        open = null;
      }
      if (part) {
        if (!open) {
          open = { stream, text: '' };
          lines.push(open);
        }
        open.text += part;
      }
    });
  }
  return lines;
}

/** An event's stack with each `name*n` run written out: one name per frame. */
export function expandStack(stack: string[]): string[] {
  return stack.flatMap(s => {
    const m = /^(.*)\*(\d+)$/.exec(s);
    return m ? Array<string>(Number(m[2])).fill(m[1]) : [s];
  });
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** Identifies the exact program and input a golden belongs to (pass normalized line endings, as loadCases does). */
export function caseHash(source: string, stdin: string | null): string {
  const h = createHash('sha256').update(source);
  if (stdin !== null) h.update('\0stdin\0').update(stdin);
  return h.digest('hex');
}

/** All corpus cases, sorted by id. */
export function loadCases(): PyCase[] {
  const cases: PyCase[] = [];
  const categories = readdirSync(CASES_DIR)
    .filter(d => statSync(join(CASES_DIR, d)).isDirectory())
    .sort();
  for (const category of categories) {
    const dir = join(CASES_DIR, category);
    const files = readdirSync(dir).filter(f => f.endsWith('.py')).sort();
    if (category === EXAMPLES_CATEGORY) {
      if (files.length > 0) {
        throw new Error(`cases/${EXAMPLES_CATEGORY}/ holds only goldens (sources come from examples.ts), found ${files[0]}`);
      }
      continue;
    }
    for (const file of files) {
      const name = file.slice(0, -'.py'.length);
      const stdinPath = join(dir, name + '.stdin');
      cases.push({
        id: `${category}/${name}`,
        category,
        name,
        source: normalizeNewlines(readFileSync(join(dir, file), 'utf8')),
        stdin: existsSync(stdinPath) ? normalizeNewlines(readFileSync(stdinPath, 'utf8')) : null,
        origin: `${category}/${file}`,
        goldenPath: join(dir, name + '.golden.json'),
      });
    }
  }

  for (const ex of examples) {
    cases.push({
      id: `${EXAMPLES_CATEGORY}/${ex.slug}`,
      category: EXAMPLES_CATEGORY,
      name: ex.slug,
      source: normalizeNewlines(ex.code),
      stdin: null,
      origin: `examples.ts#${ex.slug}`,
      goldenPath: join(CASES_DIR, EXAMPLES_CATEGORY, ex.slug + '.golden.json'),
    });
  }

  return cases.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function readGolden(c: PyCase): PyGolden | null {
  if (!existsSync(c.goldenPath)) return null;
  return JSON.parse(readFileSync(c.goldenPath, 'utf8')) as PyGolden;
}

/** True when the golden was produced from the case's current source and stdin. */
export function goldenIsCurrent(c: PyCase, golden: PyGolden): boolean {
  return golden.sourceSha256 === caseHash(c.source, c.stdin);
}

/** Goldens and stdin files under cases/ that belong to no case, left behind by a rename or delete. */
export function findOrphanFiles(cases: PyCase[]): string[] {
  const goldens = new Set(cases.map(c => c.goldenPath));
  const programs = new Set(cases.map(c => c.goldenPath.replace(/\.golden\.json$/, '')));
  const orphans: string[] = [];
  for (const category of readdirSync(CASES_DIR)) {
    const dir = join(CASES_DIR, category);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.golden.json') && !goldens.has(join(dir, file))) orphans.push(`${category}/${file}`);
      if (file.endsWith('.stdin') && !programs.has(join(dir, file.slice(0, -'.stdin'.length)))) orphans.push(`${category}/${file}`);
    }
  }
  return orphans.sort();
}

/** Serialize a golden with a fixed key order, so regenerating an unchanged case is a no-op. */
export function formatGolden(g: PyGolden): string {
  const ordered: PyGolden = {
    stdout: g.stdout,
    stderr: g.stderr,
    console: g.console,
    exception: g.exception,
    traceback: g.traceback,
    compileError: g.compileError,
    endless: g.endless,
    events: g.events,
    truncated: g.truncated,
    stepEvents: g.stepEvents,
    finalGlobals: g.finalGlobals,
    continuation: g.continuation,
    sourceSha256: g.sourceSha256,
  };
  // Events one per line: readable diffs without a line per key.
  const text = JSON.stringify({ ...ordered, events: [] }, null, 1);
  const events = ordered.events.map(e => '  ' + JSON.stringify(e)).join(',\n');
  return text.replace('"events": []', () => (ordered.events.length ? `"events": [\n${events}\n ]` : '"events": []')) + '\n';
}
