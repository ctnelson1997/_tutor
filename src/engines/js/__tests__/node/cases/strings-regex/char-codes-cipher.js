// charCodeAt, codePointAt, String.fromCharCode in a Caesar cipher that keeps case and skips non-letters
function shiftChar(ch, shift) {
  const code = ch.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return String.fromCharCode(((code - 65 + shift + 26) % 26) + 65);
  }
  if (code >= 97 && code <= 122) {
    return String.fromCharCode(((code - 97 + shift + 26) % 26) + 97);
  }
  return ch;
}

function caesar(text, shift) {
  let result = "";
  for (const ch of text) {
    result += shiftChar(ch, shift);
  }
  return result;
}

const secret = caesar("Hello, World! xyz", 3);
const restored = caesar(secret, -3);
console.log(secret);
console.log(restored);

console.log("A".charCodeAt(0), "a".charCodeAt(0), "0".charCodeAt(0), " ".charCodeAt(0));
console.log("abc".charCodeAt(5), "abc".codePointAt(1), "abc".codePointAt(5));
console.log(String.fromCharCode(72, 105, 33), String.fromCodePoint(9731));

const word = "Zebra";
const codes = [...word].map(c => c.charCodeAt(0));
const sumCodes = codes.reduce((a, b) => a + b, 0);
console.log(codes, sumCodes);
const isUpper = c => c === c.toUpperCase() && c !== c.toLowerCase();
console.log([..."aB3 Cd"].map(isUpper).join(","));
