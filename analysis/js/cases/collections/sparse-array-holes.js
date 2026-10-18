// Sparse arrays: literal holes, writing past the end, delete, new Array(n); how forEach/map/for-of/for-in treat holes
const a = [1, , 3];
console.log(a, a.length, 1 in a, a[1]);

const b = [];
b[5] = 'five';
console.log(b, b.length, Object.keys(b));

const c = [10, 20, 30];
delete c[0];
console.log(c, c.length, c[0], 0 in c);

const d = new Array(3);
console.log(d, d.length, Object.keys(d).length);
const e = Array(3).fill(undefined);
console.log(e, 0 in e);

let visited = [];
a.forEach((v, i) => visited.push(i));
console.log('forEach visits', visited);
visited = [];
for (const v of a) visited.push(v);
console.log('for-of sees', visited);
visited = [];
for (const i in a) visited.push(i);
console.log('for-in keys', visited);

console.log(a.map((x) => x * 2), d.map(() => 'x'), Array.from(d, () => 'x'));
console.log(a.filter(() => true), [...a], JSON.stringify(a));
console.log(c.indexOf(undefined), c.includes(undefined), c.join('-'));
const arr = [1, 2, 3];
arr[10] = 11;
console.log(arr, arr.length, arr.reduce((s, x) => s + x, 0));
