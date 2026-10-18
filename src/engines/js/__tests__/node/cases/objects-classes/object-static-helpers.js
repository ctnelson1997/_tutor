// Object.keys/values/entries/assign/fromEntries, including assign's shallow copy and in-place target
const prices = { apple: 1.25, bread: 3, milk: 2.5 };
console.log(Object.keys(prices));
console.log(Object.values(prices));
console.log(Object.entries(prices));

let total = 0;
for (const [item, price] of Object.entries(prices)) {
  total += price;
  console.log(`${item}: $${price.toFixed(2)}`);
}
console.log('total', total);

const defaults = { color: 'red', size: 'M', tags: ['basic'] };
const order = Object.assign({}, defaults, { size: 'L' }, null, { qty: 2 });
console.log(order);
order.tags.push('sale');
console.log(defaults.tags, order.tags === defaults.tags);

const target = { a: 1 };
const returned = Object.assign(target, { b: 2 }, { a: 3 });
console.log(returned === target, target);

const doubled = Object.fromEntries(
  Object.entries(prices).map(([k, v]) => [k.toUpperCase(), v * 2])
);
console.log(doubled);
console.log(Object.entries('hi'), Object.keys([7, 8, 9]));
