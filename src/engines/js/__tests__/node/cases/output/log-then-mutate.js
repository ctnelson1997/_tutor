// printing an object or array, then mutating it: each console.log shows the state at the time it ran
const cart = { items: ["apple"], total: 1 };
console.log(cart);
cart.items.push("pear");
cart.total = 2;
console.log(cart);
const snapshot = cart;
snapshot.owner = "Lee";
console.log(cart, snapshot === cart);
const list = [1, 2, 3];
console.log(list);
list.length = 1;
list[3] = "x";
console.log(list);
delete cart.total;
cart.items = cart.items.map((s) => s.toUpperCase());
console.log(cart);
const counter = { n: 0 };
for (let i = 0; i < 3; i++) {
  counter.n++;
  console.log("counter", counter);
}
