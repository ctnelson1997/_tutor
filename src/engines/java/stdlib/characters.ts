/**
 * java.lang.Character's tests, case mappings and numeric values (#66), on a
 * code point (a char is one UTF-16 code unit, a lone surrogate being no
 * letter), by Unicode's properties as the JDK defines each test: `isLetter`
 * is any letter (`é`, `ß`, `Ω`, `中`), `isDigit` any decimal digit (`٣`),
 * `isWhitespace` Java's own set (no non-breaking spaces, but `\t` and the
 * information separators), `isSpaceChar` the space separators only.
 */

const property = (re: RegExp) => (cp: number) => re.test(String.fromCodePoint(cp));

const SPACE_SEPARATOR = /[\p{Zs}\p{Zl}\p{Zp}]/u;

/** Character.isWhitespace: a space separator other than a non-breaking one, or \t \n \u000B \f \r and \u001C–\u001F. */
export function isJavaWhitespace(cp: number): boolean {
  if ((cp >= 0x09 && cp <= 0x0d) || (cp >= 0x1c && cp <= 0x1f)) return true;
  if (cp === 0xa0 || cp === 0x2007 || cp === 0x202f) return false;
  return SPACE_SEPARATOR.test(String.fromCodePoint(cp));
}

/** The Character methods that test a char or code point, by name. */
export const CHARACTER_TESTS: Record<string, (cp: number) => boolean> = {
  isLetter: property(/\p{L}/u),
  isDigit: property(/\p{Nd}/u),
  isLetterOrDigit: property(/[\p{L}\p{Nd}]/u),
  isAlphabetic: property(/\p{Alphabetic}/u),
  isUpperCase: property(/\p{Uppercase}/u),
  isLowerCase: property(/\p{Lowercase}/u),
  isTitleCase: property(/\p{Lt}/u),
  isWhitespace: isJavaWhitespace,
  isSpaceChar: property(SPACE_SEPARATOR),
  isISOControl: cp => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f),
  isJavaIdentifierStart: property(/[\p{L}\p{Nl}\p{Sc}\p{Pc}]/u),
  isJavaIdentifierPart: cp => (cp >= 0 && cp <= 8) || (cp >= 0x0e && cp <= 0x1b) || (cp >= 0x7f && cp <= 0x9f)
    || /[\p{L}\p{Nl}\p{Sc}\p{Pc}\p{Nd}\p{Mn}\p{Mc}\p{Cf}]/u.test(String.fromCodePoint(cp)),
  isSurrogate: cp => cp >= 0xd800 && cp <= 0xdfff,
  isHighSurrogate: cp => cp >= 0xd800 && cp <= 0xdbff,
  isLowSurrogate: cp => cp >= 0xdc00 && cp <= 0xdfff,
};

/**
 * Character.toUpperCase: Unicode's single-character mapping, so `ß` stays
 * `ß` (String.toUpperCase makes it `SS`); the Greek letters with a
 * subscript iota map to their title-case forms, as UnicodeData has them.
 */
export function toUpperCaseChar(cp: number): number {
  if (cp >= 0x1f80 && cp <= 0x1faf && (cp & 0xf) < 8) return cp + 8;
  if (cp === 0x1fb3 || cp === 0x1fc3 || cp === 0x1ff3) return cp + 9;
  const upper = String.fromCodePoint(cp).toUpperCase();
  return upper.length === (cp > 0xffff ? 2 : 1) ? upper.codePointAt(0)! : cp;
}

/** Character.toLowerCase: the single-character mapping (`İ` is `i`). */
export function toLowerCaseChar(cp: number): number {
  if (cp === 0x130) return 0x69;
  const lower = String.fromCodePoint(cp).toLowerCase();
  return lower.length === (cp > 0xffff ? 2 : 1) ? lower.codePointAt(0)! : cp;
}

const DECIMAL_DIGIT = /\p{Nd}/u;
const ROMAN: Record<number, number> = { 0x216c: 50, 0x216d: 100, 0x216e: 500, 0x216f: 1000, 0x2180: 1000, 0x2181: 5000, 0x2182: 10000, 0x2185: 6, 0x2186: 50, 0x2187: 50000, 0x2188: 100000 };

/**
 * Character.getNumericValue: a decimal digit's value (of any script: Unicode
 * puts each script's digits 0–9 in a row), a Latin letter's as a digit of
 * radix 36 (`a` is 10, fullwidth ones too), Roman numerals, superscript,
 * subscript and circled digits; -2 for a fraction (`½`), -1 for the rest.
 */
export function numericValue(cp: number): number {
  const isDigit = (c: number) => DECIMAL_DIGIT.test(String.fromCodePoint(c));
  if (isDigit(cp)) {
    let run = 0;
    while (isDigit(cp - run - 1)) run++;
    return run % 10;
  }
  for (const [a, z] of [[0x61, 0x7a], [0x41, 0x5a], [0xff41, 0xff5a], [0xff21, 0xff3a]]) if (cp >= a && cp <= z) return cp - a + 10;
  if (cp >= 0x2160 && cp <= 0x216b) return cp - 0x2160 + 1;
  if (cp >= 0x2170 && cp <= 0x217b) return cp - 0x2170 + 1;
  if (ROMAN[cp] !== undefined) return ROMAN[cp];
  if (cp >= 0x217c && cp <= 0x217f) return ROMAN[cp - 0x10];
  if (cp === 0xb9) return 1;
  if (cp === 0xb2 || cp === 0xb3) return cp - 0xb0;
  if (cp === 0x2070) return 0;
  if (cp >= 0x2074 && cp <= 0x2079) return cp - 0x2070;
  if (cp >= 0x2080 && cp <= 0x2089) return cp - 0x2080;
  if (cp >= 0x2460 && cp <= 0x2473) return cp - 0x2460 + 1;
  if (/\p{No}/u.test(String.fromCodePoint(cp)) && /[¼-¾⅐-⅟↉]/.test(String.fromCodePoint(cp))) return -2;
  return -1;
}
