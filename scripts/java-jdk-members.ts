/**
 * Regenerate src/engines/java/semantic/jdkMembers.ts: the names of the public
 * methods (inherited ones included) of every library class the binder's stubs
 * declare, and each method's overloads by their erased parameter types (#71);
 * every package the JDK exports, and the public classes of the packages
 * courses import from (#72); read from real JDK 21 by reflection.
 *
 *   npx tsx scripts/java-jdk-members.ts
 *
 * The binder calls a method the stubs lack dynamically, but a name the JDK
 * class doesn't have at all is javac's "cannot find symbol" (#23); a call
 * no stub overload takes is dynamic too when a JDK overload would take it
 * (#71), and javac's error otherwise. Requires
 * JDK 21 (`java` on PATH, or JAVA_BIN=/path/to/java); run it after adding a
 * class to stubs.ts.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { library } from '../src/engines/java/semantic/binder';
import type { ClassSymbol } from '../src/engines/java/semantic/symbols';

const OUT = 'src/engines/java/semantic/jdkMembers.ts';
const java = process.env.JAVA_BIN ?? 'java';

const version = spawnSync(java, ['-version'], { encoding: 'utf8' });
if (!/version "21[".]/.test(version.stderr)) {
  console.error(`JDK 21 required (found: ${version.stderr.split('\n')[0] || 'no java'}). Set JAVA_BIN.`);
  process.exit(1);
}

// Every library class, by binary name (java.util.Map$Entry).
const names: string[] = [];
const visit = (sym: ClassSymbol, binary: string) => {
  names.push(binary);
  for (const [name, member] of sym.memberTypes) visit(member, `${binary}$${name}`);
};
for (const [pkg, classes] of library().packages) for (const sym of classes.values()) if (!sym.outer) visit(sym, `${pkg}.${sym.name}`);

/** Packages whose classes an import is checked against (#72): an import of a class not in them is javac's "cannot find symbol". */
const CHECKED_PACKAGES = ['java.lang', 'java.util', 'java.util.function', 'java.util.stream', 'java.util.regex', 'java.io', 'java.math', 'java.text', 'java.time', 'java.nio.file'];

const program = `
import java.lang.reflect.Method;
import java.lang.module.ModuleReference;
import java.lang.module.ModuleFinder;
import java.util.TreeSet;

public class Members {
  public static void main(String[] args) throws Exception {
    // Every package the JDK's modules export, and the public top-level classes of the checked ones.
    TreeSet<String> packages = new TreeSet<>();
    TreeSet<String> checked = new TreeSet<>(java.util.List.of(${CHECKED_PACKAGES.map(p => `"${p}"`).join(', ')}));
    java.util.Map<String, TreeSet<String>> classes = new java.util.TreeMap<>();
    for (ModuleReference ref : ModuleFinder.ofSystem().findAll()) {
      for (var e : ref.descriptor().exports()) if (!e.isQualified()) packages.add(e.source());
      try (var reader = ref.open()) {
        for (String r : (Iterable<String>) reader.list()::iterator) {
          if (!r.endsWith(".class") || r.contains("$") || r.endsWith("module-info.class")) continue;
          String cls = r.substring(0, r.length() - 6).replace('/', '.');
          String pkg = cls.substring(0, cls.lastIndexOf('.'));
          if (!checked.contains(pkg)) continue;
          Class<?> c = Class.forName(cls, false, ClassLoader.getSystemClassLoader());
          if (java.lang.reflect.Modifier.isPublic(c.getModifiers())) classes.computeIfAbsent(pkg, k -> new TreeSet<>()).add(c.getSimpleName());
        }
      }
    }
    System.out.println("#packages\\t" + String.join(" ", packages));
    for (var e : classes.entrySet()) System.out.println("#classes\\t" + e.getKey() + "\\t" + String.join(" ", e.getValue()));
    for (String name : args) {
      Class<?> c;
      try {
        c = Class.forName(name);
      } catch (ClassNotFoundException e) {
        System.err.println("not in the JDK: " + name);
        continue;
      }
      TreeSet<String> methods = new TreeSet<>();
      TreeSet<String> overloads = new TreeSet<>();
      java.util.List<Method> all = new java.util.ArrayList<>(java.util.List.of(c.getMethods()));
      // An interface's values are objects too.
      if (c.isInterface()) all.addAll(java.util.List.of(Object.class.getMethods()));
      for (Method m : all) {
        methods.add(m.getName());
        StringBuilder sig = new StringBuilder(m.getName()).append('(');
        Class<?>[] params = m.getParameterTypes();
        for (int i = 0; i < params.length; i++) {
          if (i > 0) sig.append(',');
          String t = params[i].getSimpleName();
          sig.append(m.isVarArgs() && i == params.length - 1 ? t.substring(0, t.length() - 2) + "..." : t);
        }
        overloads.add(sig.append(')').toString());
      }
      System.out.println(name + "\\t" + String.join(" ", methods) + "\\t" + String.join(" ", overloads));
    }
  }
}
`;
const dir = mkdtempSync(join(tmpdir(), 'jdk-members-'));
try {
  writeFileSync(join(dir, 'Members.java'), program);
  const run = spawnSync(java, ['Members.java', ...names], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (run.status !== 0) {
    console.error(run.stderr);
    process.exit(1);
  }
  if (run.stderr.trim()) console.warn(run.stderr.trim());
  const lines = run.stdout.trim().split(/\r?\n/).map(line => line.split('\t'));
  const packageList = lines.find(l => l[0] === '#packages')![1];
  const classLists = lines.filter(l => l[0] === '#classes').map(([, pkg, names]) => `  '${pkg}': '${names}',`).join('\n');
  const entries = lines.filter(l => !l[0].startsWith('#'));
  const body = entries.map(([name, methods]) => `  '${name}': '${methods}',`).join('\n');
  const signatures = entries.map(([name, , overloads]) => `  '${name}': '${overloads}',`).join('\n');
  writeFileSync(OUT, `/**
 * Generated by scripts/java-jdk-members.ts from JDK 21; don't edit. The names
 * of each library class's public methods, inherited ones included, by binary
 * name: a method the stubs lack is called dynamically, unless the JDK class
 * has no method of that name (javac's "cannot find symbol", #23).
 */
export const JDK_METHODS: Record<string, string> = {
${body}
};

/**
 * Each class's public methods by their parameter types (#71), erased and by
 * simple name, \`isLetter(int)\`, \`format(Locale,String,Object...)\`: a call no
 * stub overload takes is dynamic when one of these would take it.
 */
export const JDK_OVERLOADS: Record<string, string> = {
${signatures}
};

/** Every package the JDK exports (#72): an import from any other is javac's "package … does not exist". */
export const JDK_PACKAGES = '${packageList}';

/** The public classes of the packages courses import from (#72): an import of another class from one is javac's "cannot find symbol". */
export const JDK_CLASSES: Record<string, string> = {
${classLists}
};
`);
  console.log(`${entries.length} classes written to ${OUT}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
