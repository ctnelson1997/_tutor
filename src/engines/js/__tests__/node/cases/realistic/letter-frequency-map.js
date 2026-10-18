// Counts letter frequencies with a Map, prints a bar chart of the top letters and groups words
const text = "Mississippi river runs past many sleepy towns";
const freq = new Map();
for (const ch of text.toLowerCase()) {
  if (ch === " ") continue;
  freq.set(ch, (freq.get(ch) || 0) + 1);
}
console.log("Distinct letters:", freq.size);

const top = [...freq.entries()]
  .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  .slice(0, 5);
for (const [letter, count] of top) {
  console.log(letter + " " + "#".repeat(count) + " " + count);
}
console.log("Has 'z'?", freq.has("z"), "count of 'r':", freq.get("r"));

const wordsByLetter = new Map();
for (const word of text.toLowerCase().split(" ")) {
  const first = word[0];
  if (!wordsByLetter.has(first)) {
    wordsByLetter.set(first, []);
  }
  wordsByLetter.get(first).push(word);
}
wordsByLetter.forEach((words, letter) => {
  console.log(`${letter}: ${words.join(", ")}`);
});

const vowels = new Map();
for (const v of "aeiou") {
  vowels.set(v, freq.get(v) ?? 0);
}
vowels.delete("o");
console.log(vowels);
const asObject = Object.fromEntries(vowels);
console.log(asObject);
