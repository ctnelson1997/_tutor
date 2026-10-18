// JSON.stringify of class instances: own enumerable data only, toJSON, replacer function/array, indent, parse round trip
class Product {
  #cost = 3;
  constructor(name, price, tags) {
    this.name = name;
    this.price = price;
    this.tags = tags;
    this.createdBy = undefined;
    this.discount = () => price * 0.9;
  }
  get label() {
    return this.name.toUpperCase();
  }
}

class Order {
  constructor(id, items) {
    this.id = id;
    this.items = items;
    this.secret = 'hide me';
  }
  toJSON() {
    return { id: this.id, count: this.items.length, items: this.items };
  }
}

const p1 = new Product('pen', 1.5, ['office']);
const p2 = new Product('ink', NaN, []);
console.log(JSON.stringify(p1));
console.log(JSON.stringify(p2));
const order = new Order(7, [p1, p2]);
console.log(JSON.stringify(order));
console.log(JSON.stringify(order, null, 2));
console.log(JSON.stringify(p1, ['name', 'tags']));
const replaced = JSON.stringify({ a: 1, b: 'two', c: [3, 'four'] }, (key, value) =>
  typeof value === 'number' ? value * 10 : value
);
console.log(replaced);
console.log(JSON.stringify([undefined, () => 1, Symbol('s'), new Map([[1, 2]]), new Date(0), -0, Infinity]));
const back = JSON.parse(JSON.stringify(p1));
console.log(back instanceof Product, back, p1.discount());
