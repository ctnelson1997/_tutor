// ends uncaught: passing a class method as a forEach callback loses `this` (TypeError), after arrow and bind fixes work
class Cart {
  constructor() {
    this.items = [];
    this.total = 0;
  }
  add(price) {
    this.items.push(price);
    this.total += price;
  }
  addAllFixed(prices) {
    prices.forEach((p) => this.add(p));
    return this.total;
  }
  addAllBroken(prices) {
    prices.forEach(this.add);
    return this.total;
  }
}

const cart = new Cart();
console.log(cart.addAllFixed([5, 10]));
console.log(cart.items);
const bound = cart.add.bind(cart);
[1, 2].forEach(bound);
console.log(cart.total, cart);
cart.addAllBroken([100]);
console.log('never printed');
