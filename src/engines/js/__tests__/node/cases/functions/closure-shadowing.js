// Names reused inside methods, a helper declared at the bottom, a default parameter's closure, a switch case's let (#90)
function createCart() {
  const items = [];
  let total = 0;
  return {
    add(price) {
      items.push(price);
      let total = items.reduce((a, b) => a + b, 0);
      return total;
    },
    count() {
      return items.length + total;
    },
  };
}
const cart = createCart();
console.log(cart.add(5), cart.add(10), cart.count());

function solve() {
  const answer = helper(3);
  return answer;
  function helper(x) {
    return x * x;
  }
}
console.log(solve());

function f(x, y = (() => x * 2)()) {
  return x + y;
}
console.log(f(3));

let label = 'outer';
switch (2) {
  case 1:
    let label = 'one';
    console.log(label);
    break;
  case 2:
    console.log('two');
}
console.log(label);
