// fn.toString() returns the function's source text exactly as written ([native code] for built-ins and bound functions)
function add(a, b) { return a + b; }
const arrow = (x) => x * 2;
const expr = function named(n) { return n; };
const obj = { greet() { return 'hi'; } };
class Animal { speak() { return '...'; } }
console.log(add.toString());
console.log(arrow.toString());
console.log(expr.toString());
console.log(obj.greet.toString());
console.log(Animal.toString());
console.log(String(arrow));
console.log('' + add === add.toString());
console.log(Math.max.toString());
console.log(add.bind(null).toString());
const source = add.toString();
const sourceLength = source.length;
console.log('length of add source:', sourceLength);
