// A singly linked list with append, prepend, remove, indexOf, reverse and toArray
class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

class LinkedList {
  constructor() {
    this.head = null;
    this.length = 0;
  }

  append(value) {
    const node = new Node(value);
    if (this.head === null) {
      this.head = node;
    } else {
      let current = this.head;
      while (current.next !== null) {
        current = current.next;
      }
      current.next = node;
    }
    this.length++;
  }

  prepend(value) {
    const node = new Node(value);
    node.next = this.head;
    this.head = node;
    this.length++;
  }

  remove(value) {
    if (this.head === null) return false;
    if (this.head.value === value) {
      this.head = this.head.next;
      this.length--;
      return true;
    }
    let prev = this.head;
    while (prev.next !== null && prev.next.value !== value) {
      prev = prev.next;
    }
    if (prev.next === null) return false;
    prev.next = prev.next.next;
    this.length--;
    return true;
  }

  indexOf(value) {
    let index = 0;
    for (let node = this.head; node !== null; node = node.next) {
      if (node.value === value) return index;
      index++;
    }
    return -1;
  }

  reverse() {
    let prev = null;
    let current = this.head;
    while (current) {
      const next = current.next;
      current.next = prev;
      prev = current;
      current = next;
    }
    this.head = prev;
  }

  toArray() {
    const out = [];
    let current = this.head;
    while (current) {
      out.push(current.value);
      current = current.next;
    }
    return out;
  }
}

const list = new LinkedList();
list.append(10);
list.append(20);
list.append(30);
list.prepend(5);
console.log(list.toArray().join(" -> "));
console.log("indexOf(20):", list.indexOf(20), "indexOf(99):", list.indexOf(99));
console.log("removed 20?", list.remove(20), "removed 99?", list.remove(99));
list.reverse();
console.log(list.toArray().join(" -> "), "length", list.length);
