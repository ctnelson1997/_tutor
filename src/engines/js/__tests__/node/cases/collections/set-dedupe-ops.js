// Set: dedupe in first-seen order (NaN once, 0 and -0 equal), objects by identity, set ops manual and built-in
const nums = [3, 1, 3, 2, 1, 4, NaN, NaN, 0, -0];
const unique = new Set(nums);
console.log(unique, unique.size, [...unique]);

const s = new Set();
s.add('a').add('b').add('a');
console.log(s.has('a'), s.has('c'), s.delete('a'), s.delete('a'), [...s]);
s.add('a');
console.log([...s]);

const objs = new Set([{ id: 1 }, { id: 1 }]);
const shared = { id: 2 };
objs.add(shared).add(shared);
console.log(objs.size);

const a = new Set([1, 2, 3, 4]);
const b = new Set([3, 4, 5]);
const union = new Set([...a, ...b]);
const inter = new Set([...a].filter((x) => b.has(x)));
const diff = new Set([...a].filter((x) => !b.has(x)));
console.log([...union], [...inter], [...diff]);
console.log(a.union(b), a.intersection(b), a.difference(b), a.symmetricDifference(b));
console.log(new Set([3]).isSubsetOf(a), a.isSupersetOf(b), a.isDisjointFrom(new Set([9])));

for (const v of b) {
  if (v === 3) b.add(6);
  console.log('visit', v);
}
const letters = new Set('mississippi');
console.log(letters, [...letters].join(''));
const entries = [...new Set(['x', 'y']).entries()];
console.log(entries, objs);
