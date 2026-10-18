// Capitalizes words, reverses word order, and builds initials and title case strings
function capitalize(word) {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.substring(1).toLowerCase();
}

function titleCase(sentence) {
  const small = ["a", "an", "the", "of", "and", "in"];
  const words = sentence.split(" ");
  const result = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase();
    if (i > 0 && small.includes(w)) {
      result.push(w);
    } else {
      result.push(capitalize(w));
    }
  }
  return result.join(" ");
}

function reverseWords(sentence) {
  return sentence.split(" ").reverse().join(" ");
}

function reverseEachWord(sentence) {
  let out = [];
  for (const word of sentence.split(" ")) {
    let reversed = "";
    for (let i = word.length - 1; i >= 0; i--) {
      reversed += word[i];
    }
    out.push(reversed);
  }
  return out.join(" ");
}

function initials(fullName) {
  return fullName.split(" ").map(part => part[0].toUpperCase() + ".").join("");
}

const title = "the lord OF the rings and the return of the king";
const fixedTitle = titleCase(title);
console.log(fixedTitle);
console.log(reverseWords("one two three four"));
console.log(reverseEachWord("hello world from js"));
const people = ["ada lovelace", "alan mathison turing", "grace hopper"];
const allInitials = people.map(initials);
console.log(allInitials);
const longWords = title.toUpperCase().split(" ").filter(w => w.length > 3);
console.log(longWords);
console.log("Index of 'rings':", fixedTitle.indexOf("Rings"), "ends with King?", fixedTitle.endsWith("King"));
