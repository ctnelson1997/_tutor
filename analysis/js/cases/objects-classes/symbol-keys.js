// Symbol-keyed properties: unique keys hidden from keys/for-in/JSON, found by getOwnPropertySymbols, copied by spread
const id = Symbol('id');
const id2 = Symbol('id');
const shared = Symbol.for('app.shared');

const user = {
  name: 'Kim',
  [id]: 101,
  [id2]: 202,
  [shared]: 'global',
};
user[Symbol.iterator] = function* () {
  yield this.name;
  yield this[id];
};

console.log(id === id2, id.toString(), id.description, Symbol.for('app.shared') === shared);
console.log(user[id], user[id2], user[Symbol.for('app.shared')]);
console.log(Object.keys(user), JSON.stringify(user));
const forIn = [];
for (const k in user) forIn.push(k);
console.log(forIn);
console.log(Object.getOwnPropertySymbols(user).map((s) => s.description));
console.log(Reflect.ownKeys(user).length, [...user]);

const copy = { ...user };
console.log(copy[id], Object.assign({}, user)[id2]);

const COLORS = Object.freeze({ RED: Symbol('red'), GREEN: Symbol('green') });
function colorName(c) {
  switch (c) {
    case COLORS.RED: return 'red';
    case COLORS.GREEN: return 'green';
    default: return 'unknown';
  }
}
console.log(colorName(COLORS.GREEN), colorName(Symbol('red')));
console.log(user, COLORS);
