// Default sort compares as strings (100 before 25), numeric/object comparators, stable ties, undefined last, toSorted
const nums = [10, 9, 1, 100, 25, -3, 2];
const alias = nums;
nums.sort();
console.log(nums, alias === nums);
nums.sort((a, b) => a - b);
console.log(nums);
nums.sort((a, b) => b - a);
console.log(nums);

const words = ['banana', 'Apple', 'cherry', 'apple', 'Banana'];
console.log([...words].sort());
const lower = (s) => s.toLowerCase();
console.log([...words].sort((a, b) => (lower(a) < lower(b) ? -1 : lower(a) > lower(b) ? 1 : 0)));

const mixed = [3, undefined, 1, null, 2, undefined];
console.log(mixed.sort());

const students = [
  { name: 'Ann', grade: 90 },
  { name: 'Bob', grade: 85 },
  { name: 'Cat', grade: 90 },
  { name: 'Dan', grade: 85 },
  { name: 'Eve', grade: 95 },
];
const byGrade = [...students].sort((a, b) => b.grade - a.grade);
console.log(byGrade.map((s) => `${s.name}:${s.grade}`).join(' '));
const byLen = ['ccc', 'a', 'bb', 'dd', 'e'].sort((a, b) => a.length - b.length);
console.log(byLen);
let comparisons = 0;
const sorted = [5, 4, 3, 2, 1].toSorted((a, b) => {
  comparisons++;
  return a - b;
});
console.log(sorted, comparisons > 0);
console.log([true, false, true].sort(), [0.5, 0.25, 1e21, 3].sort());
