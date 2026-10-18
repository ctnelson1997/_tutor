// A student text-analysis program: word frequencies via regex split, palindromes, longest word, vowel counts
const text = `Anna saw a racecar. The racecar was red;
Anna said: "Wow, a level road!" The road was long.`;

const words = text.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 0);
console.log("word count", words.length);

const freq = {};
for (const w of words) {
  freq[w] = (freq[w] || 0) + 1;
}
const top = Object.entries(freq)
  .filter(([, n]) => n > 1)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([w, n]) => `${w}=${n}`);
console.log(top.join(" "));

function isPalindrome(word) {
  const clean = word.replace(/[^a-z]/gi, "").toLowerCase();
  return clean.length > 1 && clean === [...clean].reverse().join("");
}
const palindromes = [...new Set(words.filter(isPalindrome))];
console.log(palindromes);

let longest = "";
for (const w of words) {
  if (w.length > longest.length) longest = w;
}
const vowels = (text.match(/[aeiou]/gi) || []).length;
const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
console.log(longest, vowels, sentences.length);
console.log(isPalindrome("A man, a plan, a canal: Panama"));
