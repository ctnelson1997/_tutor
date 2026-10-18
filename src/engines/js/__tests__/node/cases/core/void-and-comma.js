// the void operator always yields undefined; the comma operator evaluates left to right and keeps the last value
let sideEffect = 0;
const v1 = void 0;
const v2 = void (sideEffect = 5);
const v3 = void 'ignored';
console.log(v1, v2, v3, sideEffect);
let a = 1;
const b = (a++, a++, a * 10);
console.log('comma result:', b, 'a is now', a);
const pairs = [];
for (let i = 0, j = 10; i < j; i += 3, j -= 3) {
  pairs.push([i, j]);
}
console.log(pairs);
let x = (1, 2, 3);
const log = [];
const last = (log.push('first'), log.push('second'), log.length);
console.log(x, last, log);
const arrow = () => (sideEffect += 1, sideEffect * 2);
console.log(arrow(), arrow(), sideEffect);
console.log(typeof void function () { return 1; }());
