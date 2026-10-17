/**
 * Compile errors (#23): a program javac rejects stops before any step, with
 * javac's errors, all of them, in javac's order, listed in the console as
 * javac lists them. Every expected listing in the tables below is javac 21's
 * own output for that source (only its echo of a source line is taken from
 * the source, since javac writes it in the console's encoding).
 */
import { describe, it, expect } from 'vitest';
import { runJava } from '../run';
import { describeParseError, javacListing, javaFileName, lexicalError } from '../compileErrors';
import type { RunError } from '../../../types/snapshot';

/** What runJava reports for a program that doesn't compile; fails the test if the program ran. */
function compileError(source: string): RunError {
  const reply = runJava(source);
  if (reply.type !== 'result' || reply.error?.kind !== 'compile') throw new Error(`expected a compile error, got ${JSON.stringify(reply).slice(0, 300)}`);
  expect(reply.snapshots).toEqual([]);
  return reply.error;
}

const SYNTAX: [string, string, string][] = [
  ["semi", "public class Main {\n  public static void main(String[] args) {\n    int x = 1\n    System.out.println(x);\n  }\n}\n", "Main.java:3: error: ';' expected\n    int x = 1\n             ^"],
  ["paren", "public class Main {\n  public static void main(String[] args) {\n    System.out.println((1 + 2);\n  }\n}\n", "Main.java:3: error: ')' or ',' expected\n    System.out.println((1 + 2);\n                              ^"],
  ["argsemi", "public class Main {\n  static void f(int a) {}\n  public static void main(String[] args) {\n    f(1;\n  }\n}\n", "Main.java:4: error: ')' or ',' expected\n    f(1;\n       ^"],
  ["ifparen", "public class Main {\n  public static void main(String[] args) {\n    int x = 2;\n    if (x > 1 {\n      x++;\n    }\n  }\n}\n", "Main.java:4: error: ')' expected\n    if (x > 1 {\n             ^"],
  ["whileparen", "public class Main {\n  public static void main(String[] args) {\n    while (true {\n    }\n  }\n}\n", "Main.java:3: error: ')' expected\n    while (true {\n               ^"],
  ["brack", "public class Main {\n  public static void main(String[] args) {\n    int[] a = new int[3;\n  }\n}\n", "Main.java:3: error: ']' expected\n    int[] a = new int[3;\n                       ^"],
  ["arrinit", "public class Main {\n  public static void main(String[] args) {\n    int[] a = {1, 2;\n  }\n}\n", "Main.java:3: error: '}' expected\n    int[] a = {1, 2;\n                   ^"],
  ["eof", "public class Main {\n  public static void main(String[] args) {\n    System.out.println(1);\n  }\n", "Main.java:4: error: reached end of file while parsing\n  }\n   ^"],
  ["brace", "public class Main {\n  public static void main(String[] args) {\n    if (true) {\n      System.out.println(1);\n  }\n}\n", "Main.java:6: error: reached end of file while parsing\n}\n ^"],
  ["extra", "public class Main {\n  public static void main(String[] args) {\n    System.out.println(1);\n  }\n}\n}\n", "Main.java:6: error: class, interface, enum, or record expected\n}\n^"],
  ["noexpr", "public class Main {\n  public static void main(String[] args) {\n    int x = ;\n  }\n}\n", "Main.java:3: error: illegal start of expression\n    int x = ;\n            ^"],
  ["plus", "public class Main {\n  public static void main(String[] args) {\n    String s = \"a\" + ;\n  }\n}\n", "Main.java:3: error: illegal start of expression\n    String s = \"a\" + ;\n                     ^"],
  ["pubic", "public class Main {\n  pubic static void main(String[] args) {\n    System.out.println(1);\n  }\n}\n", "Main.java:2: error: <identifier> expected\n  pubic static void main(String[] args) {\n       ^"],
  ["missingtype", "public class Main {\n  static f() { return 1; }\n  public static void main(String[] args) {\n  }\n}\n", "Main.java:2: error: invalid method declaration; return type required\n  static f() { return 1; }\n         ^"],
  ["str", "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"hi);\n  }\n}\n", "Main.java:3: error: unclosed string literal\n    System.out.println(\"hi);\n                       ^"],
  ["char", "public class Main {\n  public static void main(String[] args) {\n    char c = 'ab';\n  }\n}\n", "Main.java:3: error: unclosed character literal\n    char c = 'ab';\n             ^"],
  ["emptychar", "public class Main {\n  public static void main(String[] args) {\n    char c = '';\n  }\n}\n", "Main.java:3: error: empty character literal\n    char c = '';\n             ^"],
  ["comment", "public class Main {\n  public static void main(String[] args) {\n    /* hi\n  }\n}\n", "Main.java:3: error: unclosed comment\n    /* hi\n    ^"],
  ["hash", "public class Main {\n  public static void main(String[] args) {\n    int x = 1 # 2;\n  }\n}\n", "Main.java:3: error: illegal character: '#'\n    int x = 1 # 2;\n              ^"],
  ["smart", "public class Main {\n  public static void main(String[] args) {\n    System.out.println(“hi”);\n  }\n}\n", "Main.java:3: error: illegal character: '\\u201c'\n    System.out.println(“hi”);\n                       ^"],
  ["elsenoif", "public class Main {\n  public static void main(String[] args) {\n    int x = 1;\n    else { x = 2; }\n  }\n}\n", "Main.java:4: error: 'else' without 'if'\n    else { x = 2; }\n    ^"],
  ["classkw", "public clas Main {\n  public static void main(String[] args) {\n  }\n}\n", "Main.java:1: error: class, interface, enum, or record expected\npublic clas Main {\n       ^"],
  ["dot", "public class Main {\n  public static void main(String[] args) {\n    System.out.println(1).;\n  }\n}\n", "Main.java:3: error: <identifier> expected\n    System.out.println(1).;\n                          ^"],
  ["lastsemi", "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"a\")\n  }\n}\n", "Main.java:3: error: ';' expected\n    System.out.println(\"a\")\n                           ^"],
  ["extraparen", "public class Main {\n  public static void main(String[] args) {\n    System.out.println(1));\n  }\n}\n", "Main.java:3: error: ';' expected\n    System.out.println(1));\n                         ^"],
  ["methodcallnosemi", "public class Main {\n  public static void main(String[] args) {\n    int x = 1\n  }\n}\n", "Main.java:3: error: ';' expected\n    int x = 1\n             ^"],
  ["stmtout", "public class Main {\n  System.out.println(1);\n  public static void main(String[] args) {\n  }\n}\n", "Main.java:2: error: <identifier> expected\n  System.out.println(1);\n                    ^"],
  ["badid", "public class Main {\n  public static void main(String[] args) {\n    int 2x = 1;\n  }\n}\n", "Main.java:3: error: not a statement\n    int 2x = 1;\n    ^"],
];

