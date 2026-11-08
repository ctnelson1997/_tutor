// Global semantics of a classic script (#87): a var is a global that can't be deleted, a let isn't a property
var x = 1;
let y = 2;
console.log(delete x, typeof x, 'y' in globalThis, globalThis.x, typeof y);
function whoAmI() {
  return typeof this;
}
console.log(whoAmI());
