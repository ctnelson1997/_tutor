// #private fields and methods, a private static, the `#x in obj` brand check, and invisibility from outside
class Counter {
  #count = 0;
  #step;
  static #instances = 0;

  constructor(step = 1) {
    this.#step = step;
    this.label = 'counter';
    Counter.#instances++;
  }
  #validate(n) {
    return Number.isInteger(n) && n >= 0;
  }
  increment() {
    this.#count += this.#step;
    return this;
  }
  set(n) {
    if (this.#validate(n)) this.#count = n;
    return this.#count;
  }
  get value() {
    return this.#count;
  }
  static isCounter(obj) {
    return #count in obj;
  }
  static get instances() {
    return Counter.#instances;
  }
  equals(other) {
    return this.#count === other.#count;
  }
}

const c = new Counter(5);
c.increment().increment();
console.log(c.value, c.set(-3), c.set(7));
const d = new Counter();
console.log(Counter.isCounter(c), Counter.isCounter({ count: 1 }), Counter.instances);
console.log(Object.keys(c), JSON.stringify(c), c.count, c['#count']);
console.log(c.equals(d), d.set(7), c.equals(d));
console.log(c, d.increment().value);