const FLOW: [string, string, string][] = [
  ["uninit", "public class Main {\n\n  public static void main(String[] args) {\n    int count;\n    count++;\n  }\n}\n", "Main.java:5: error: variable count might not have been initialized\n    count++;\n    ^\n1 error"],
  ["uninitbranch", "public class Main {\n\n  public static void main(String[] args) {\n    int x;\n    if (args.length > 0) x = 1;\n    System.out.println(x);\n  }\n}\n", "Main.java:6: error: variable x might not have been initialized\n    System.out.println(x);\n                       ^\n1 error"],
  ["trycatch", "public class Main {\n\n  public static void main(String[] args) {\n    int x;\n    try {\n      x = Integer.parseInt(\"1\");\n    } catch (NumberFormatException e) {\n      System.out.println(\"bad\");\n    }\n    System.out.println(x);\n  }\n}\n", "Main.java:10: error: variable x might not have been initialized\n    System.out.println(x);\n                       ^\n1 error"],
  ["unreach", "public class Main {\n\n  public static void main(String[] args) {\n    return;\n    System.out.println(1);\n  }\n}\n", "Main.java:5: error: unreachable statement\n    System.out.println(1);\n    ^\n1 error"],
  ["unreachloop", "public class Main {\n\n  public static void main(String[] args) {\n    while (true) { }\n    System.out.println(1);\n  }\n}\n", "Main.java:5: error: unreachable statement\n    System.out.println(1);\n    ^\n1 error"],
  ["unreachbreak", "public class Main {\n\n  public static void main(String[] args) {\n    for (int i = 0; i < 3; i++) {\n      break;\n      System.out.println(i);\n    }\n  }\n}\n", "Main.java:6: error: unreachable statement\n      System.out.println(i);\n      ^\n1 error"],
  ["unreachafterswitch", "public class Main {\n\n  public static void main(String[] args) {\n    int k = 1;\n    switch (k) {\n      case 1: return;\n      default: return;\n    }\n    System.out.println(k);\n  }\n}\n", "Main.java:9: error: unreachable statement\n    System.out.println(k);\n    ^\n1 error"],
  ["whilefalse", "public class Main {\n\n  public static void main(String[] args) {\n    while (false) { System.out.println(1); }\n  }\n}\n", "Main.java:4: error: unreachable statement\n    while (false) { System.out.println(1); }\n                  ^\n1 error"],
  ["missingret", "public class Main {\n  static int f(int n) {\n    if (n > 0) return 1;\n  }\n  public static void main(String[] args) {\n\n  }\n}\n", "Main.java:4: error: missing return statement\n  }\n  ^\n1 error"],
  ["finalre", "public class Main {\n\n  public static void main(String[] args) {\n    final int x = 1;\n    x = 2;\n  }\n}\n", "Main.java:5: error: cannot assign a value to final variable x\n    x = 2;\n    ^\n1 error"],
  ["finalparam", "public class Main {\n  static void f(final int n) {\n    n = 2;\n  }\n  public static void main(String[] args) {\n\n  }\n}\n", "Main.java:3: error: final parameter n may not be assigned\n    n = 2;\n    ^\n1 error"],
  ["finaltwice", "public class Main {\n\n  public static void main(String[] args) {\n    final int x;\n    x = 1;\n    x = 2;\n  }\n}\n", "Main.java:6: error: variable x might already have been assigned\n    x = 2;\n    ^\n1 error"],
  ["finalloop", "public class Main {\n\n  public static void main(String[] args) {\n    final int x;\n    for (int i = 0; i < 2; i++) {\n      x = i;\n    }\n  }\n}\n", "Main.java:6: error: variable x might be assigned in loop\n      x = i;\n      ^\n1 error"],
  ["blankfield", "public class Main {\n  final int size;\n  Main(int n) {\n    if (n > 0) size = n;\n  }\n  public static void main(String[] args) {\n\n  }\n}\n", "Main.java:5: error: variable size might not have been initialized\n  }\n  ^\n1 error"],
  ["blankdefault", "public class Main {\n  final int size;\n  public static void main(String[] args) {\n\n  }\n}\n", "Main.java:2: error: variable size not initialized in the default constructor\n  final int size;\n            ^\n1 error"],
  ["blankstatic", "public class Main {\n  static final int LIMIT;\n  public static void main(String[] args) {\n\n  }\n}\n", "Main.java:2: error: variable LIMIT might not have been initialized\n  static final int LIMIT;\n                   ^\n1 error"],
  ["unreported", "public class Main {\n  static void f() {\n    throw new Exception(\"no\");\n  }\n  public static void main(String[] args) {\n\n  }\n}\n", "Main.java:3: error: unreported exception Exception; must be caught or declared to be thrown\n    throw new Exception(\"no\");\n    ^\n1 error"],
  ["unreportedcall", "public class Main {\n  static void f() throws java.io.IOException { }\n  public static void main(String[] args) {\n    f();\n  }\n}\n", "Main.java:4: error: unreported exception IOException; must be caught or declared to be thrown\n    f();\n     ^\n1 error"],
  ["neverthrown", "public class Main {\n\n  public static void main(String[] args) {\n    try {\n      System.out.println(1);\n    } catch (java.io.IOException e) {\n      System.out.println(2);\n    }\n  }\n}\n", "Main.java:6: error: exception IOException is never thrown in body of corresponding try statement\n    } catch (java.io.IOException e) {\n      ^\n1 error"],
  ["alreadycaught", "public class Main {\n\n  public static void main(String[] args) {\n    try {\n      System.out.println(1);\n    } catch (Exception e) {\n    } catch (RuntimeException e) {\n    }\n  }\n}\n", "Main.java:7: error: exception RuntimeException has already been caught\n    } catch (RuntimeException e) {\n      ^\n1 error"],
  ["lambdaret", "public class Main {\n  interface F { int apply(int x); }\n  public static void main(String[] args) {\n    F f = x -> {\n      if (x > 0) return 1;\n    };\n  }\n}\n", "Main.java:4: error: incompatible types: bad return type in lambda expression\n    F f = x -> {\n          ^\n    missing return value\n1 error"],
  ["breakout", "public class Main {\n\n  public static void main(String[] args) {\n    break;\n  }\n}\n", "Main.java:4: error: break outside switch or loop\n    break;\n    ^\n1 error"],
  ["continueout", "public class Main {\n\n  public static void main(String[] args) {\n    int i = 0;\n    switch (i) {\n      case 0: continue;\n    }\n  }\n}\n", "Main.java:6: error: continue outside of loop\n      case 0: continue;\n              ^\n1 error"],
  ["badlabel", "public class Main {\n\n  public static void main(String[] args) {\n    for (int i = 0; i < 2; i++) {\n      break outer;\n    }\n  }\n}\n", "Main.java:5: error: undefined label: outer\n      break outer;\n      ^\n1 error"],
  ["staticctx", "public class Main {\n  int count;\n  void inc() { count++; }\n  public static void main(String[] args) {\n    inc();\n    count = 2;\n  }\n}\n", "Main.java:5: error: non-static method inc() cannot be referenced from a static context\n    inc();\n    ^\nMain.java:6: error: non-static variable count cannot be referenced from a static context\n    count = 2;\n    ^\n2 errors"],
];

