// .length counts UTF-16 units: emoji and surrogate pairs vs spread/for...of code points, codePointAt, normalize
const thumbs = "👍";
const family = "👨‍👩‍👧";
const mixed = "hi👋there";

console.log(thumbs.length, [...thumbs].length, Array.from(family).length, family.length);
console.log(mixed.length, [...mixed].length, mixed.indexOf("t"));

console.log(thumbs.charCodeAt(0).toString(16), thumbs.charCodeAt(1).toString(16));
console.log(thumbs.codePointAt(0).toString(16), thumbs.codePointAt(1).toString(16));
console.log(String.fromCodePoint(0x1f600), "\u{1F680}" === "🚀", "🚀" === "🚀");

const reversedBad = mixed.split("").reverse().join("");
const reversedGood = [...mixed].reverse().join("");
console.log(reversedGood, reversedBad === reversedGood, reversedBad.length);

let points = 0;
for (const ch of "a😀b") {
  points++;
  console.log(ch, ch.length, ch.codePointAt(0));
}
console.log("code points:", points);

const composed = "café";
const decomposed = "café";
console.log(composed.length, decomposed.length, composed === decomposed);
console.log(composed === decomposed.normalize("NFC"), decomposed.normalize("NFC").length);
console.log("ÄÖÜ straße".toLowerCase(), "straße".toUpperCase());
