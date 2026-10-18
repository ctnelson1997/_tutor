/**
 * Node differential corpus (#42): case discovery and the golden-file format.
 *
 * A case is a JavaScript program:
 *   - `cases/<category>/<name>.js`;
 *   - every shipped example in `examples.ts`, as `examples/<slug>` (read live,
 *     so edited or new examples are covered automatically).
 *
 * Each case has a committed `<name>.golden.json` recording what Node (the
 * pinned major, NODE_MAJOR) did with it. `npm run test:js:golden` writes the
 * goldens and node-differential.test.ts reads them, so `npm test` needs
 * nothing beyond the dev dependencies.
 *
 * Shared by the suite and by the scripts in `scripts/` (run with tsx).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { examples } from '../../examples';
import type { Canon } from './canon';

export const NODE_DIR = dirname(fileURLToPath(import.meta.url));
export const CASES_DIR = join(NODE_DIR, 'cases');
export const KNOWN_FAILURES_PATH = join(NODE_DIR, 'known-failures.json');

/** Goldens come from this Node major only, so they stay stable. */
export const NODE_MAJOR = 24;

/** Category whose cases come from examples.ts; its directory holds goldens only. */
export const EXAMPLES_CATEGORY = 'examples';
/** Category for programs that don't parse (their goldens carry `compileError`). */
export const SYNTAX_ERRORS_CATEGORY = 'syntax-errors';

export interface NodeCase {
  /** `<category>/<name>`: the key used in known-failures.json and in test names. */
  id: string;
  category: string;
  name: string;
  /** Source with line endings normalized to `\n`. */
  source: string;
  /** Where the source lives: a path relative to `cases/`, or `examples.ts#<slug>`. */
  origin: string;
  goldenPath: string;
}

/** A console line, and the stream Node wrote it to. */
export interface GoldenLine {
  stream: 'stdout' | 'stderr';
  text: string;
}

/** An exception nothing caught: thrown by the script or a timer callback, or a promise rejected with no handler. */
export interface GoldenUncaught {
  /** The error's `name` (`TypeError`, a custom class's), or null for a thrown value that isn't an Error. */
  name: string | null;
  /** The error's message, or the thrown value as `String()` gives it. */
  message: string;
  where: 'script' | 'timer' | 'promise';
  /** How many console lines had been written when it happened. */
  consoleLines: number;
}

/** What Node did with a case. */
export interface NodeGolden {
  /** What Node's console printed (console.Console, no colors), line by line, in program order. */
  console: GoldenLine[];
  /** Each console call: its method and its arguments as canonical trees (what was logged, whatever the format). */
  calls: { method: string; args: Canon[] }[];
  /** Every uncaught exception and unhandled rejection, in order. Browsers keep running timers after one, and so did the recording. */
  uncaught: GoldenUncaught[];
  /** The synchronous code was still running after the recorder's time limit: an endless loop. */
  endless: boolean;
  /** Timers were still pending when the recorder stopped waiting (an interval never cleared). */
  pendingTimers: boolean;
  /** V8's SyntaxError when the program doesn't parse; null otherwise. `column` is 0-based. */
  compileError: { message: string; line: number | null; column: number | null } | null;
  /**
   * The lines of the statements that ran, from V8's precise block coverage (a
   * do-while at its `while` line). A statement after a call that threw in the
   * same block counts as run, so it is only exact for programs that never
   * recover from an exception (see coverageIsExact).
   */
  executedLines: number[];
  /** How many times statements ran in all, and how many function calls there were (to tell whether the step cap is expected), each at most 10,000. */
  statementRuns: number;
  functionCalls: number;
  /** Each top-level name's final value, after all the program's timers and promises. */
  finalGlobals: Record<string, Canon>;
  /** Hash of the source the golden was produced from. */
  sourceSha256: string;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/** Identifies the exact program a golden belongs to (pass normalized line endings, as loadCases does). */
export function caseHash(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

/** All corpus cases, sorted by id. */
export function loadCases(): NodeCase[] {
  const cases: NodeCase[] = [];
  const categories = readdirSync(CASES_DIR)
    .filter(d => statSync(join(CASES_DIR, d)).isDirectory())
    .sort();
  for (const category of categories) {
    const dir = join(CASES_DIR, category);
    const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
    if (category === EXAMPLES_CATEGORY) {
      if (files.length > 0) {
        throw new Error(`cases/${EXAMPLES_CATEGORY}/ holds only goldens (sources come from examples.ts), found ${files[0]}`);
      }
      continue;
    }
    for (const file of files) {
      const name = file.slice(0, -'.js'.length);
      cases.push({
        id: `${category}/${name}`,
        category,
        name,
        source: normalizeNewlines(readFileSync(join(dir, file), 'utf8')),
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
      origin: `examples.ts#${ex.slug}`,
      goldenPath: join(CASES_DIR, EXAMPLES_CATEGORY, ex.slug + '.golden.json'),
    });
  }

  return cases.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function readGolden(c: NodeCase): NodeGolden | null {
  if (!existsSync(c.goldenPath)) return null;
  return JSON.parse(readFileSync(c.goldenPath, 'utf8')) as NodeGolden;
}

/** True when the golden was produced from the case's current source. */
export function goldenIsCurrent(c: NodeCase, golden: NodeGolden): boolean {
  return golden.sourceSha256 === caseHash(c.source);
}

/** Goldens under cases/ that belong to no case, left behind by a rename or delete. */
export function findOrphanFiles(cases: NodeCase[]): string[] {
  const goldens = new Set(cases.map(c => c.goldenPath));
  const orphans: string[] = [];
  for (const category of readdirSync(CASES_DIR)) {
    const dir = join(CASES_DIR, category);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.golden.json') && !goldens.has(join(dir, file))) orphans.push(`${category}/${file}`);
    }
  }
  return orphans.sort();
}

/** Serialize a golden with a fixed key order, so regenerating an unchanged case is a no-op. */
export function formatGolden(g: NodeGolden): string {
  const ordered: NodeGolden = {
    console: g.console,
    calls: g.calls,
    uncaught: g.uncaught,
    endless: g.endless,
    pendingTimers: g.pendingTimers,
    compileError: g.compileError,
    executedLines: g.executedLines,
    statementRuns: g.statementRuns,
    functionCalls: g.functionCalls,
    finalGlobals: g.finalGlobals,
    sourceSha256: g.sourceSha256,
  };
  return JSON.stringify(ordered, null, 1) + '\n';
}
