// closures as counters: each factory call makes an independent counter with its own captured variables
function makeCounter(start = 0, step = 1) {
  let count = start;
  return {
    increment() {
      count += step;
      return count;
    },
    decrement() {
      count -= step;
      return count;
    },
    peek: () => count,
  };
}
const a = makeCounter();
const b = makeCounter(100, 10);
a.increment();
a.increment();
b.decrement();
console.log('a:', a.peek(), 'b:', b.peek());
console.log('count is not a property:', a.count, Object.keys(a));
function counterFn() {
  let calls = 0;
  return function () {
    calls++;
    return 'called ' + calls + (calls === 1 ? ' time' : ' times');
  };
}
const next = counterFn();
console.log(next());
console.log(next());
console.log(next());
const other = counterFn();
console.log(other());
const finalA = a.increment();
console.log('final a:', finalA);
