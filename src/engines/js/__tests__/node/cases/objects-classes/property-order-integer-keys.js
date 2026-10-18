// Property order: integer-like keys ascending first, then string keys in insertion order, symbols last
const obj = {};
obj.zebra = 1;
obj['10'] = 'ten';
obj.apple = 2;
obj[2] = 'two';
obj['-1'] = 'minus one';
obj['01'] = 'leading zero';
obj[1.5] = 'one and a half';
obj[0] = 'zero';
const sym = Symbol('tag');
obj[sym] = 'symbol';
obj[4294967294] = 'max index';
obj[4294967295] = 'not an index';

console.log(Object.keys(obj));
console.log(JSON.stringify(obj));
for (const k in obj) {
  console.log(k, '->', obj[k]);
}
delete obj.zebra;
obj.zebra = 'back';
console.log(Object.keys(obj).join(','));
console.log(Reflect.ownKeys(obj).length);

const scores = { 3: 'c', 1: 'a', b: 'B', 2: 'b', a: 'A' };
console.log(Object.entries(scores));
console.log(scores);
