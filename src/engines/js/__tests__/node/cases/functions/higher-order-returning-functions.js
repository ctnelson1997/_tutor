// higher-order functions that return functions: a multiplier factory, compose, pipe, once and memoize
const multiplier = factor => n => n * factor;
const double = multiplier(2);
const triple = multiplier(3);
console.log(double(5), triple(5));
const compose = (f, g) => x => f(g(x));
const pipe = (...fns) => x => fns.reduce((acc, fn) => fn(acc), x);
const addOne = x => x + 1;
const doubleThenAdd = compose(addOne, double);
const addThenDouble = pipe(addOne, double);
console.log(doubleThenAdd(10), addThenDouble(10));
function once(fn) {
  let done = false;
  let result;
  return function (...args) {
    if (!done) {
      done = true;
      result = fn(...args);
    }
    return result;
  };
}
const init = once(name => 'initialized ' + name);
console.log(init('first'), init('second'));
function memoize(fn) {
  const cache = {};
  return n => {
    if (n in cache) return 'cached ' + cache[n];
    cache[n] = fn(n);
    return 'computed ' + cache[n];
  };
}
const slowSquare = memoize(n => n * n);
console.log(slowSquare(4), slowSquare(4), slowSquare(5));
const transforms = [double, triple, addOne].map(f => f(7));
console.log(transforms);
