// Assigning length truncates or extends with holes; length = 0 clears an aliased array; length-- and arr[arr.length]
const nums = [1, 2, 3, 4, 5];
nums.length = 3;
console.log(nums, nums[3]);
nums.length = 6;
console.log(nums, nums.length, 4 in nums);

const shared = ['x', 'y', 'z'];
const ref = shared;
let other = shared;
other = [];
console.log(shared, other);
shared.length = 0;
console.log(ref, ref.length);

const big = [];
big[99] = 'last';
console.log(big.length, Object.keys(big).length);
big.length = 50;
console.log(big.length, big[99]);

const stack = ['a', 'b', 'c', 'd'];
stack.length--;
console.log(stack);
stack[stack.length] = 'e';
console.log(stack);

const s = 'hello';
const chars = [...s];
chars.length = 2;
console.log(chars.join(''), s.length);
try {
  nums.length = -1;
} catch (e) {
  console.log(e.name);
}
console.log(nums);
