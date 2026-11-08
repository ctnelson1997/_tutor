// A program in strict mode (#89): this is undefined in a plain call, an undeclared name throws, a frozen object refuses changes
'use strict';
function f() {
  return this;
}
console.log(f());
try {
  undeclared = 1;
  console.log('no error');
} catch (e) {
  console.log(e.name);
}
const o = Object.freeze({ a: 1 });
try {
  o.a = 2;
} catch (e) {
  console.log(e.constructor.name, e.message);
}
function g(a) {
  a = 2;
  return arguments[0];
}
console.log(g(1));
