// Maps keyed by objects compare by identity (vs plain objects stringifying keys); word frequency; a Map of arrays
const alice = { name: 'Alice' };
const bob = { name: 'Bob' };
const scores = new Map();
scores.set(alice, 90);
scores.set(bob, 85);
scores.set({ name: 'Alice' }, 0);
console.log(scores.size, scores.get(alice), scores.get({ name: 'Alice' }));

alice.name = 'Alicia';
console.log(scores.get(alice), [...scores.keys()].map((k) => k.name));

const plain = {};
plain[alice] = 1;
plain[bob] = 2;
console.log(Object.keys(plain), plain['[object Object]']);

const text = 'the cat sat on the mat the end';
const freq = new Map();
for (const word of text.split(' ')) {
  freq.set(word, (freq.get(word) || 0) + 1);
}
console.log(freq);
const top = [...freq].sort((x, y) => y[1] - x[1])[0];
console.log(top);

const groups = new Map();
for (const n of [1, 2, 3, 4, 5, 6, 7]) {
  const key = n % 3;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(n);
}
console.log(groups);

const fnKey = () => 'f';
const weird = new Map([[fnKey, 'function key'], [null, 'null key'], [undefined, 'undef key']]);
console.log(weird.get(fnKey), weird.get(null), weird.get(), weird.size);
console.log(scores);
