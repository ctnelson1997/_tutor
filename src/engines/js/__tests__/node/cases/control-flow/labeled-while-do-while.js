// labeled continue/break that jump out of an inner do-while or while to the outer loop
let i = 0;
let log = [];
outer: while (i < 4) {
  i++;
  let j = 0;
  do {
    j++;
    if (j === 2) continue outer;
    log.push(i + ":" + j);
  } while (j < 3);
  log.push("never");
}
console.log(log);

let n = 0;
let steps = 0;
search: do {
  n++;
  let k = n;
  while (k > 0) {
    steps++;
    if (k * n === 12) break search;
    k--;
  }
} while (n < 10);
console.log("stopped at n =", n, "after", steps, "steps");
