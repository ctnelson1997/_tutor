// the temporal dead zone: reading let/const/class before its declaration throws a ReferenceError, even with typeof
const caught = [];
try {
  console.log(early);
} catch (e) {
  caught.push(e.name);
  console.log(e.name + ': ' + e.message);
}
let early = 'now initialized';
console.log(early);

function readLater() {
  return value * 2;
}
try {
  readLater();
} catch (e) {
  caught.push(e.constructor.name);
  console.log('call before init:', e.message);
}
const value = 21;
console.log('call after init:', readLater());

{
  try {
    console.log(typeof shadowed);
  } catch (e) {
    console.log('typeof in TDZ:', e.message);
    caught.push('typeof');
  }
  let shadowed = 'block';
  console.log(shadowed);
}

try {
  new Widget();
} catch (e) {
  console.log('class TDZ:', e.message);
  caught.push('class');
}
class Widget {}
console.log('typeof an undeclared name is fine:', typeof neverDeclared);
console.log(caught);
