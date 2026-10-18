// Builds a shopping cart, applies a coupon and tax, and prints an itemized receipt
const cart = [];
const TAX_RATE = 0.08;

function addItem(name, price, qty = 1) {
  const existing = cart.find(item => item.name === name);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ name, price, qty });
  }
}

function removeItem(name) {
  const index = cart.findIndex(item => item.name === name);
  if (index !== -1) {
    cart.splice(index, 1);
  }
}

function subtotal() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function discountFor(code, amount) {
  switch (code) {
    case "SAVE10":
      return amount * 0.1;
    case "FIVEOFF":
      return amount >= 20 ? 5 : 0;
    default:
      return 0;
  }
}

addItem("T-shirt", 15.99, 2);
addItem("Socks", 4.5, 3);
addItem("Hat", 12);
addItem("Socks", 4.5);
addItem("Mug", 8.25);
removeItem("Mug");

for (const item of cart) {
  console.log(`${item.qty} x ${item.name} @ $${item.price.toFixed(2)} = $${(item.qty * item.price).toFixed(2)}`);
}
const sub = subtotal();
const discount = discountFor("SAVE10", sub);
const tax = (sub - discount) * TAX_RATE;
const total = sub - discount + tax;
console.log("Subtotal: $" + sub.toFixed(2));
console.log("Discount: -$" + discount.toFixed(2));
console.log("Tax:      $" + tax.toFixed(2));
console.log("Total:    $" + total.toFixed(2));
const itemCount = cart.reduce((n, item) => n + item.qty, 0);
console.log("Items in cart:", itemCount);
console.log("FIVEOFF would save", discountFor("FIVEOFF", sub), "and BOGUS", discountFor("BOGUS", sub));
