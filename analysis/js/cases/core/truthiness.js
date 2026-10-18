// which values are truthy and falsy, as seen by if, !, !!, Boolean(), || and ??
const values = [0, -0, 0n, '', ' ', '0', 'false', null, undefined, NaN, [], {}, [0], -1, Infinity, function () {}];
const labels = ['0', '-0', '0n', "''", "' '", "'0'", "'false'", 'null', 'undefined', 'NaN', '[]', '{}', '[0]', '-1', 'Infinity', 'function'];
const truthy = [];
const falsy = [];
for (let i = 0; i < values.length; i++) {
  if (values[i]) {
    truthy.push(labels[i]);
  } else {
    falsy.push(labels[i]);
  }
}
console.log('truthy:', truthy.join(' '));
console.log('falsy:', falsy.join(' '));
console.log(!!'0', !![], Boolean(''), !0, !'hi');
const name = '';
const display = name || 'anonymous';
const count = 0;
const shown = count || 'none';
const kept = count ?? 'none';
console.log(display, shown, kept);
const emptyArrayEqualsFalse = [] == false;
console.log('[] == false:', emptyArrayEqualsFalse, 'but [] is truthy:', !![]);
