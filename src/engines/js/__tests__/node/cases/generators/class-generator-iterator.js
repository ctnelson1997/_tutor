// A class with a *[Symbol.iterator]() generator method and another generator method using this
class LinkedList {
  constructor() {
    this.head = null;
    this.size = 0;
  }
  add(value) {
    const node = { value, next: null };
    if (!this.head) {
      this.head = node;
    } else {
      let cur = this.head;
      while (cur.next) cur = cur.next;
      cur.next = node;
    }
    this.size++;
    return this;
  }
  *[Symbol.iterator]() {
    let cur = this.head;
    while (cur) {
      yield cur.value;
      cur = cur.next;
    }
  }
  *pairs() {
    let i = 0;
    for (const v of this) {
      yield [i++, v];
    }
  }
}

const list = new LinkedList().add("a").add("b").add("c");
for (const v of list) {
  console.log("value", v);
}
console.log([...list].join("->"));
for (const [i, v] of list.pairs()) {
  console.log(i, v);
}
const iter = list[Symbol.iterator]();
const firstValue = iter.next().value;
console.log(firstValue, list.size);
