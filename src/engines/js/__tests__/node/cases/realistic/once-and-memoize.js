// Higher-order functions with closures: once, memoize, and a call-counting wrapper
function once(fn) {
  let called = false;
  let result;
  return function (...args) {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
}

function memoize(fn) {
  const cache = {};
  return function (n) {
    if (n in cache) {
      return cache[n];
    }
    const value = fn(n);
    cache[n] = value;
    return value;
  };
}

let slowCalls = 0;
const fastFib = memoize(function (n) {
  slowCalls++;
  if (n < 2) return n;
  return fastFib(n - 1) + fastFib(n - 2);
});

const initialize = once(() => {
  console.log("Initializing...");
  return "ready";
});

console.log(initialize());
console.log(initialize());
console.log("fib(20) =", fastFib(20));
console.log("Underlying calls:", slowCalls);
console.log("fib(25) =", fastFib(25));
console.log("Underlying calls now:", slowCalls);

function countCalls(fn) {
  const wrapped = (...args) => {
    wrapped.calls++;
    return fn(...args);
  };
  wrapped.calls = 0;
  return wrapped;
}

const square = countCalls(x => x * x);
const squares = [1, 2, 3, 4].map(n => square(n));
console.log(squares, "square called", square.calls, "times");
