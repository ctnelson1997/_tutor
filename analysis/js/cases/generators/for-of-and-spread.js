// for...of, spread, destructuring and Math.max over generators, each starting a fresh run
function* range(start, end, step = 1) {
  for (let i = start; i < end; i += step) {
    yield i;
  }
}

let sum = 0;
for (const n of range(0, 5)) {
  sum += n;
}
console.log("sum", sum);

const evens = [...range(0, 10, 2)];
console.log("evens", evens);

const [a, b, ...rest] = range(10, 15);
console.log(a, b, rest);

console.log("max", Math.max(...range(3, 8)));

const g = range(1, 4);
const once = [...g];
const twice = [...g];
console.log(once, twice);

const pairs = [];
for (const x of range(1, 3)) {
  for (const y of range(1, 3)) {
    pairs.push(`${x}${y}`);
  }
}
console.log(pairs.join(","));
