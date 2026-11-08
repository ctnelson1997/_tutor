// Polyfill exercises replace built-in methods (#88): String.prototype.startsWith, Array.prototype.slice, Object.keys
String.prototype.startsWith = function (prefix) {
  return this.slice(0, prefix.length) === prefix;
};
let slices = 0;
const originalSlice = Array.prototype.slice;
Array.prototype.slice = function (...args) {
  slices++;
  return originalSlice.apply(this, args);
};
const originalKeys = Object.keys;
let keyCalls = 0;
Object.keys = function (o) {
  keyCalls++;
  return originalKeys(o);
};
const word = 'javascript';
console.log(word.startsWith('java'), word.startsWith('script'));
const nums = [1, 2, 3, 4];
console.log(nums.slice(1, 3), Object.keys({ a: 1, b: 2 }));
console.log(slices, keyCalls);
