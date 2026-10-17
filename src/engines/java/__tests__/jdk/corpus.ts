/**
 * JDK differential corpus: case discovery and the golden-file format.
 *
 * A case is a Java program plus optional stdin:
 *   - `cases/<category>/<name>.java`, with an optional `<name>.stdin`;
 *   - every shipped example in `examples.ts`, as `examples/<slug>` (read live,
 *     so edited or new examples are covered automatically).
 *
 * Each case has a committed `<name>.golden.json` recording what real `java`
 * (JDK 21) did with it. `npm run test:java:golden` writes the goldens and
 * jdk-differential.test.ts reads them, so `npm test` never needs a JDK.
 *
 * Shared by the suite and by the scripts in `scripts/` (run with tsx).
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { examples } from '../../examples';

export const JDK_DIR = dirname(fileURLToPath(import.meta.url));
export const CASES_DIR = join(JDK_DIR, 'cases');
export const KNOWN_FAILURES_PATH = join(JDK_DIR, 'known-failures.json');

/** Category whose cases come from examples.ts; its directory holds goldens only. */
export const EXAMPLES_CATEGORY = 'examples';
/** Category for programs `javac` rejects (their goldens carry `compileError`). */
export const COMPILE_ERRORS_CATEGORY = 'compile-errors';

export interface JdkCase {
  /** `<category>/<name>`: the key used in known-failures.json and in test names. */
  id: string;
  category: string;
  name: string;
  /** Java source with line endings normalized to `\n`. */
  source: string;
  /** Preset stdin for `Scanner` (`''` when the case has no `.stdin` file). */
  stdin: string;
  /** Where the source lives: a path relative to `cases/`, or `examples.ts#<slug>`. */
  origin: string;
  goldenPath: string;
}

/** What real `java` did with a case. */
export interface JdkGolden {
  /** Program stdout, with `\r\n` normalized to `\n`. */
  stdout: string;
  /** stderr, normalized the same way, minus source-launcher stack frames, cut to STDERR_MAX_LINES lines. */
  stderr: string;
  exitCode: number | null;
  /** The uncaught exception that ended the program, as `java` printed it. */
  exception: { class: string; message: string | null } | null;
  /** javac's diagnostics when the program doesn't compile; null otherwise. */
  compileError: string | null;
  /** Hash of the source and stdin the golden was produced from (see caseHash). */
  sourceSha256: string;
}

export const STDERR_MAX_LINES = 50;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Identifies the exact program + input a golden belongs to. Pass text with
 * normalized line endings (loadCases does), so a checkout with
 * `core.autocrlf=true` hashes the same.
 */
export function caseHash(source: string, stdin: string): string {
  return createHash('sha256').update(source).update('\u0000').update(stdin).digest('hex');
}

