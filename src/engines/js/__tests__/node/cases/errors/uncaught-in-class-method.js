// ends uncaught: a RangeError thrown inside a class method called from another method (via this), after normal calls
class Inventory {
  constructor() {
    this.stock = new Map();
  }
  add(item, count) {
    this.stock.set(item, (this.stock.get(item) || 0) + count);
    return this;
  }
  remove(item, count) {
    const have = this.stock.get(item) || 0;
    if (count > have) {
      throw new RangeError(`only ${have} ${item} left, tried to remove ${count}`);
    }
    this.stock.set(item, have - count);
  }
  fulfill(order) {
    for (const [item, count] of Object.entries(order)) {
      this.remove(item, count);
      console.log("removed", count, item);
    }
  }
}

const inv = new Inventory().add("apple", 5).add("pear", 2);
inv.fulfill({ apple: 2 });
console.log([...inv.stock]);
inv.fulfill({ apple: 1, pear: 3 });
console.log("not reached");
