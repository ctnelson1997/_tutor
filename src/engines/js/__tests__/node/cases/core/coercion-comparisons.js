// relational comparisons with mixed types: string vs number ordering, null and undefined, default sort order
const results = {
  stringOrder: '10' < '9',
  numberVsString: 10 < '9',
  nullGe0: null >= 0,
  nullGt0: null > 0,
  nullEq0: null == 0,
  undefinedEq0: undefined == 0,
  undefinedLt1: undefined < 1,
  arrayGt: [2] > 1,
  letters: 'apple' < 'banana',
  caps: 'Zebra' < 'apple',
  boolMath: true > false,
  chained: 3 > 2 > 1,
  chainedUp: 1 < 2 < 3,
};
for (const key in results) {
  console.log(key, results[key]);
}
const words = ['banana', 'Apple', 'cherry', '10', '9'];
const sorted = words.slice().sort();
const nums = [10, 9, 1, 100, 25];
const defaultSorted = nums.slice().sort();
const numericSorted = nums.slice().sort((x, y) => x - y);
console.log(sorted);
console.log(defaultSorted, numericSorted);
