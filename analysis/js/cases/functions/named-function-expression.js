// a named function expression calls itself by its own name, which is invisible outside and read-only inside
const factorial = function fact(n) {
  return n <= 1 ? 1 : n * fact(n - 1);
};
console.log(factorial(5), factorial.name);
console.log('fact outside:', typeof fact);
let countdown = function tick(n) {
  if (n === 0) return 'liftoff';
  return n + ' ' + tick(n - 1);
};
const saved = countdown;
countdown = null;
console.log(saved(3));
const tryRename = function self() {
  self = 'replaced';
  return typeof self;
};
console.log('assigning to its own name is ignored:', tryRename());
const fibs = [];
const fib = function f(n) {
  return n < 2 ? n : f(n - 1) + f(n - 2);
};
for (let i = 0; i < 8; i++) {
  fibs.push(fib(i));
}
console.log(fibs.join(' '));
const anonymous = function (n) {
  return n <= 0 ? 0 : n + anonymous(n - 1);
};
console.log(anonymous(4));
