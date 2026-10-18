// assigning to an undeclared name (sloppy mode) creates a global variable, inside a function or at top level
function setup() {
  counter = 1;
  helperName = 'made inside setup';
}
console.log('before setup:', typeof counter);
setup();
console.log('after setup:', typeof counter, counter, helperName);
counter += 41;
console.log('globalThis.counter:', globalThis.counter, 'in globalThis:', 'counter' in globalThis);
function readGlobal() {
  return counter * 2;
}
console.log(readGlobal());
let declared = 'declared with let';
console.log('let is not on globalThis:', globalThis.declared);
typo = 'oops';
console.log('typo created a global:', globalThis.typo);
console.log('delete a created global:', delete globalThis.typo, typeof typo);
const total = counter + 1;
console.log(total, declared);
