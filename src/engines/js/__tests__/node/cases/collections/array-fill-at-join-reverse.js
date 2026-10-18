// fill with ranges and negative indexes, at() with negatives, join edge cases, reverse mutating through an alias
const zeros = new Array(5).fill(0);
console.log(zeros);
zeros.fill(7, 1, 3);
console.log(zeros);
zeros.fill(9, -2);
console.log(zeros);

const nums = [10, 20, 30, 40];
console.log(nums.at(0), nums.at(-1), nums.at(-4), nums.at(10), nums[nums.length - 1]);

console.log([1, 2, 3].join(), [1, 2, 3].join(''), [1, 2, 3].join(' - '));
console.log([null, undefined, 1, [2, 3], {}].join('|'));
console.log([].join(','), [5].join(','), Array(4).join('ab'));

const original = ['a', 'b', 'c'];
const alias = original;
const reversed = original.reverse();
console.log(reversed === original, alias, original);
const safe = [...original].reverse();
console.log(safe, original);

function isPalindrome(str) {
  const clean = str.toLowerCase().replace(/[^a-z]/g, '');
  return clean === clean.split('').reverse().join('');
}
console.log(isPalindrome('A man, a plan, a canal: Panama'), isPalindrome('hello'));
const grid = Array(3).fill('.');
grid[1] = '#';
console.log(grid.join(''), grid);
