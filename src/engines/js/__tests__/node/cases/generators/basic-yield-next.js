// A generator object held in a variable, consumed partly with other code between next() calls
function* countdown(n) {
  console.log("start", n);
  while (n > 0) {
    yield n;
    n--;
  }
  console.log("done");
}

const gen = countdown(3);
let total = 0;
const first = gen.next();
console.log(first.value, first.done);
total += first.value;
console.log("between calls, total =", total);
const second = gen.next();
total += second.value;
console.log(second, "total", total);
const third = gen.next();
const fourth = gen.next();
console.log(third, fourth);
const fifth = gen.next();
console.log(fifth);
