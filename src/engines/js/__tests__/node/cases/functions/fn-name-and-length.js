// fn.name and fn.length for declarations, expressions, arrows, methods, computed keys, getters, classes and bound functions
function declared(a, b) {}
const anonExpr = function (a) {};
const namedExpr = function inner(a, b, c) {};
const arrow = (x, y) => x + y;
const withDefault = (a, b = 2, c) => a;
const withRest = (a, ...rest) => rest;
const obj = {
  method() {},
  arrowProp: () => {},
  ['computed' + 'Key']: function () {},
  get size() { return 1; },
};
class Shape {
  area() { return 0; }
  static create() { return new Shape(); }
}
const bound = declared.bind(null, 1);
const sizeGetter = Object.getOwnPropertyDescriptor(obj, 'size').get;
const list = [
  declared, anonExpr, namedExpr, arrow, withDefault, withRest,
  obj.method, obj.arrowProp, obj.computedKey, sizeGetter,
  Shape, Shape.prototype.area, Shape.create, bound, (() => {}),
];
const summary = list.map(f => `${f.name || '(empty)'}/${f.length}`);
for (const line of summary) {
  console.log(line);
}
let reassigned = function () {};
const alias = reassigned;
reassigned = null;
console.log('alias keeps its name:', alias.name);
