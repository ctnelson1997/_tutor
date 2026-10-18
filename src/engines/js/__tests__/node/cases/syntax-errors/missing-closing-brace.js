// syntax error: a function body is never closed (missing }), so parsing reaches the end of the file
let total = 0;
const prices = [3, 5, 8];
function addAll(list) {
  for (const p of list) {
    total += p;
  }
addAll(prices);
console.log("total", total);
