// typeof for every kind of value, including null, an undeclared name, functions, classes, symbols and BigInt
const samples = {
  number: 42,
  nan: NaN,
  string: 'hi',
  boolean: false,
  undef: undefined,
  nul: null,
  array: [1, 2],
  object: { a: 1 },
  func: function () {},
  arrow: () => 1,
  klass: class Point {},
  symbol: Symbol('id'),
  big: 10n,
  regex: /ab+c/,
};
const kinds = {};
for (const key of Object.keys(samples)) {
  kinds[key] = typeof samples[key];
  console.log(key.padEnd(8), typeof samples[key]);
}
console.log('undeclared:', typeof notDeclaredAnywhere);
console.log('typeof typeof:', typeof typeof 1);
console.log('Array.isArray:', Array.isArray(samples.array), 'null check:', samples.nul === null);
const describe = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
console.log(describe(null), describe([]), describe({}));
const sym = samples.symbol;
console.log(sym.toString(), sym.description);
