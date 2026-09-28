/**
 * String, char and text-block literal values (literals.ts). Expected values
 * were checked against real `java` (JDK 21).
 */
import { describe, it, expect } from 'vitest';
import { unescapeJava, escapeJava, stringLiteralValue, charLiteralValue, textBlockValue } from '../literals';

describe('unescapeJava', () => {
  it('translates escapes in one pass, so \\\\n is a backslash and an n', () => {
    expect(unescapeJava('a\\tb\\nc')).toBe('a\tb\nc');
    expect(unescapeJava('\\\\n is two chars')).toBe('\\n is two chars');
    expect(unescapeJava('\\"q\\" \\\'s\\\' \\b\\f\\r\\s')).toBe('"q" \'s\' \b\f\r ');
  });

  it('reads octal escapes of up to three digits, and two when the first is 4 to 7', () => {
    expect(unescapeJava('\\0\\7\\77\\101\\1011')).toBe('\0\x07?AA1');
    expect(unescapeJava('\\477')).toBe("'7");
  });

  it('reads Unicode escapes, unless their backslash is itself escaped', () => {
    expect(unescapeJava('\\u0041\\uu0042')).toBe('AB');
    expect(unescapeJava('\\\\u0041')).toBe('\\u0041');
    expect(unescapeJava('\\u005c\\u005c')).toBe('\\');
  });

  it('joins lines at a backslash before a line break (text blocks)', () => {
    expect(unescapeJava('one \\\ntwo')).toBe('one two');
  });
});

describe('escapeJava', () => {
  it('writes text as a string literal body would', () => {
    expect(escapeJava('5\nhello\tworld\r\n')).toBe('5\\nhello\\tworld\\r\\n');
    expect(escapeJava('say "hi" \\ bye')).toBe('say \\"hi\\" \\\\ bye');
    expect(escapeJava('\b\f\u0007\u007f')).toBe('\\b\\f\\u0007\\u007f');
    expect(escapeJava('plain text, é ✓')).toBe('plain text, é ✓');
  });

  it('is undone by unescapeJava', () => {
    const text = 'a\n"b"\\c\u0001\td';
    expect(unescapeJava(escapeJava(text))).toBe(text);
  });
});

describe('string and char literals', () => {
  it('strips the quotes and translates escapes', () => {
    expect(stringLiteralValue('"tab\\there"')).toBe('tab\there');
    expect(stringLiteralValue('""')).toBe('');
    expect(charLiteralValue("'A'")).toBe(65);
    expect(charLiteralValue("'\\n'")).toBe(10);
    expect(charLiteralValue("'\\''")).toBe(39);
    expect(charLiteralValue("'\\u0000'")).toBe(0);
    expect(charLiteralValue("'\\\\'")).toBe(92);
  });
});

describe('textBlockValue', () => {
  const block = (...lines: string[]) => '"""\n' + lines.join('\n') + '"""';

  it('removes the indentation shared by the lines, counting the closing delimiter line', () => {
    expect(textBlockValue(block('        hello', '          world', '        '))).toBe('hello\n  world\n');
    expect(textBlockValue(block('            deep', '        '))).toBe('    deep\n');
  });

  it('ends without a newline when the closing delimiter follows the text', () => {
    expect(textBlockValue(block('        hello', '          world'))).toBe('hello\n  world');
  });

  it('drops trailing spaces unless escaped, and keeps blank lines empty', () => {
    expect(textBlockValue(block('        trailing   ', '        kept\\s', '        '))).toBe('trailing\nkept \n');
    expect(textBlockValue(block('        x', '', '        y', '        '))).toBe('x\n\ny\n');
  });

  it('translates escapes after removing indentation', () => {
    expect(textBlockValue(block('        one \\', '        two', '        '))).toBe('one two\n');
    expect(textBlockValue(block('        \\ttab', '        '))).toBe('\ttab\n');
    expect(textBlockValue(block('        say \\"""hi\\"""', '        '))).toBe('say """hi"""\n');
  });

  it('reads Windows line breaks as \\n', () => {
    expect(textBlockValue('"""\r\n    a\r\n    b\r\n    """')).toBe('a\nb\n');
  });
});
