// Optional chaining (?.) on properties, calls and indexes (short-circuiting side effects), ?? versus ||, ??= and ||=
const users = [
  { name: 'Ann', address: { city: 'Madison', zip: '53703' }, getNick() { return 'annie'; } },
  { name: 'Bob', address: null, score: 0 },
  { name: 'Cy', score: undefined, tags: ['x'] },
];

for (const u of users) {
  const city = u.address?.city ?? 'unknown';
  const nick = u.getNick?.() ?? 'no nick';
  const firstTag = u.tags?.[0] ?? 'none';
  console.log(u.name, city, nick, firstTag);
}

console.log(users[1].score || 100, users[1].score ?? 100);
console.log(users[2].score || 100, users[2].score ?? 100);
console.log('' || 'empty', '' ?? 'empty');

const nobody = null;
console.log(nobody?.name, nobody?.address.city, nobody?.[0]);

let calls = 0;
const count = () => ++calls;
const result = nobody?.[count()];
const real = users?.[count()]?.name;
console.log(result, real, calls);

const settings = { volume: 0 };
settings.volume ??= 50;
settings.theme ??= 'dark';
settings.title ||= 'Untitled';
console.log(settings);

const deep = { a: { b: { c: [{ d: 'found' }] } } };
console.log(deep?.a?.b?.c?.[0]?.d, deep.a?.x?.y?.z);
