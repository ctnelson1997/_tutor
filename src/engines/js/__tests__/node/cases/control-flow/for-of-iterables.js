// for...of over an array, a string, a Map (destructured), a Set, and Map keys/values
const nums = [3, 1, 4];
let sum = 0;
for (const n of nums) {
  sum += n;
}
console.log("sum", sum);

let letters = [];
for (const ch of "héllo") {
  letters.push(ch.toUpperCase());
}
console.log(letters.join("-"));

const ages = new Map([["ann", 31], ["ben", 25]]);
for (const [name, age] of ages) {
  console.log(`${name} is ${age}`);
}

const seen = new Set(["red", "green", "red", "blue"]);
const colors = [];
for (const color of seen) {
  colors.push(color);
}
console.log(colors, seen.size);

for (const key of ages.keys()) console.log("key", key);
for (const value of ages.values()) console.log("value", value);