const SEVERAL: [string, string, string][] = [
  ["a", "public class Main {\n  static int f(int n) {\n    if (n > 0) return 1;\n  }\n  public static void main(String[] args) {\n    int count;\n    count++;\n    int x = \"hello\";\n    System.out.println(y + z);\n  }\n  static class Inner {\n    int g() { String s = 5; }\n  }\n}\n", "Main.java:8: error: incompatible types: String cannot be converted to int\n    int x = \"hello\";\n            ^\nMain.java:9: error: cannot find symbol\n    System.out.println(y + z);\n                       ^\n  symbol:   variable y\n  location: class Main\nMain.java:9: error: cannot find symbol\n    System.out.println(y + z);\n                           ^\n  symbol:   variable z\n  location: class Main\nMain.java:12: error: incompatible types: int cannot be converted to String\n    int g() { String s = 5; }\n                         ^\n4 errors"],
  ["b", "public class Main {\n  static int f(int n) {\n    if (n > 0) return 1;\n  }\n  public static void main(String[] args) {\n    int count;\n    count++;\n  }\n}\nclass Other {\n  void h() { int q = true; }\n}\n", "Main.java:4: error: missing return statement\n  }\n  ^\nMain.java:7: error: variable count might not have been initialized\n    count++;\n    ^\nMain.java:11: error: incompatible types: boolean cannot be converted to int\n  void h() { int q = true; }\n                     ^\n3 errors"],
  ["c", "public class Main {\n  public static void main(String[] args) {\n    double d = 3.7; int n = d;\n    add(1);\n    int m = \"5\" - 1;\n  }\n  static int add(int a, int b) { return a + b; }\n}\n", "Main.java:3: error: incompatible types: possible lossy conversion from double to int\n    double d = 3.7; int n = d;\n                            ^\nMain.java:4: error: method add in class Main cannot be applied to given types;\n    add(1);\n    ^\n  required: int,int\n  found:    int\n  reason: actual and formal argument lists differ in length\nMain.java:5: error: bad operand types for binary operator '-'\n    int m = \"5\" - 1;\n                ^\n  first type:  String\n  second type: int\n3 errors"],
  ["d", "import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n    Foo f = null;\n    foo(1, \"a\");\n    String s = \"x\";\n    s.bar();\n    List<Integer> xs = new ArrayList<>();\n    xs.nope();\n    Math.sqroot(2);\n    int k = s.len;\n  }\n  static class Inner {\n    void g() { System.out.println(q); }\n  }\n}\nclass Other {\n  void h() { System.out.println(w); this.zz(); }\n}\n", "Main.java:4: error: cannot find symbol\n    Foo f = null;\n    ^\n  symbol:   class Foo\n  location: class Main\nMain.java:5: error: cannot find symbol\n    foo(1, \"a\");\n    ^\n  symbol:   method foo(int,String)\n  location: class Main\nMain.java:7: error: cannot find symbol\n    s.bar();\n     ^\n  symbol:   method bar()\n  location: variable s of type String\nMain.java:9: error: cannot find symbol\n    xs.nope();\n      ^\n  symbol:   method nope()\n  location: variable xs of type List<Integer>\nMain.java:10: error: cannot find symbol\n    Math.sqroot(2);\n        ^\n  symbol:   method sqroot(int)\n  location: class Math\nMain.java:11: error: cannot find symbol\n    int k = s.len;\n             ^\n  symbol:   variable len\n  location: variable s of type String\nMain.java:14: error: cannot find symbol\n    void g() { System.out.println(q); }\n                                  ^\n  symbol:   variable q\n  location: class Inner\nMain.java:18: error: cannot find symbol\n  void h() { System.out.println(w); this.zz(); }\n                                ^\n  symbol:   variable w\n  location: class Other\nMain.java:18: error: cannot find symbol\n  void h() { System.out.println(w); this.zz(); }\n                                        ^\n  symbol: method zz()\n9 errors"],
  ["me2", "public class Main {\n  static void f(int a) {}\n  static void g(int a, String b) {}\n  static void v(int... xs) {}\n  Main(int x) {}\n  public static void main(String[] args) {\n    f(\"x\");\n    f(2.5);\n    g(1, 2);\n    v(\"a\");\n    new Main();\n    new Main(\"s\");\n    String s = \"a\";\n    s -= 1;\n    boolean b = 1 && true;\n  }\n}\n", "Main.java:7: error: incompatible types: String cannot be converted to int\n    f(\"x\");\n      ^\nMain.java:8: error: incompatible types: possible lossy conversion from double to int\n    f(2.5);\n      ^\nMain.java:9: error: incompatible types: int cannot be converted to String\n    g(1, 2);\n         ^\nMain.java:10: error: method v in class Main cannot be applied to given types;\n    v(\"a\");\n    ^\n  required: int[]\n  found:    String\n  reason: varargs mismatch; String cannot be converted to int\nMain.java:11: error: constructor Main in class Main cannot be applied to given types;\n    new Main();\n    ^\n  required: int\n  found:    no arguments\n  reason: actual and formal argument lists differ in length\nMain.java:12: error: incompatible types: String cannot be converted to int\n    new Main(\"s\");\n             ^\nMain.java:14: error: bad operand types for binary operator '-'\n    s -= 1;\n      ^\n  first type:  String\n  second type: int\nMain.java:15: error: bad operand types for binary operator '&&'\n    boolean b = 1 && true;\n                  ^\n  first type:  int\n  second type: boolean\nNote: Some messages have been simplified; recompile with -Xdiags:verbose to get full output\n8 errors"],
  ["me3", "import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n    String s = \"abc\";\n    int[] arr = {1, 2};\n    List<Integer> list = new ArrayList<>();\n    System.out.println(s.lenght());\n    System.out.println(arr.length());\n    System.out.println(list.length());\n    System.out.println(Math.sqroot(4));\n  }\n}\n", "Main.java:7: error: cannot find symbol\n    System.out.println(s.lenght());\n                        ^\n  symbol:   method lenght()\n  location: variable s of type String\nMain.java:8: error: cannot find symbol\n    System.out.println(arr.length());\n                          ^\n  symbol:   method length()\n  location: variable arr of type int[]\nMain.java:9: error: cannot find symbol\n    System.out.println(list.length());\n                           ^\n  symbol:   method length()\n  location: variable list of type List<Integer>\nMain.java:10: error: cannot find symbol\n    System.out.println(Math.sqroot(4));\n                           ^\n  symbol:   method sqroot(int)\n  location: class Math\n4 errors"],
  ["notstmt", "public class Main {\n  public static void main(String[] args) {\n    int x = 1;\n    x + 1;\n  }\n}\n", "Main.java:4: error: not a statement\n    x + 1;\n      ^\n1 error"],
  ["notstmt2", "public class Main {\n  public static void main(String[] args) {\n    int x = 1;\n    x;\n    \"hi\";\n  }\n}\n", "Main.java:4: error: not a statement\n    x;\n    ^\nMain.java:5: error: not a statement\n    \"hi\";\n    ^\n2 errors"],
  ["dotsemi", "public class Main {\n  public static void main(String[] args) {\n    String s = \"a\";\n    int n = s.length;\n    int m = s.length();\n  }\n}\n", "Main.java:4: error: cannot find symbol\n    int n = s.length;\n             ^\n  symbol:   variable length\n  location: variable s of type String\n1 error"],
];

