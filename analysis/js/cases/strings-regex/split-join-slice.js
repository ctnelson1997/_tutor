// split (separator, limit, regex, empty string), join, slice with negatives, substring's swapped arguments
const csv = "name,age,,city";
const fields = csv.split(",");
console.log(fields, fields.length);
console.log(csv.split(",", 2));
console.log("a1b22c333d".split(/\d+/));
console.log("one  two\tthree".split(/\s+/));
console.log("abc".split(""));
console.log("2024-01-15".split("-").map(Number));

const words = ["keep", "it", "simple"];
const joined = words.join(" ");
const dashed = words.join("-");
console.log(joined, "|", dashed, "|", [1, null, 3, undefined].join("+"));

const text = "JavaScript";
console.log(text.slice(0, 4), text.slice(4), text.slice(-6), text.slice(-6, -2));
console.log(text.substring(4, 0), text.substring(-3, 2), text.slice(5, 2) === "");
const reversed = text.split("").reverse().join("");
console.log(reversed);

const sentence = "the quick brown fox";
const titleCase = sentence
  .split(" ")
  .map(w => w[0].toUpperCase() + w.slice(1))
  .join(" ");
console.log(titleCase);
