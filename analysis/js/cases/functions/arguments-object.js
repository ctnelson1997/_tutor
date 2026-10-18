// the arguments object: length, indexing, Array.from, sloppy-mode aliasing with parameters, arrows using the outer one
function describeArgs(a, b) {
  console.log('length:', arguments.length, 'declared:', describeArgs.length);
  console.log('a, b:', a, b, 'arguments[2]:', arguments[2]);
  return Array.from(arguments);
}
const all = describeArgs(1, 'two', [3], { four: 4 });
console.log(all);
console.log(describeArgs('only one'));
function aliasing(x) {
  arguments[0] = 'changed via arguments';
  const first = x;
  x = 'changed via param';
  return [first, arguments[0]];
}
console.log(aliasing('original'));
function noAlias(x = 'default') {
  arguments[0] = 'changed';
  return x;
}
console.log('with a default parameter, no aliasing:', noAlias('original'));
function outer() {
  const arrow = () => arguments[0] + ' seen from arrow';
  return arrow('ignored');
}
console.log(outer('outer arg'));
function average() {
  if (arguments.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arguments.length; i++) {
    sum += arguments[i];
  }
  return sum / arguments.length;
}
const avg = average(2, 4, 9);
console.log(avg, average());