const ACCEPTED: [string, string][] = [
  ["captured", "public class Main {\n\n  public static void main(String[] args) {\n    int n = 5;\n    Runnable r = new Runnable() {\n      public void run() { System.out.println(n); }\n    };\n    r.run();\n  }\n}\n"],
  ["iffalse", "public class Main {\n\n  public static void main(String[] args) {\n    if (false) { System.out.println(1); }\n    System.out.println(2);\n  }\n}\n"],
  ["okbranch", "public class Main {\n\n  public static void main(String[] args) {\n    int x;\n    if (args.length > 0) x = 1; else x = 2;\n    System.out.println(x);\n  }\n}\n"],
  ["pattern", "public class Main {\n\n  public static void main(String[] args) {\n    Object o = 5;\n    String s = switch (o) {\n      case Integer i when i > 3 -> \"big\";\n      default -> \"other\";\n    };\n    System.out.println(s);\n  }\n}\n"],
  ["retloop", "public class Main {\n  static int f() {\n    while (true) { }\n  }\n  public static void main(String[] args) {\n    System.out.println(1);\n  }\n}\n"],
  ["retthrow", "public class Main {\n  static int f(int n) {\n    if (n > 0) return 1;\n    throw new IllegalArgumentException();\n  }\n  public static void main(String[] args) {\n    System.out.println(f(1));\n  }\n}\n"],
  ["tryfinally", "public class Main {\n\n  public static void main(String[] args) {\n    int x;\n    try {\n      x = Integer.parseInt(\"1\");\n    } finally {\n      System.out.println(\"f\");\n    }\n    System.out.println(x);\n  }\n}\n"],
  ["iftrue", "public class Main {\n\n  public static void main(String[] args) {\n    int x;\n    if (true) return;\n    System.out.println(x);\n  }\n}\n"],
  ["iftrueelse", "public class Main {\n\n  public static void main(String[] args) {\n    if (true) { return; } else { System.out.println(1); }\n    System.out.println(2);\n  }\n}\n"],
  ["debug", "public class Main {\n  static final boolean DEBUG = false;\n  public static void main(String[] args) {\n    int y;\n    if (DEBUG) { System.out.println(\"debug\"); y = 1; }\n    System.out.println(\"ok\");\n  }\n}\n"],
];

