// Relational comparison of strings (code units, lexicographic), string vs number coercion, default sort of numbers
const pairs = [
  ["apple", "banana"],
  ["Zebra", "apple"],
  ["10", "9"],
  ["abc", "abcd"],
  ["", "a"],
  ["a", "A"],
];
for (const [x, y] of pairs) {
  console.log(`${JSON.stringify(x)} < ${JSON.stringify(y)}:`, x < y);
}

console.log("10" < 9, "10" < "9", 10 < 9, "abc" < 5, "abc" > 5);
console.log("2" == 2, "2" === 2, "" == 0, " 3 " * 2, "3" + 2, "3" - 2);

const nums = [10, 9, 100, 1, 25];
const defaultSorted = [...nums].sort();
const numericSorted = [...nums].sort((a, b) => a - b);
console.log(defaultSorted, numericSorted);

function maxString(arr) {
  let best = arr[0];
  for (const s of arr) {
    if (s > best) best = s;
  }
  return best;
}
const maxWord = maxString(["pear", "Plum", "peach", "apple"]);
console.log(maxWord, "pear" > "peach", "Plum" > "apple");
