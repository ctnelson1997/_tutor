// Counts how often each word appears in a paragraph and finds the most common words
const paragraph = "The quick brown fox jumps over the lazy dog. The dog sleeps, and the fox runs away. A quick fox!";

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 0);
}

const words = tokenize(paragraph);
const counts = {};
for (const word of words) {
  if (counts[word]) {
    counts[word] += 1;
  } else {
    counts[word] = 1;
  }
}

console.log("Total words:", words.length);
console.log("Unique words:", Object.keys(counts).length);

const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
const top3 = sorted.slice(0, 3);
for (const [word, count] of top3) {
  console.log(`${word}: ${count}`);
}

let longest = "";
for (const word in counts) {
  if (word.length > longest.length) {
    longest = word;
  }
}
console.log("Longest word:", longest);
const sentences = paragraph.split(/[.!?]/).map(s => s.trim()).filter(s => s !== "");
console.log("Sentences:", sentences.length, sentences);
