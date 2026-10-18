// Infinite generators consumed with a hand-written take(), and a fibonacci generator paused mid-way
function* naturals() {
  let n = 1;
  while (true) {
    yield n++;
  }
}

function* fibonacci() {
  let a = 0, b = 1;
  for (;;) {
    yield a;
    [a, b] = [b, a + b];
  }
}

function take(gen, count) {
  const out = [];
  for (const x of gen) {
    if (out.length >= count) break;
    out.push(x);
  }
  return out;
}

const firstFive = take(naturals(), 5);
console.log(firstFive);
const fib = fibonacci();
const fibStart = take(fib, 6);
console.log(fibStart);
console.log("after break, fib is closed:", fib.next());

const fib2 = fibonacci();
let tenth;
for (let i = 0; i < 10; i++) {
  tenth = fib2.next().value;
}
console.log("10th fib", tenth, "next", fib2.next().value);
