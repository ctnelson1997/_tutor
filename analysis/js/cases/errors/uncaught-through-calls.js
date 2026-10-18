// ends uncaught: an Error thrown three user functions deep escapes to the top after some output; a finally runs on the way
const orders = [{ id: 1, qty: 2 }, { id: 2, qty: 0 }];
let processedCount = 0;

function checkQuantity(order) {
  if (order.qty <= 0) {
    throw new Error(`order ${order.id} has invalid quantity ${order.qty}`);
  }
  return order.qty;
}

function priceOrder(order) {
  const qty = checkQuantity(order);
  return qty * 9.5;
}

function processAll(list) {
  let sum = 0;
  try {
    for (const order of list) {
      sum += priceOrder(order);
      processedCount++;
      console.log("processed order", order.id, "running sum", sum);
    }
  } finally {
    console.log("processAll cleanup, sum was", sum);
  }
  return sum;
}

console.log("starting");
const grandTotal = processAll(orders);
console.log("never printed", grandTotal);
