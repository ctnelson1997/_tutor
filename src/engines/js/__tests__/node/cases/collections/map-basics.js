// Map: insertion order (re-set keeps position, delete+set moves to end), 1 vs '1', NaN keys, size, iteration, conversion
const m = new Map();
m.set('b', 2).set('a', 1);
m.set(1, 'number one');
m.set('1', 'string one');
m.set(NaN, 'not a number');
m.set(true, 'yes');
console.log(m.size, m.get(1), m.get('1'), m.get(NaN), m.get('missing'));

m.set('b', 20);
console.log([...m.keys()]);
console.log(m.delete('a'), m.delete('a'), m.has('a'), m.size);
m.set('a', 'back');
console.log([...m.keys()]);

for (const [key, value] of m) {
  console.log(typeof key, key, '=>', value);
}
m.forEach((value, key) => {
  if (typeof key === 'string') m.set(key, String(value).toUpperCase());
});
console.log(m);

const obj = { z: 1, 10: 'ten', 2: 'two' };
const fromObj = new Map(Object.entries(obj));
console.log(fromObj, Object.fromEntries(fromObj));
const objMap = new Map([[10, 'ten'], [2, 'two'], ['z', 1]]);
console.log([...objMap.keys()], Object.keys(Object.fromEntries(objMap)));
const cleared = new Map(m);
m.clear();
console.log(m.size, m, cleared.size);
