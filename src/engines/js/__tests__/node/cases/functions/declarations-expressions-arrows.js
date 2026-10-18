// function declarations vs expressions vs arrows: hoisting, calling an expression too early (caught), arrow forms
console.log('declaration before its line:', add(2, 3));
try {
  multiply(2, 3);
} catch (e) {
  console.log(e.name + ':', e.message);
}
function add(a, b) {
  return a + b;
}
var multiply = function (a, b) {
  return a * b;
};
const subtract = (a, b) => a - b;
const square = x => x * x;
const makePoint = (x, y) => ({ x, y });
const noArgs = () => 'nothing';
const block = (n) => {
  const doubled = n * 2;
  return doubled + 1;
};
console.log(add(1, 2), multiply(3, 4), subtract(10, 4), square(5));
console.log(makePoint(1, 2), noArgs(), block(10));
const results = [add, multiply, subtract].map(f => f(6, 3));
console.log(results);
const point = makePoint(3, 4);
