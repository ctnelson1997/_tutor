// matchAll() over a string: an iterator of match objects (groups, index), consumed by for...of and spread
const receipt = "apple x3 @ 0.50; bread x1 @ 2.25; milk x2 @ 1.10";
const itemRe = /(?<name>[a-z]+) x(?<qty>\d+) @ (?<price>\d+\.\d+)/g;

let total = 0;
const lines = [];
for (const match of receipt.matchAll(itemRe)) {
  const { name, qty, price } = match.groups;
  const cost = Number(qty) * Number(price);
  total += cost;
  lines.push(`${name.padEnd(6)} ${qty} ${cost.toFixed(2)} @${match.index}`);
}
console.log(lines.join("\n"));
console.log("total", total.toFixed(2));

const hashtags = [..."Loving #js and #regex, not #bugs".matchAll(/#(\w+)/g)].map(m => m[1]);
console.log(hashtags);

const iter = "a1b2c3".matchAll(/[a-z](\d)/g);
const firstMatch = iter.next().value;
console.log(firstMatch[0], firstMatch[1], firstMatch.index);
const remaining = [...iter].map(m => m[0]);
console.log(remaining, iter.next().done);

try {
  "abc".matchAll(/b/);
} catch (e) {
  console.log(e.name, e.message);
}
