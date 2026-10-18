// NaN is not equal to itself; how isNaN, Number.isNaN, includes, indexOf, Object.is and Set treat it
const bad = Number('abc');
const alsoBad = 0 / 0;
const half = Math.sqrt(-1);
console.log(bad, alsoBad, half);
console.log('NaN === NaN:', bad === alsoBad, 'NaN == NaN:', bad == alsoBad);
console.log('self check:', bad !== bad);
console.log('Object.is:', Object.is(bad, NaN));
console.log('isNaN("abc"):', isNaN('abc'), 'Number.isNaN("abc"):', Number.isNaN('abc'));
console.log('NaN < 1:', bad < 1, 'NaN > 1:', bad > 1, 'NaN >= NaN:', bad >= bad);
const values = [1, NaN, 3];
console.log('indexOf:', values.indexOf(NaN), 'includes:', values.includes(NaN));
console.log('findIndex:', values.findIndex(Number.isNaN));
console.log('typeof NaN:', typeof bad);
const sum = values.reduce((acc, v) => acc + v, 0);
const clean = values.filter(v => !Number.isNaN(v));
const max = Math.max(...values);
const set = new Set([NaN, NaN, 0, -0]);
console.log(sum, clean, max, set.size);
