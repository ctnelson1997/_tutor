/**
 * String, StringBuilder and wrapper methods, string identity, and Java
 * regular expressions (#20). Expected values were checked against JDK 21.
 */
import { describe, it, expect } from 'vitest';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';
import { javaRegex, javaSplit, javaReplacement, groupCount, patternError, patternSyntaxMessage } from '../stdlib/regex';
import { CHARACTER_TESTS, toUpperCaseChar, toLowerCaseChar, numericValue } from '../stdlib/characters';
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

  it("refuse what Java's Pattern refuses, with its description and index (#66, JDK 21's)", () => {
    const table: [string, string, number][] = [
      ['+', "Dangling meta character '+'", 0], ['*a', "Dangling meta character '*'", 0], ['a|*', "Dangling meta character '*'", 2],
      ['(+a)', "Dangling meta character '+'", 1], ['a**', "Dangling meta character '*'", 2], ['a{', 'Illegal repetition', 2],
      ['a{2', 'Unclosed counted closure', 3], ['a{x}', 'Illegal repetition', 2], ['(a', 'Unclosed group', 2], ['((a)', 'Unclosed group', 4],
      ['a)', "Unmatched closing ')'", 0], [')', "Unmatched closing ')'", -1], ['[a', 'Unclosed character class', 1],
      ['[a-', 'Illegal character range', 3], ['[b-a]', 'Illegal character range', 3], ['a{2,1}', 'Illegal repetition range', 5],
      ['\\', 'Unescaped trailing backslash', 1], ['\\k', "\\k is not followed by '<' for named capturing group", 2],
      ['(?<n', "named capturing group is missing trailing '>'", 4], ['(?<n>a', 'Unclosed group', 6], ['[]', 'Unclosed character class', 1],
      ['[^]', 'Unclosed character class', 2], ['x{,3}', 'Illegal repetition', 2], ['a{99999999999}', 'Illegal repetition range', 11],
      ['(?<1a>x)', 'capturing group name does not start with a Latin letter', 3], ['[[a]', 'Unclosed character class', 3],
      ['\\p{Foo}', 'Unknown character property name {Foo}', 6], ['\\xZZ', 'Illegal hexadecimal escape sequence', 2],
      ['\\u12', 'Illegal Unicode escape sequence', 4], ['\\c', 'Illegal control escape sequence', 1],
      ['a{2}+?', "Dangling meta character '?'", 5], ['a*??', "Dangling meta character '?'", 3],
    ];
    for (const [pattern, desc, index] of table) expect([pattern, patternError(pattern)]).toEqual([pattern, { desc, index }]);
    for (const ok of ['{2}a', 'a|', '|a', '()', '(?:ab)+', '(?=x)y', '(?!x)y*', '(?<=a)b', '(?<name>a)+\\k<name>', '(?i)ab+', '(?i:ab)+', 'a*?', 'a+?b', '[a-z]{2,}', '\\p{Alpha}+', '[\\]-]', '\\Q+*\\E+', 'a{2}?']) {
      expect([ok, patternError(ok)]).toEqual([ok, undefined]);
    }
    expect(patternSyntaxMessage("Dangling meta character '+'", '+', 0)).toBe("Dangling meta character '+' near index 0\n+\n^");
    expect(patternSyntaxMessage('Unclosed group', '(a', 2)).toBe('Unclosed group near index 2\n(a');
    expect(patternSyntaxMessage("Unmatched closing ')'", ')', -1)).toBe("Unmatched closing ')'\n)");
  });

  it("match as Java's do: \\R, ASCII \\s, class unions, matches() over the whole string whatever the flags (#66)", () => {
    expect(javaSplit('a\r\nb\nc\rd', '\\R')).toEqual(['a', 'b', 'c', 'd']);
    expect('a\u00a0b c'.replace(javaRegex('\\s', 'g'), '_')).toBe('a\u00a0b_c');
    expect(javaRegex('[a-d[m-z]]').test('x')).toBe(true);
    expect(javaRegex('[a-d[m-z]]').test('h')).toBe(false);
    expect(javaRegex('{2}a').test('{2}a')).toBe(true);
    expect(stdout('System.out.println("ab\\ncd".matches("(?m)ab") + " " + "ab\\ncd".matches("(?ms)ab.cd") + " " + "ab".matches("a|ab"));')).toBe('false true true');
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
    expect(stdout('char[] cs = {\'a\'};\n    new String(cs, 0, 5);')).toContain('StringIndexOutOfBoundsException: Range [0, 0 + 5) out of bounds for length 1');
  });

  it('stream their characters with chars() (#16)', () => {
    expect(stdout(`System.out.println("hello".chars().filter(c -> c == 'l').count() + " " + "a\\nb\\n".lines().count());`)).toBe('2 2');
  });
});

