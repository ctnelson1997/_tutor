// Checks stock for several orders in parallel with Promise.all and Promise.allSettled
function delay(ms, value) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

const stock = { pen: 10, paper: 0, stapler: 2 };

function checkStock(item) {
  return delay(0, item).then(name => {
    if (stock[name] > 0) {
      stock[name]--;
      return { item: name, ok: true };
    }
    throw new Error(`${name} is out of stock`);
  });
}

const order = ["pen", "stapler"];
const badOrder = ["pen", "paper", "stapler"];
const results = {};

Promise.all(order.map(checkStock))
  .then(statuses => {
    results.first = statuses.map(s => s.item);
    console.log("Order 1 ready:", results.first.join(", "));
    return Promise.all(badOrder.map(checkStock));
  })
  .then(() => console.log("Order 2 ready"))
  .catch(err => {
    results.error = err.message;
    console.log("Order 2 failed:", err.message);
    return Promise.allSettled(badOrder.map(checkStock));
  })
  .then(settled => {
    results.settled = settled.map(s => s.status);
    const lines = settled.map(s => (s.status === "fulfilled" ? s.value.item + " ok" : s.reason.message));
    console.log("Settled:", lines);
    console.log("Stock left:", stock);
  });

console.log("Orders submitted");