describe('syntax errors, as javac reports them', () => {
  it.each(SYNTAX)('%s', (_name, source, expected) => {
    const lines = compileError(source).stderr!.split('\n');
    // java-parser stops at the first syntax error; javac's first one is the same.
    expect(lines.slice(0, 3).join('\n')).toBe(expected);
    expect(lines.slice(3)).toEqual(['1 error']);
  });

  it('never shows java-parser\'s own message', () => {
    for (const [, source] of SYNTAX) expect(JSON.stringify(compileError(source))).not.toMatch(/Sad sad panda|Expecting|-->/);
  });

  it('turns java-parser\'s message into javac\'s, with the caret where javac puts it', () => {
    const raw = "Sad sad panda, parsing errors detected in line: 2, column: 7!\nExpecting --> ')' <-- but found --> ';' <--!\n\t->compilationUnit\n\t->methodInvocationSuffix";
    expect(describeParseError(raw, 'class A {\n  f(1 ;\n}')).toEqual({ message: "')' or ',' expected", line: 2, column: 6 });
    const eof = "Sad sad panda, parsing errors detected in line: NaN, column: NaN!\nExpecting --> '}' <-- but found --> '' <--!\n\t->compilationUnit";
    expect(describeParseError(eof, 'class A {\n  void f() {}\n\n')).toEqual({ message: 'reached end of file while parsing', line: 2, column: 14 });
  });

  it('finds the lexical errors javac reports, and nothing in valid literals and comments', () => {
    expect(lexicalError('class A { String s = "a\\"b(\'"; char c = \'\\\'\'; char d = \'\\u0041\'; char e = \'\\101\'; /* " */ // \'\n}')).toBeUndefined();
    expect(lexicalError('class A { String t = """\n  a "quoted" \\""" b\n  """; }')).toBeUndefined();
    expect(lexicalError('class A {\n  String t = """\n  never closed\n}')).toEqual({ message: 'unclosed text block', line: 2, column: 14 });
    expect(lexicalError('class A { char c = \'\n\'; }')).toEqual({ message: 'illegal line end in character literal', line: 1, column: 20 });
    expect(lexicalError('class A {\n\tint\u00a0x; }')).toEqual({ message: "illegal character: '\\u00a0'", line: 2, column: 5 });
  });
});

