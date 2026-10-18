// NaN, Infinity, -Infinity, undefined, null, -0 and holes stored inside objects and arrays
const readings = [1.5, NaN, Infinity, -Infinity, undefined, null, -0];
const stats = {
  average: 0 / 0,
  max: Math.max(),
  min: Math.min(),
  missing: undefined,
  empty: null,
  overflow: 1e308 * 10,
  negZero: -0,
};
console.log(readings);
console.log(stats);
console.log(JSON.stringify(readings));
console.log(JSON.stringify(stats));
console.log(readings.length, Object.keys(stats).length, 'missing' in stats);
const finite = readings.filter(Number.isFinite);
const asStrings = readings.map(String);
console.log(finite, asStrings);
const holes = [1, , 3];
const withUndefined = [1, undefined, 3];
console.log(holes, withUndefined, 1 in holes, 1 in withUndefined);
const nested = { list: [NaN, { deep: undefined, inf: Infinity }] };
console.log(nested);
