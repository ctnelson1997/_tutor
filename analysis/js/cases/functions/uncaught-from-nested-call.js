// ends uncaught: a RangeError thrown three calls deep, inside a for-of loop, after some successful iterations
function validate(qty) {
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new RangeError('quantity must be a positive integer, got ' + qty);
  }
  return qty;
}
function lineTotal(item) {
  return validate(item.qty) * item.price;
}
function orderTotal(items) {
  let sum = 0;
  for (const item of items) {
    sum += lineTotal(item);
    console.log('added', item.name, 'running total', sum);
  }
  return sum;
}
const order = [
  { name: 'tea', qty: 2, price: 3 },
  { name: 'cake', qty: 1, price: 5 },
  { name: 'jam', qty: 0, price: 4 },
];
console.log('starting');
const total = orderTotal(order);
console.log('total', total);
