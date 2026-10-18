// Array.from (with a mapper), new Set, new Map and Object.fromEntries consuming generators
function* squares(n) {
  for (let i = 1; i <= n; i++) {
    yield i * i;
  }
}

function* entries(obj) {
  for (const key of Object.keys(obj)) {
    yield [key, obj[key] * 2];
  }
}

const arr = Array.from(squares(4));
console.log(arr);
const labels = Array.from(squares(3), (v, i) => `#${i}:${v}`);
console.log(labels);

function* withDupes() {
  yield* [3, 1, 3, 2, 1];
}
const unique = new Set(withDupes());
console.log(unique.size, [...unique]);

const prices = { apple: 1, pear: 2 };
const doubled = Object.fromEntries(entries(prices));
console.log(doubled);
const asMap = new Map(entries(prices));
console.log(asMap.get("pear"), asMap.size);
