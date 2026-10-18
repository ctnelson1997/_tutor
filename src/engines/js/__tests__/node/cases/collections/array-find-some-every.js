// find/findIndex/findLast/findLastIndex return references; some/every short-circuit (callback counts); empty arrays
const inventory = [
  { name: 'apples', qty: 2, type: 'fruit' },
  { name: 'beans', qty: 0, type: 'veg' },
  { name: 'cherries', qty: 5, type: 'fruit' },
  { name: 'dates', qty: 0, type: 'fruit' },
];

const found = inventory.find((item) => item.qty === 0);
console.log(found, inventory.findIndex((item) => item.qty === 0));
console.log(inventory.findLast((item) => item.type === 'fruit').name);
console.log(inventory.findLastIndex((item) => item.qty > 100), inventory.find((i) => i.qty > 100));

let checks = 0;
const anyEmpty = inventory.some((item) => {
  checks++;
  return item.qty === 0;
});
console.log(anyEmpty, checks);

checks = 0;
const allFruit = inventory.every((item) => {
  checks++;
  return item.type === 'fruit';
});
console.log(allFruit, checks);

console.log([].some(() => true), [].every(() => false));
found.qty = 10;
console.log(inventory[1]);
const isPositive = (n) => n > 0;
console.log([3, 1, 4].every(isPositive), [3, -1, 4].some((n, i, arr) => n < 0 && i === arr.length - 2));
