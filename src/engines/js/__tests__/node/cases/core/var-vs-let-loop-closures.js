// closures made in loops: var shares one binding across iterations, let gives each iteration its own
var withVar = [];
for (var i = 0; i < 3; i++) {
  withVar.push(function () { return i; });
}
const withLet = [];
for (let k = 0; k < 3; k++) {
  withLet.push(() => k);
}
console.log('var:', withVar.map(f => f()));
console.log('let:', withLet.map(f => f()));
console.log('i after loop:', i);

const fixed = [];
for (var n = 0; n < 3; n++) {
  (function (copy) {
    fixed.push(() => copy * 100);
  })(n);
}
console.log('IIFE copy:', fixed.map(f => f()));

const mutated = [];
for (let m = 0; m < 6; m++) {
  mutated.push(() => m);
  m++; // changes this iteration's binding before the closure runs
}
console.log('let changed in body:', mutated.map(f => f()));
const firstVar = withVar[0]();
const lastLet = withLet[2]();
console.log(firstVar, lastLet);
