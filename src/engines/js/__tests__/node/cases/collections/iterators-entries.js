// entries()/keys()/values() iterators held in variables: manual next(), partial consumption, exhaustion, live views
const fruits = ['apple', 'banana', 'cherry'];
const it = fruits.entries();
console.log(it.next());
console.log(it.next().value);
for (const [i, f] of it) console.log('rest', i, f);
console.log(it.next(), [...it]);

const keys = fruits.keys();
fruits.push('date');
console.log([...keys]);

const m = new Map([['a', 1], ['b', 2]]);
const mapIt = m.entries();
console.log(mapIt.next().value);
m.set('c', 3);
m.delete('b');
console.log([...mapIt]);

const s = new Set([10, 20]);
const vals = s.values();
const [first] = vals;
console.log(first, vals.next());

function* idGen() {
  let id = 1;
  while (true) yield id++;
}
const ids = idGen();
const batch = [ids.next().value, ids.next().value];
const [x, y, z] = ids;
console.log(batch, x, y, z, ids.next());

const word = 'hey';
const chars = word[Symbol.iterator]();
console.log(chars.next(), chars.next(), chars.next(), chars.next());
console.log(Object.prototype.toString.call(it), typeof it.next);
