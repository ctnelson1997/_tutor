// a factory function returning an object literal with methods: closure state, this, chaining, a getter, a lost this
function createCart(owner) {
  const items = [];
  return {
    owner,
    add(name, price, qty = 1) {
      items.push({ name, price, qty });
      return this;
    },
    remove(name) {
      const index = items.findIndex(item => item.name === name);
      if (index !== -1) items.splice(index, 1);
      return this;
    },
    total() {
      return items.reduce((sum, item) => sum + item.price * item.qty, 0);
    },
    describe() {
      return `${this.owner} has ${items.length} item(s) totaling $${this.total().toFixed(2)}`;
    },
    get count() {
      return items.length;
    },
  };
}
const cart = createCart('Ravi');
cart.add('pen', 1.5, 4).add('book', 12.25).add('bag', 30).remove('bag');
console.log(cart.describe());
console.log('count getter:', cart.count);
const other = createCart('Lee').add('gum', 0.99);
console.log(other.describe(), cart.total() > other.total());
const { describe } = cart;
try {
  describe();
} catch (e) {
  console.log('destructured method lost this:', e.name + ': ' + e.message);
}
