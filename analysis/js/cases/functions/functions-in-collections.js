// functions stored in objects, arrays and a Map: dispatch tables, calling an array element (this is the array)
const operations = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': function (a, b) { return a * b; },
  '/': function divide(a, b) { return b === 0 ? NaN : a / b; },
};
function calculate(a, op, b) {
  const fn = operations[op];
  if (typeof fn !== 'function') return 'unknown operator ' + op;
  return fn(a, b);
}
console.log(calculate(6, '+', 3), calculate(6, '-', 3), calculate(6, '*', 3), calculate(6, '/', 0), calculate(1, '%', 2));
const steps = [
  x => x + 1,
  x => x * 10,
  function () { return this.length; },
];
let value = 4;
for (let i = 0; i < 2; i++) {
  value = steps[i](value);
}
console.log('after pipeline:', value);
console.log('called as an array element, this is the array:', steps[2]());
const handlerMap = new Map();
handlerMap.set('greet', name => 'Hello ' + name);
handlerMap.set('shout', name => name.toUpperCase() + '!');
for (const [key, handler] of handlerMap) {
  console.log(key, '->', handler('kim'));
}
const names = Object.keys(operations);
const fnCount = steps.filter(s => typeof s === 'function').length;
console.log(names, fnCount, operations['/'].name, operations['*'].name);
