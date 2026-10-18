// Object.groupBy (null-prototype result sharing the original objects) and Map.groupBy with object keys; manual ??= grouping
const people = [
  { name: 'Ann', age: 34, dept: 'eng' },
  { name: 'Bob', age: 19, dept: 'ops' },
  { name: 'Cat', age: 52, dept: 'eng' },
  { name: 'Dan', age: 27, dept: 'sales' },
  { name: 'Eve', age: 41, dept: 'ops' },
];

const byDept = Object.groupBy(people, (p) => p.dept);
console.log(byDept);
console.log(Object.keys(byDept), byDept.eng.length, Object.getPrototypeOf(byDept));
console.log('toString' in byDept, byDept.eng[0] === people[0]);

const byDecade = Object.groupBy(people, ({ age }) => `${Math.floor(age / 10) * 10}s`);
console.log(Object.entries(byDecade).map(([k, v]) => `${k}: ${v.map((p) => p.name).join(',')}`));

const byParity = Object.groupBy([1, 2, 3, 4, 5, 6], (n) => (n % 2 === 0 ? 'even' : 'odd'));
console.log(byParity);

const young = { label: 'young' };
const old = { label: 'old' };
const byAgeGroup = Map.groupBy(people, (p) => (p.age < 30 ? young : old));
console.log(byAgeGroup.get(young).map((p) => p.name), byAgeGroup.get(old).length);
console.log(byAgeGroup.get({ label: 'young' }), byAgeGroup.size);

const manual = {};
for (const p of people) {
  (manual[p.dept] ??= []).push(p.name);
}
console.log(manual);
byDept.eng.push({ name: 'New', age: 22, dept: 'eng' });
console.log(byDept.eng.length, people.length);
