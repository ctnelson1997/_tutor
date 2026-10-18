// Copying: spread is shallow, a JSON round trip loses undefined/Set/Date types, structuredClone keeps Set/Date/cycles
const original = {
  name: 'trip',
  dates: { start: new Date(0), nights: 3 },
  stops: ['a', 'b'],
  tags: new Set(['fun']),
  notes: undefined,
};

const shallow = { ...original };
const viaJson = JSON.parse(JSON.stringify(original));
const deep = structuredClone(original);

original.stops.push('c');
original.dates.nights = 5;

console.log(shallow.stops, shallow.dates.nights);
console.log(viaJson.stops, viaJson.dates.nights, typeof viaJson.dates.start, viaJson.tags, 'notes' in viaJson);
console.log(deep.stops, deep.dates.nights, deep.dates.start instanceof Date, deep.tags.has('fun'), 'notes' in deep);

const cyclic = { label: 'loop' };
cyclic.self = cyclic;
const cloned = structuredClone(cyclic);
console.log(cloned.self === cloned, cloned === cyclic);

const nested = [[1, 2], [3]];
const sliced = nested.slice();
const mapped = nested.map((row) => [...row]);
nested[0][0] = 99;
console.log(sliced[0][0], mapped[0][0]);

try {
  structuredClone({ fn() {} });
} catch (e) {
  console.log(e.name);
}
class Pt {
  constructor(x) {
    this.x = x;
  }
}
const ptClone = structuredClone(new Pt(1));
console.log(ptClone instanceof Pt, ptClone);
console.log(deep.dates.start.getTime(), viaJson.dates.start);
