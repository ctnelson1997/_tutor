// == coerces its operands before comparing, === does not; objects compare by identity
const pairs = [
  [0, ''],
  [0, '0'],
  ['', '0'],
  [false, '0'],
  [null, undefined],
  [null, 0],
  [NaN, NaN],
  [[1], 1],
  [[1, 2], '1,2'],
  ['true', true],
  [1, true],
];
function show(v) {
  if (typeof v === 'string') return "'" + v + "'";
  if (Array.isArray(v)) return '[' + v + ']';
  return String(v);
}
const table = [];
for (const [x, y] of pairs) {
  const row = `${show(x)} vs ${show(y)}: == ${x == y}, === ${x === y}`;
  table.push(row);
  console.log(row);
}
const obj = { id: 1 };
const same = obj;
const copy = { id: 1 };
console.log(obj == same, obj === same, obj == copy, obj === copy);
console.log({ toString() { return '7'; } } == 7);
const looseOnly = table.filter(r => r.includes('== true, === false')).length;
console.log('loosely but not strictly equal:', looseOnly);
