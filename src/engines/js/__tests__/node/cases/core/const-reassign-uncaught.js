// ends uncaught: a function that reassigns an outer const throws TypeError after some output
const limit = 3;
let total = 0;
for (let i = 1; i <= limit; i++) {
  total += i;
  console.log('i =', i, 'total =', total);
}
const finalTotal = total;
console.log('final total', finalTotal);
function bump() {
  const before = finalTotal;
  finalTotal++;
  return before;
}
console.log('about to bump');
bump();
console.log('never printed');
