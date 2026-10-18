// Chained map/filter/take generators run lazily: each element passes every stage before the next is read
function* source(items) {
  for (const item of items) {
    console.log("source", item);
    yield item;
  }
}

function* map(iter, fn) {
  for (const x of iter) yield fn(x);
}

function* filter(iter, pred) {
  for (const x of iter) {
    if (pred(x)) yield x;
  }
}

function* take(iter, n) {
  if (n <= 0) return;
  for (const x of iter) {
    yield x;
    if (--n === 0) return;
  }
}

const pipeline = take(filter(map(source([1, 2, 3, 4, 5, 6]), x => x * 3), x => x % 2 === 0), 2);
console.log("nothing pulled yet");
const result = [];
for (const v of pipeline) {
  console.log("got", v);
  result.push(v);
}
console.log(result);
