// nested and chained conditional (ternary) expressions, with calls in the branches
function sign(n) {
  return n > 0 ? "positive" : n < 0 ? "negative" : "zero";
}
console.log(sign(5), sign(-2), sign(0));

function fizz(i) {
  return i % 15 === 0 ? "FizzBuzz" : i % 3 === 0 ? "Fizz" : i % 5 === 0 ? "Buzz" : String(i);
}
const out = [];
for (let i = 1; i <= 15; i++) out.push(fizz(i));
console.log(out.join(" "));

let calls = [];
function pick(name, v) {
  calls.push(name);
  return v;
}
const r = pick("test", true) ? (pick("a", false) ? pick("a1", 1) : pick("a2", 2)) : pick("b", 3);
console.log("r", r, "calls", calls);
const max3 = (a, b, c) => (a > b ? (a > c ? a : c) : b > c ? b : c);
console.log(max3(3, 9, 4), max3(7, 2, 5), max3(1, 2, 8));
