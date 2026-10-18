// padStart/padEnd for a formatted table, repeat for bars, trim/trimStart/trimEnd on messy input
const rows = [
  ["Alice", 93.5],
  ["Bob", 7],
  ["Charlotte", 45.25],
];

const header = "Name".padEnd(10) + "|" + "Score".padStart(7);
console.log(header);
console.log("-".repeat(header.length));
for (const [name, score] of rows) {
  const bar = "#".repeat(Math.round(score / 10));
  console.log(name.padEnd(10, ".") + "|" + score.toFixed(1).padStart(7) + " " + bar);
}

const ids = [7, 42, 315].map(n => String(n).padStart(5, "0"));
console.log(ids.join(" "));
console.log("abc".padStart(2), "abc".padEnd(6, "12345"), "x".repeat(0) === "");

const messy = "   \t  hello world \n ";
const cleaned = messy.trim();
console.log(JSON.stringify(messy.trimStart()), JSON.stringify(messy.trimEnd()));
console.log(JSON.stringify(cleaned), cleaned.length, messy.length);

const inputs = ["  yes", "NO ", " Yes ", "maybe"];
const answers = inputs.map(s => s.trim().toLowerCase());
console.log(answers, answers.filter(a => a === "yes").length);
