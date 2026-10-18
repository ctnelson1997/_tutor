// A hand-written iterator object (no generator) driven manually, plus one with a return() method closed by break
function makeCounter(limit) {
  let count = 0;
  return {
    next() {
      count++;
      if (count <= limit) return { value: count * 10, done: false };
      return { value: "end", done: true };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
}

const counter = makeCounter(3);
let res = counter.next();
const collected = [];
while (!res.done) {
  collected.push(res.value);
  res = counter.next();
}
console.log(collected, res);

let closed = false;
const closable = {
  i: 0,
  next() {
    this.i++;
    return { value: this.i, done: false };
  },
  return() {
    closed = true;
    return { done: true };
  },
  [Symbol.iterator]() {
    return this;
  },
};

for (const v of closable) {
  if (v === 3) break;
  console.log("got", v);
}
console.log("closed?", closed, "i =", closable.i);
