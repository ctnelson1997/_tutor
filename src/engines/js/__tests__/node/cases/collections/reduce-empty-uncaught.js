// ends uncaught: reduce on an empty array without an initial value throws TypeError (after the safe version works)
const carts = [
  { owner: 'ann', items: [3, 4.5, 10] },
  { owner: 'bob', items: [7] },
  { owner: 'cy', items: [] },
];
const totals = {};
for (const cart of carts) {
  const safeTotal = cart.items.reduce((sum, p) => sum + p, 0);
  console.log(cart.owner, 'safe total', safeTotal);
}
for (const cart of carts) {
  totals[cart.owner] = cart.items.reduce((sum, p) => sum + p);
  console.log(cart.owner, 'total', totals[cart.owner]);
}
console.log('never printed', totals);
