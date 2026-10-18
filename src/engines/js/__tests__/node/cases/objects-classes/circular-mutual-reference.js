// Two objects pointing at each other, and a doubly linked list whose nodes link both ways
const alice = { name: 'Alice' };
const bob = { name: 'Bob' };
alice.friend = bob;
bob.friend = alice;
console.log(alice.friend.friend === alice, bob.friend.friend.friend.name);
console.log(alice);

function makeNode(value) {
  return { value, prev: null, next: null };
}
const list = { head: null, tail: null, size: 0 };
for (const v of ['a', 'b', 'c']) {
  const n = makeNode(v);
  if (!list.head) {
    list.head = n;
  } else {
    list.tail.next = n;
    n.prev = list.tail;
  }
  list.tail = n;
  list.size++;
}

const forward = [];
for (let n = list.head; n; n = n.next) forward.push(n.value);
const backward = [];
for (let n = list.tail; n; n = n.prev) backward.push(n.value);
console.log(forward.join('->'), backward.join('->'), list.size);

const middle = list.head.next;
middle.prev.next = middle.next;
middle.next.prev = middle.prev;
list.size--;
console.log(list.head.next.value, list.tail.prev.value, list.size);
console.log(list.head.next.prev === list.head, middle.next.value);