describe("Character's tests (#66), JDK 21's answers", () => {
  it('know every script, Java whitespace and single-character case mappings', () => {
    const answers = (c: number) => ['isLetter', 'isDigit', 'isAlphabetic', 'isUpperCase', 'isLowerCase', 'isWhitespace', 'isSpaceChar', 'isTitleCase']
      .filter(t => CHARACTER_TESTS[t](c)).join(' ');
    expect(answers(0xe9)).toBe('isLetter isAlphabetic isLowerCase');
    expect(answers(0x3a9)).toBe('isLetter isAlphabetic isUpperCase');
    expect(answers(0x4e2d)).toBe('isLetter isAlphabetic');
    expect(answers(0x663)).toBe('isDigit');
    expect(answers(0x09)).toBe('isWhitespace');
    expect(answers(0xa0)).toBe('isSpaceChar');
    expect(answers(0x2007)).toBe('isSpaceChar');
    expect(answers(0x2003)).toBe('isWhitespace isSpaceChar');
    expect(answers(0x1c)).toBe('isWhitespace');
    expect(answers(0x1c5)).toBe('isLetter isAlphabetic isTitleCase');
    expect(answers(0x2177)).toBe('isAlphabetic isLowerCase');
    expect(answers(0xd83d)).toBe('');
    expect([toUpperCaseChar(0xdf), toUpperCaseChar(0xe9), toUpperCaseChar(0x1c5), toUpperCaseChar(0x1f80), toUpperCaseChar(0x1fb3), toLowerCaseChar(0x130), toLowerCaseChar(0x1c5)])
      .toEqual([0xdf, 0xc9, 0x1c4, 8072, 8124, 105, 454]);
    expect([0x31, 0x61, 0x5a, 0x663, 0x966, 0x216b, 0x216c, 0x2177, 0xb2, 0xbd, 0x2460, 0xff41, 0x5f].map(numericValue))
      .toEqual([1, 10, 35, 3, 0, 12, 50, 8, 2, -2, 1, 10, -1]);
  });

  it("String's methods by them: letters counted in any script, strip() and isBlank() by Java's whitespace, chars in UTF-16", () => {
    expect(stdout(`int n = 0; for (char c : "Caf\u00e9 cr\u00e8me br\u00fbl\u00e9e, na\u00efve r\u00e9sum\u00e9!".toCharArray()) if (Character.isLetter(c)) n++;
    System.out.println(n + " " + (int) Character.toUpperCase('\u00df') + " [" + "\u2003x\u00a0".strip() + "] " + "\u00a0".isBlank());
    System.out.println("a\uD83D\uDE00bc".toCharArray().length + " " + "a\uD83D\uDE00bc".chars().count() + " " + "a\uD83D\uDE00bc".codePoints().count());`))
      .toBe('26 223 [x\u00a0] false\n5 5 4');
  });

  it('refuse null arguments with the NullPointerException the JDK throws', () => {
    expect(stdout('String n = null;\n    try { "abc".concat(n); } catch (NullPointerException e) { System.out.println(e.getMessage()); }\n    try { "abc".replace(n, "x"); } catch (NullPointerException e) { System.out.println(e.getMessage()); }\n    System.out.println("abc".equals(n) + " " + String.valueOf((Object) n));'))
      .toBe('Cannot invoke "String.isEmpty()" because "str" is null\nCannot invoke "java.lang.CharSequence.toString()" because "target" is null\nfalse null');
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
