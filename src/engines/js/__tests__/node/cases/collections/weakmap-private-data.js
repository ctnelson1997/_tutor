// WeakMap/WeakSet keyed by objects: per-instance private data, memoizing by object identity, non-object keys rejected
const privateData = new WeakMap();
class Person {
  constructor(name, ssn) {
    this.name = name;
    privateData.set(this, { ssn, visits: 0 });
  }
  visit() {
    const data = privateData.get(this);
    data.visits++;
    return `${this.name} visit #${data.visits}`;
  }
  maskedSsn() {
    return '***-**-' + privateData.get(this).ssn.slice(-4);
  }
}
const p = new Person('Pat', '123-45-6789');
const q = new Person('Quinn', '987-65-4321');
console.log(p.visit(), p.visit(), q.visit());
console.log(p.maskedSsn(), Object.keys(p), JSON.stringify(q));
console.log(privateData.has(p), privateData.has({}), privateData.get({}));

const cache = new WeakMap();
let computeCount = 0;
function area(rect) {
  if (cache.has(rect)) return cache.get(rect);
  computeCount++;
  const result = rect.w * rect.h;
  cache.set(rect, result);
  return result;
}
const r1 = { w: 3, h: 4 };
console.log(area(r1), area(r1), area({ w: 3, h: 4 }), computeCount);
console.log(cache.delete(r1), cache.has(r1));

const seen = new WeakSet();
const visitOnce = (obj) => (seen.has(obj) ? 'already' : (seen.add(obj), 'first'));
console.log(visitOnce(r1), visitOnce(r1), visitOnce(p));
try {
  cache.set('string key', 1);
} catch (e) {
  console.log(e.name);
}
console.log(privateData, seen, p);
