// replace (first only) vs replaceAll, at() with negative indexes, indexOf/lastIndexOf/includes/startsWith/endsWith
const phrase = "the cat sat on the mat with the hat";
const once = phrase.replace("the", "a");
const all = phrase.replaceAll("the", "a");
console.log(once);
console.log(all);
console.log("a.b.c".replaceAll(".", "/"), "aaa".replaceAll("a", "aa"));

const word = "elephant";
console.log(word.at(0), word.at(-1), word.at(-3), word.at(20), word[20]);
console.log(word.charAt(2), word.charAt(99) === "");

console.log(phrase.indexOf("at"), phrase.indexOf("at", 6), phrase.lastIndexOf("at"));
console.log(phrase.indexOf("dog"), phrase.includes("mat"), phrase.includes("Mat"));
console.log(phrase.startsWith("the"), phrase.startsWith("cat", 4), phrase.endsWith("hat"));

let count = 0;
let pos = phrase.indexOf("the");
while (pos !== -1) {
  count++;
  pos = phrase.indexOf("the", pos + 1);
}
console.log("'the' appears", count, "times");

const filename = "report.final.v2.pdf";
const ext = filename.slice(filename.lastIndexOf(".") + 1);
const base = filename.slice(0, filename.lastIndexOf("."));
console.log(base, ext, filename.toUpperCase().endsWith(".PDF"));
