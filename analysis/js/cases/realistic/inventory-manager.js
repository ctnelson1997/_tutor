// Manages a store inventory: selling, restocking, low-stock alerts and total value
const inventory = {
  apples: { price: 0.5, quantity: 40 },
  bread: { price: 2.25, quantity: 8 },
  milk: { price: 3.1, quantity: 3 },
  eggs: { price: 4.0, quantity: 12 }
};

function sell(item, amount) {
  const product = inventory[item];
  if (!product) {
    console.log(`No such item: ${item}`);
    return false;
  }
  if (product.quantity < amount) {
    console.log(`Not enough ${item}: only ${product.quantity} left`);
    return false;
  }
  product.quantity -= amount;
  console.log(`Sold ${amount} ${item} for $${(amount * product.price).toFixed(2)}`);
  return true;
}

function restock(item, amount, price) {
  if (inventory[item] === undefined) {
    inventory[item] = { price: price, quantity: 0 };
  }
  inventory[item].quantity += amount;
}

function lowStock(limit) {
  const low = [];
  for (const name in inventory) {
    if (inventory[name].quantity <= limit) {
      low.push(name);
    }
  }
  return low;
}

function totalValue() {
  let total = 0;
  for (const [name, info] of Object.entries(inventory)) {
    total += info.price * info.quantity;
  }
  return total;
}

const sales = ["apples", "milk", "cheese", "bread"].map((item, i) => sell(item, [15, 5, 1, 6][i]));
console.log("Sales succeeded:", sales);
restock("milk", 10);
restock("butter", 6, 3.75);
console.log("Low stock:", lowStock(5));
console.log("Inventory value: $" + totalValue().toFixed(2));
const itemCount = Object.keys(inventory).length;
console.log(itemCount + " products:", inventory);
