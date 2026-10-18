// Array.from on strings, Sets, Maps, array-likes, arguments and {length} with a map function; Array.of vs Array(n)
console.log(Array.from('hello'));
console.log(Array.from({ length: 5 }, (_, i) => i * i));
console.log(Array.from({ length: 3 }));
console.log(Array.from({ length: 2, 0: 'a', 1: 'b', 2: 'ignored' }));
console.log(Array.from(new Set([3, 1, 3, 2, 1])));
const m = new Map([['x', 1], ['y', 2]]);
console.log(Array.from(m), Array.from(m.keys()), Array.from(m.values(), (v) => v * 10));
console.log(Array.of(7), Array(7).length, Array.of(1, 2, 3), Array(1, 2, 3));

function sumAll() {
  const args = Array.from(arguments);
  return args.reduce((s, x) => s + x, 0);
}
console.log(sumAll(1, 2, 3, 4));

const grid = Array.from({ length: 3 }, (_, r) => Array.from({ length: 4 }, (_, c) => r * 4 + c));
console.log(grid);
const range = (start, end, step = 1) =>
  Array.from({ length: Math.ceil((end - start) / step) }, (_, i) => start + i * step);
console.log(range(0, 10, 3), range(5, 1, -1));
const original = [{ n: 1 }];
const copied = Array.from(original);
copied[0].n = 2;
console.log(original[0].n, copied !== original);
