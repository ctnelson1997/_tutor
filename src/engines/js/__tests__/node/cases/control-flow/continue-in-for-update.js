// continue in a for loop still runs the update expression (here a function call)
let updates = 0;
function next(i) {
  updates++;
  return i + 1;
}
const odds = [];
for (let i = 0; i < 8; i = next(i)) {
  if (i % 2 === 0) continue;
  odds.push(i);
}
console.log("odds", odds, "updates", updates);

let skipped = 0;
for (let i = 10; i > 0; i -= 3) {
  if (i > 5) {
    skipped++;
    continue;
  }
  console.log("i =", i);
}
console.log("skipped", skipped);

const fns = [];
for (let i = 0; i < 3; i++) {
  if (i === 1) continue;
  fns.push(() => i);
}
console.log(fns.map((f) => f()));
