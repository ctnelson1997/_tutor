// concat flattens one level and shares nested arrays; indexOf vs includes on NaN/-0/holes; object identity in searches
const a = [1, 2];
const b = [3, [4, 5]];
const c = a.concat(b, 6, [[7]]);
console.log(c, c.length, a);
b[1].push('shared');
console.log(c[3]);

const vals = [NaN, 0, -0, 'NaN', undefined, null, 2, 2];
console.log(vals.indexOf(NaN), vals.includes(NaN));
console.log(vals.indexOf(-0), vals.includes(0), vals.lastIndexOf(2), vals.indexOf(2, 7));
console.log(vals.indexOf(undefined), vals.includes(null), vals.indexOf('2'));

const target = { id: 1 };
const list = [{ id: 1 }, target];
console.log(list.indexOf({ id: 1 }), list.indexOf(target), list.includes(target));
console.log(list.findIndex((o) => o.id === 1));

const sparse = [1, , 3];
console.log(sparse.indexOf(undefined), sparse.includes(undefined));

const words = ['apple', 'banana', 'apple', 'cherry'];
const positions = [];
let idx = words.indexOf('apple');
while (idx !== -1) {
  positions.push(idx);
  idx = words.indexOf('apple', idx + 1);
}
console.log(positions, 'banana'.includes('nan'), [...'banana'].indexOf('n'));
