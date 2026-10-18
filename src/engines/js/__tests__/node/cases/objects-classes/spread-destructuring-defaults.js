// Object spread and rest, destructuring with defaults, renaming, nesting and parameter defaults
const base = { id: 1, name: 'Widget', price: 9.99, meta: { color: 'blue' } };
const updated = { ...base, price: 12.5, onSale: true };
console.log(updated);
console.log(updated.meta === base.meta);

const { name, price: cost, stock = 0, meta: { color, size = 'M' } } = base;
console.log(name, cost, stock, color, size);

const { id, ...rest } = updated;
console.log(id, rest);

const { missing: renamed = 'fallback', name: title = 'none' } = base;
console.log(renamed, title);

function describe({ name, price = 0, tags = [] } = {}) {
  return `${name} costs ${price} with ${tags.length} tags`;
}
console.log(describe(base));
console.log(describe({ name: 'Free' }));
console.log(describe());

const nullish = { a: null, b: undefined };
const { a = 'A default', b = 'B default' } = nullish;
console.log(a, b);

const merged = { ...{ x: 1, y: 2 }, ...null, ...'hi', y: 3 };
console.log(merged);

let p = 1, q = 2;
({ p, q } = { p: q, q: p });
console.log(p, q);