describe('errors javac finds after parsing', () => {
  it.each(FLOW)('%s', (_name, source, expected) => {
    expect(compileError(source).stderr).toBe(expected);
  });

  it.each(ACCEPTED)('accepts what javac accepts: %s', (_name, source) => {
    const reply = runJava(source);
    expect(reply.type === 'result' ? reply.error : reply).toBeUndefined();
  });
});

describe('several errors', () => {
  it.each(SEVERAL)('%s', (_name, source, expected) => {
    expect(compileError(source).stderr).toBe(expected);
  });

  it('reports the first, and the line of each, for the editor to mark', () => {
    const error = compileError(SEVERAL.find(([name]) => name === 'a')![1]);
    expect(error).toMatchObject({ kind: 'compile', message: 'incompatible types: String cannot be converted to int', line: 8, lines: [8, 9, 9, 12] });
  });

  it('keeps an unsupported construct ahead of compile errors', () => {
    const reply = runJava('@interface Tag {}\npublic class Main {\n  public static void main(String[] args) {\n    int x = "a";\n  }\n}');
    expect(reply.type === 'result' && reply.error).toMatchObject({ kind: 'error', message: "Annotation types (@interface) aren't supported in JavaTutor yet", line: 1 });
  });
});

describe('the listing', () => {
  it('keeps tabs before the caret, so it lines up under the source', () => {
    expect(javacListing([{ message: "';' expected", line: 1, column: 7 }], '\tint x\n', 'Main.java')).toBe("Main.java:1: error: ';' expected\n\tint x\n\t     ^\n1 error");
  });

  it('stops at 100 errors, as javac does', () => {
    const errors = Array.from({ length: 102 }, () => ({ message: 'not a statement', line: 1, column: 1 }));
    const lines = javacListing(errors, 'x;', 'Main.java').split('\n');
    expect(lines.filter(l => l.includes('error: not a statement'))).toHaveLength(100);
    expect(lines.slice(-2)).toEqual(['100 errors', 'only showing the first 100 errors, of 102 total; use -Xmaxerrs if you would like to see more']);
  });

  it('names the file after the public class, else the first class', () => {
    expect(javaFileName('class Helper {}\npublic final class Tester {}')).toBe('Tester.java');
    expect(javaFileName('class Helper {}\nclass Other {}')).toBe('Helper.java');
    expect(javaFileName('int x = ;')).toBe('Main.java');
  });
});
