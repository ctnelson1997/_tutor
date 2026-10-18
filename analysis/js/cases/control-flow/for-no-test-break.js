// for (;;) with break, and for loops missing their init, test or update
let n = 7;
let steps = 0;
for (;;) {
  if (n === 1) break;
  n = n % 2 === 0 ? n / 2 : 3 * n + 1;
  steps++;
}
console.log("collatz steps from 7:", steps);

let i = 0;
for (; i < 3; ) {
  console.log("i", i);
  i++;
}

let total = 0;
for (let k = 5; ; k--) {
  if (k === 0) break;
  total += k;
}
console.log("total", total);

let tries = 0;
for (;;) {
  tries++;
  if (tries * tries > 20) break;
}
console.log("tries", tries);
