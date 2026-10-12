/**
 * String, StringBuilder and wrapper methods, string identity, and Java
 * regular expressions (#20). Expected values were checked against JDK 21.
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import { javaRegex, javaSplit, javaReplacement, groupCount } from '../stdlib/regex';
import { compareStrings, compareIgnoringCase, stringHashCode, boxedHashCode } from '../stdlib/strings';
import { javaString, internedString, sameString } from '../types';

function stdout(body: string): string {
  const source = `import java.util.*;\npublic class Main {\n  public static void main(String[] args) {\n    ${body}\n  }\n}`;
  const result = new JavaInterpreter('yes').execute(parseJava(source));
  if (result.error) return `ERROR ${result.error}`;
  return result.snapshots.at(-1)?.stdout.join('\n') ?? '';
}

describe('Java regular expressions', () => {
  it('split as Pattern.split does', () => {
    expect(javaSplit('the   quick  brown fox', '\\s+')).toEqual(['the', 'quick', 'brown', 'fox']);
    expect(javaSplit('a,b,,', ',')).toEqual(['a', 'b']); // trailing empty strings removed
    expect(javaSplit('a,b,,', ',', -1)).toEqual(['a', 'b', '', '']);
    expect(javaSplit('a,b,c,d', ',', 2)).toEqual(['a', 'b,c,d']);
    expect(javaSplit('a,b', ',', 1)).toEqual(['a,b']);
    expect(javaSplit('', ',')).toEqual(['']);
    expect(javaSplit(',a,b', ',')).toEqual(['', 'a', 'b']); // a leading empty string stays
    expect(javaSplit('abc', '')).toEqual(['a', 'b', 'c']); // but not for a zero-width match at the start
    expect(javaSplit('x1y22z', '[0-9]+')).toEqual(['x', 'y', 'z']);
    expect(javaSplit('no match', ',')).toEqual(['no match']);
  });

  it('translate what JavaScript writes differently', () => {
    expect(javaRegex('(?i)h').test('H')).toBe(true);
    expect(javaRegex('\\Qa.b\\E').test('axb')).toBe(false);
    expect(javaRegex('\\Qa.b\\E').test('a.b')).toBe(true);
    expect(javaRegex('\\p{Alpha}+').exec('12ab3')?.[0]).toBe('ab');
    expect(javaRegex('[\\p{Digit}x]+').exec('ab1x2')?.[0]).toBe('1x2');
    expect(javaRegex('\\AHi\\z').test('Hi')).toBe(true);
    expect(javaRegex('a*?b').exec('aab')?.[0]).toBe('aab'); // a lazy quantifier is fine
  });

  it("reject what JavaScript can't run the same way", () => {
    expect(() => javaRegex('a*+')).toThrow("Regular expressions with possessive quantifiers (a*+) aren't supported");
    expect(() => javaRegex('(?>ab)')).toThrow('atomic groups');
    expect(() => javaRegex('[a-z&&[^aeiou]]')).toThrow('character class intersections');
    expect(() => javaRegex('\\p{IsGreek}')).toThrow('the class');
    expect(() => javaRegex('a(?i)b')).toThrow('inline flags inside the pattern');
    expect(() => javaRegex('(')).toThrow('PatternSyntaxException');
  });

  it("build replacements with Java's $ and \\ rules", () => {
    const re = javaRegex('(\\w+) (\\w+)');
    const build = javaReplacement('$2, $1', groupCount(re));
    expect(build(['John Smith', 'John', 'Smith'])).toBe('Smith, John');
    expect(javaReplacement('\\$', 0)([''])).toBe('$');
    expect(() => javaReplacement('$', 0)).toThrow('Illegal group reference');
    expect(() => javaReplacement('$3', 2)).toThrow('No group 3');
    expect(javaReplacement('${word}!', 1)(['x', 'x'], { word: 'hey' })).toBe('hey!');
  });
});

describe('String methods', () => {
  it('compare by the first differing char, then by length', () => {
    expect(compareStrings('apple', 'cherry')).toBe(-2);
    expect(compareStrings('abc', 'abcde')).toBe(-2);
    expect(compareIgnoringCase('Hello', 'hellO')).toBe(0);
    expect(compareIgnoringCase('abc', 'ABD')).toBe(-1);
    expect(stringHashCode('hello')).toBe(99162322);
    expect(stringHashCode('Hello, World! 123')).toBe(-923734105);
  });

  it('check bounds with Java\'s messages', () => {
    expect(stdout('"abc".charAt(5);')).toContain('StringIndexOutOfBoundsException: Index 5 out of bounds for length 3');
    expect(stdout('"abc".substring(2, 1);')).toContain('Range [2, 1) out of bounds for length 3');
    expect(stdout('"x".repeat(-1);')).toContain('IllegalArgumentException: count is negative: -1');
    expect(stdout('System.out.println("abc".substring(1) + "banana".lastIndexOf("an", 2) + "banana".indexOf(\'n\', 3));')).toBe('bc14');
  });

  it('build new strings with new String(…) and String.valueOf', () => {
    expect(stdout('char[] cs = {\'o\', \'e\', \'l\'};\n    System.out.println(new String(cs) + String.valueOf(cs) + new String(cs, 1, 2) + new String(new StringBuilder("sb")));')).toBe('oeloelelsb');
    expect(stdout('char[] cs = {\'a\'};\n    new String(cs, 0, 5);')).toContain('StringIndexOutOfBoundsException: offset 0, count 5, length 1');
  });

  it('reject streams', () => {
    expect(stdout('long n = "ab".chars().count();')).toContain("Streams (String.chars()) aren't supported in JavaTutor yet");
  });
});

describe('string identity (==)', () => {
  it('keeps literals interned and run-time strings distinct', () => {
    expect(sameString(internedString('hi'), internedString('hi'))).toBe(true);
    expect(sameString(javaString('hi'), internedString('hi'))).toBe(false);
    const s = javaString('hi');
    expect(sameString(s, s)).toBe(true);
  });

  it('compares strings as Java does', () => {
    const out = stdout(`String hi = "hi";
    String part = "h";
    Scanner in = new Scanner(System.in);
    String answer = in.next();
    System.out.println((hi == "hi") + " " + (hi == "h" + "i") + " " + (hi == part + "i") + " " + (hi == new String("hi")) + " " + (answer == "yes") + " " + answer.equals("yes"));
    System.out.println((hi == (part + "i").intern()) + " " + (hi == hi.trim()) + " " + (hi == hi.toUpperCase()) + " " + (hi == hi.toLowerCase()) + " " + (hi == new StringBuilder("hi").toString()) + " " + (hi == String.valueOf(hi)));`);
    expect(out).toBe('true true false false false true\ntrue true false true false true');
  });

  it('still switches and hashes strings by their characters', () => {
    const out = stdout(`Scanner in = new Scanner(System.in);
    String answer = in.next();
    switch (answer) { case "yes": System.out.println("matched"); break; default: System.out.println("no"); }
    Set<String> set = new HashSet<>();
    set.add("yes");
    System.out.println(set.contains(answer));`);
    expect(out).toBe('matched\ntrue');
  });
});

describe('StringBuilder methods', () => {
  it('edit in place and check bounds', () => {
    expect(stdout(`StringBuilder sb = new StringBuilder("hello world");
    sb.setCharAt(0, 'H');
    sb.delete(5, 11);
    sb.append('!').insert(0, 42).insert(2, ' ').replace(3, 8, "HEY");
    System.out.println(sb + " " + sb.indexOf("E") + " " + sb.lastIndexOf("!") + " " + sb.length() + " " + sb.charAt(1));`)).toBe('42 HEY! 4 6 7 2');
    expect(stdout('new StringBuilder("ab").charAt(9);')).toContain('Index 9 out of bounds for length 2');
    expect(stdout('new StringBuilder("ab").insert(9, "x");')).toContain('Range [9, 2) out of bounds for length 2');
    expect(stdout('StringBuilder sb = new StringBuilder("ab");\n    System.out.println(sb.equals(new StringBuilder("ab")) + " " + sb.equals(sb) + " " + sb.reverse());')).toBe('false true ba');
  });
});

describe('boxed values', () => {
  it('have the wrappers\' instance methods', () => {
    expect(stdout(`Integer x = 5; Integer y = 7; Double z = 2.9; Long big = 3L; Character c = 'q'; Boolean b = true;
    System.out.println(x.compareTo(y) + " " + x.equals(5) + " " + x.equals(5L) + " " + z.intValue() + " " + x.doubleValue() + " " + big.intValue() + " " + c.charValue() + " " + b.booleanValue());
    System.out.println(x.hashCode() + " " + z.hashCode() + " " + big.hashCode() + " " + z.compareTo(3.0) + " " + c.compareTo('a') + " " + b.compareTo(false));`)).toBe('-1 true false 2 5.0 3 q true\n5 1932787712 3 -1 16 1');
    expect(boxedHashCode({ kind: 'primitive', javaType: 'double', value: 1.5 })).toBe(1073217536);
    expect(boxedHashCode({ kind: 'primitive', javaType: 'boolean', value: true })).toBe(1231);
    expect(stdout('System.out.println(Double.hashCode(1.5) + " " + Boolean.hashCode(true) + " " + Character.hashCode(\'a\') + " " + Integer.hashCode(9));')).toBe('1073217536 1231 97 9');
  });
});
