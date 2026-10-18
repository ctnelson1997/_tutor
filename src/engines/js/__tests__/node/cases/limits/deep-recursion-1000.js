// legal recursion 1,000 calls deep (sum of 1..1000), well inside the JS stack
function sumTo(n) {
  if (n === 0) return 0;
  return n + sumTo(n - 1);
}
const total = sumTo(1000);
console.log("sum of 1..1000 =", total);
const expected = (1000 * 1001) / 2;
console.log("matches formula:", total === expected);
