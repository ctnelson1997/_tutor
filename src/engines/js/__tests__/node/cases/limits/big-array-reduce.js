// a big array of 100,000 numbers (built without a callback) summed with reduce
const nums = [...Array(100000).keys()];
console.log("length", nums.length, "first", nums[0], "last", nums[nums.length - 1]);
const total = nums.reduce((acc, n) => acc + n, 0);
console.log("total", total);
const tail = nums.slice(-3);
console.log("tail", tail);
