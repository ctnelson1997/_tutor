// callbacks: functions passed to map/filter/reduce/sort/find, a hand-written forEach, error-first callbacks, map(parseInt)
const people = [
  { name: 'Ann', age: 31 },
  { name: 'Bo', age: 17 },
  { name: 'Cy', age: 45 },
  { name: 'Di', age: 22 },
];
const names = people.map(p => p.name);
const adults = people.filter(function (p) { return p.age >= 18; });
const totalAge = people.reduce((sum, p) => sum + p.age, 0);
const byAge = [...people].sort((a, b) => b.age - a.age).map(p => p.name);
const firstTeen = people.find(p => p.age < 20);
console.log(names, adults.length, totalAge, byAge, firstTeen);
function myForEach(array, callback) {
  for (let i = 0; i < array.length; i++) {
    callback(array[i], i, array);
  }
}
myForEach(['x', 'y'], (value, index, arr) => {
  console.log(index, value, arr.length);
});
function divide(a, b, done) {
  if (b === 0) {
    done(new Error('division by zero'));
    return;
  }
  done(null, a / b);
}
const outcomes = [];
function report(err, value) {
  outcomes.push(err ? 'error: ' + err.message : 'ok: ' + value);
}
divide(10, 4, report);
divide(1, 0, report);
console.log(outcomes);
const indexes = ['a', 'b', 'c'].map((letter, i) => letter + i);
const parsed = ['1', '2', '3'].map(parseInt);
console.log(indexes, parsed);
