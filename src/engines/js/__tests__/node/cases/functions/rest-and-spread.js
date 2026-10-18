// rest parameters collect extra arguments; spread expands arrays, strings and objects into calls and literals
function sum(first, ...rest) {
  console.log('first:', first, 'rest:', rest, 'rest is array:', Array.isArray(rest));
  return rest.reduce((total, n) => total + n, first);
}
console.log(sum(1, 2, 3, 4));
console.log(sum(10));
const nums = [4, 8, 15, 16, 23, 42];
console.log(Math.max(...nums), sum(...nums));
const more = [0, ...nums.slice(0, 2), 99];
const letters = [...'hey'];
console.log(more, letters);
const defaults = { theme: 'light', size: 12 };
const prefs = { ...defaults, size: 14, bold: true };
const copy = { ...prefs };
copy.size = 20;
console.log(prefs, copy);
const [head, ...tail] = nums;
const { theme, ...others } = prefs;
console.log(head, tail, theme, others);
const logAll = (label, ...items) => `${label}: ${items.length} item(s) -> ${items.join('|')}`;
console.log(logAll('fruits', 'apple', 'pear'));
console.log(logAll('none'));
console.log('lengths ignore the rest parameter:', sum.length, logAll.length);