/** All corpus cases, sorted by id. */
export function loadCases(): JdkCase[] {
  const cases: JdkCase[] = [];
  const categories = readdirSync(CASES_DIR)
    .filter(d => statSync(join(CASES_DIR, d)).isDirectory())
    .sort();

  for (const category of categories) {
    const dir = join(CASES_DIR, category);
    const javaFiles = readdirSync(dir).filter(f => f.endsWith('.java')).sort();
    if (category === EXAMPLES_CATEGORY) {
      if (javaFiles.length > 0) {
        throw new Error(`cases/${EXAMPLES_CATEGORY}/ holds only goldens (sources come from examples.ts), found ${javaFiles[0]}`);
      }
      continue;
    }
    for (const file of javaFiles) {
      const name = file.slice(0, -'.java'.length);
      const stdinPath = join(dir, name + '.stdin');
      cases.push({
        id: `${category}/${name}`,
        category,
        name,
        source: normalizeNewlines(readFileSync(join(dir, file), 'utf8')),
        stdin: existsSync(stdinPath) ? normalizeNewlines(readFileSync(stdinPath, 'utf8')) : '',
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
      stdin: '',
      origin: `examples.ts#${ex.slug}`,
      goldenPath: join(CASES_DIR, EXAMPLES_CATEGORY, ex.slug + '.golden.json'),
    });
  }

  return cases.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function readGolden(c: JdkCase): JdkGolden | null {
  if (!existsSync(c.goldenPath)) return null;
  return JSON.parse(readFileSync(c.goldenPath, 'utf8')) as JdkGolden;
}

/** True when the golden was produced from the case's current source and stdin. */
export function goldenIsCurrent(c: JdkCase, golden: JdkGolden): boolean {
  return golden.sourceSha256 === caseHash(c.source, c.stdin);
}

/** Files under cases/ that belong to no case: goldens or stdin left behind by a rename or delete. */
export function findOrphanFiles(cases: JdkCase[]): string[] {
  const goldens = new Set(cases.map(c => c.goldenPath));
  const orphans: string[] = [];
  for (const category of readdirSync(CASES_DIR)) {
    const dir = join(CASES_DIR, category);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      const path = join(dir, file);
      if (file.endsWith('.golden.json') && !goldens.has(path)) orphans.push(`${category}/${file}`);
      if (file.endsWith('.stdin') && !existsSync(path.slice(0, -'.stdin'.length) + '.java')) {
        orphans.push(`${category}/${file}`);
      }
    }
  }
  return orphans.sort();
}

/** Serialize a golden with a fixed key order, so regenerating an unchanged case is a no-op. */
export function formatGolden(g: JdkGolden): string {
  const ordered: JdkGolden = {
    stdout: g.stdout,
    stderr: g.stderr,
    exitCode: g.exitCode,
    exception: g.exception,
    compileError: g.compileError,
    sourceSha256: g.sourceSha256,
  };
  return JSON.stringify(ordered, null, 2) + '\n';
}

const UNCAUGHT_PREFIX = 'Exception in thread "main" ';

/**
 * Parse the uncaught-exception report the JVM writes to stderr:
 *
 *   Exception in thread "main" java.lang.IllegalStateException: Stack full
 *   	at Main$ArrayStack.push(Main.java:11)
 *
 * The message runs until the first stack-trace line, so multi-line messages survive.
 */
export function parseUncaughtException(stderr: string): JdkGolden['exception'] {
  const lines = normalizeNewlines(stderr).split('\n');
  const start = lines.findIndex(l => l.startsWith(UNCAUGHT_PREFIX));
  if (start < 0) return null;
  const head = lines[start].slice(UNCAUGHT_PREFIX.length);
  const colon = head.indexOf(': ');
  if (colon < 0) return { class: head.trim(), message: null };
  const message = [head.slice(colon + 2)];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\tat |^\t\.\.\. \d+ more|^Caused by: /.test(lines[i])) break;
    message.push(lines[i]);
  }
  while (message.length > 1 && message[message.length - 1] === '') message.pop();
  return { class: head.slice(0, colon), message: message.join('\n') };
}

/**
 * Stack frames that exist only because the goldens come from the single-file
 * source launcher (`java Main.java`), which calls `main` reflectively. A trace
 * printed while `main` runs (e.g. `printStackTrace()`) ends with these; after
 * `javac Main.java && java Main` it wouldn't, so they're dropped.
 */
const LAUNCHER_FRAME = /^\tat (?:java\.base\/jdk\.internal\.reflect\.|java\.base\/java\.lang\.reflect\.Method\.invoke\(|jdk\.compiler\/com\.sun\.tools\.javac\.launcher\.)/;

function truncateLines(text: string, max: number): string {
  const lines = text.split('\n');
  if (lines.length <= max) return text;
  return lines.slice(0, max).join('\n') + `\n... (${lines.length - max} more lines)`;
}

/** Build a golden from one run of `java Main.java` (the JDK single-file source launcher). */
export function goldenFromJavaRun(
  run: { stdout: string; stderr: string; exitCode: number | null },
  sourceSha256: string,
): JdkGolden {
  const stdout = normalizeNewlines(run.stdout);
  const stderr = normalizeNewlines(run.stderr).split('\n').filter(l => !LAUNCHER_FRAME.test(l)).join('\n');
  // The launcher prints javac's diagnostics, then "error: compilation failed".
  const failed = /^error: compilation failed$/m.exec(stderr);
  const compileError = failed ? stderr.slice(0, failed.index).trimEnd() : null;
  return {
    stdout,
    stderr: truncateLines(stderr, STDERR_MAX_LINES),
    exitCode: run.exitCode,
    exception: compileError === null ? parseUncaughtException(stderr) : null,
    compileError,
    sourceSha256,
  };
}
