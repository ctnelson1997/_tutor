/**
 * Integer, floating-point, string, char and text-block literal values
 * (literals.ts). Expected values were checked against real `java` (JDK 21).
 */
import { describe, it, expect } from 'vitest';
import {
  unescapeJava, escapeJava, stringLiteral, charLiteral, stringLiteralValue, charLiteralValue, textBlockValue, integerLiteralValue, floatingLiteralValue,
} from '../literals';

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

describe('integerLiteralValue', () => {
  it('reads decimal, hex, octal and binary digits, with underscores and an L suffix', () => {
    expect(integerLiteralValue('255')).toEqual({ type: 'int', value: 255 });
    expect(integerLiteralValue('0xFF')).toEqual({ type: 'int', value: 255 });
    expect(integerLiteralValue('017')).toEqual({ type: 'int', value: 15 });
    expect(integerLiteralValue('0b101')).toEqual({ type: 'int', value: 5 });
    expect(integerLiteralValue('1_000_000')).toEqual({ type: 'int', value: 1000000 });
    expect(integerLiteralValue('0')).toEqual({ type: 'int', value: 0 });
    expect(integerLiteralValue('3000000000L')).toEqual({ type: 'long', value: 3000000000n });
    expect(integerLiteralValue('0x7fff_ffff_ffff_ffffl')).toEqual({ type: 'long', value: 9223372036854775807n });
  });

  it('lets hex, octal and binary use every bit, and wraps the decimal minimum', () => {
    expect(integerLiteralValue('0xFFFFFFFF')).toEqual({ type: 'int', value: -1 });
    expect(integerLiteralValue('0x80000000')).toEqual({ type: 'int', value: -2147483648 });
    expect(integerLiteralValue('0xFFFFFFFFFFFFFFFFL')).toEqual({ type: 'long', value: -1n });
    expect(integerLiteralValue('2147483648')).toEqual({ type: 'int', value: -2147483648 }); // only legal as -2147483648
    expect(integerLiteralValue('9223372036854775808L')).toEqual({ type: 'long', value: -9223372036854775808n });
  });

  it("is undefined for a value that doesn't fit, as javac rejects it", () => {
    expect(integerLiteralValue('2147483649')).toBeUndefined();
    expect(integerLiteralValue('0x100000000')).toBeUndefined();
    expect(integerLiteralValue('9223372036854775809L')).toBeUndefined();
    expect(integerLiteralValue('09')).toBeUndefined();
  });
});

describe('floatingLiteralValue', () => {
  it('reads doubles and floats, with underscores and suffixes', () => {
    expect(floatingLiteralValue('1.5')).toEqual({ type: 'double', value: 1.5 });
    expect(floatingLiteralValue('1_000.25d')).toEqual({ type: 'double', value: 1000.25 });
    expect(floatingLiteralValue('.5')).toEqual({ type: 'double', value: 0.5 });
    expect(floatingLiteralValue('5.')).toEqual({ type: 'double', value: 5 });
    expect(floatingLiteralValue('1e10')).toEqual({ type: 'double', value: 1e10 });
    expect(floatingLiteralValue('1.1f')).toEqual({ type: 'float', value: Math.fround(1.1) });
    expect(floatingLiteralValue('0.0F')).toEqual({ type: 'float', value: 0 });
  });

  it('is undefined for a value too large, or too small but not zero, for its type', () => {
    expect(floatingLiteralValue('1e40f')).toBeUndefined();
    expect(floatingLiteralValue('1e-50f')).toBeUndefined();
    expect(floatingLiteralValue('1e400')).toBeUndefined();
    expect(floatingLiteralValue('0e400')).toEqual({ type: 'double', value: 0 });
  });
});

describe('escapeJava', () => {
  it('writes text as a string literal body would', () => {
    expect(escapeJava('5\nhello\tworld\r\n')).toBe('5\\nhello\\tworld\\r\\n');
    expect(escapeJava('say "hi" \\ bye')).toBe('say \\"hi\\" \\\\ bye');
    expect(escapeJava('\b\f\u0007\u007f')).toBe('\\b\\f\\u0007\\u007f');
    expect(escapeJava('plain text, é ✓')).toBe('plain text, é ✓');
  });

  it('writes string and char literals', () => {
    expect(stringLiteral('a\n"b"')).toBe('"a\\n\\"b\\""');
    expect(charLiteral(66)).toBe("'B'");
    expect(charLiteral(10)).toBe("'\\n'");
    expect(charLiteral(0)).toBe("'\\u0000'");
    expect(charLiteral(0x27)).toBe("'\\''");
    expect(charLiteral(0x22)).toBe(`'"'`);
    expect(charLiteral(0x5c)).toBe("'\\\\'");
    expect(charLiteral(0xd83d)).toBe("'\\ud83d'"); // half of an emoji
    expect(charLiteral(0xe9)).toBe("'é'");
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
