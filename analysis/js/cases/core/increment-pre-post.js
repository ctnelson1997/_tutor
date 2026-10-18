// prefix vs postfix ++ and -- inside expressions, on strings, missing properties and array indexes
let i = 5;
const post = i++;
const pre = ++i;
console.log(post, pre, i);
let j = 10;
const mixed = j++ + ++j;
console.log(mixed, j);
let k = 3;
k = k++;
console.log('k = k++ leaves k at', k);
const arr = [0, 0, 0, 0];
let idx = 0;
arr[idx++] = idx;
arr[idx++] = idx;
arr[++idx] = idx;
console.log(arr, idx);
let s = '5';
s++;
console.log(s, typeof s);
let t = 'abc';
t++;
console.log(t);
const counts = {};
counts.hits++;
counts.misses = (counts.misses || 0) + 1;
console.log(counts);
let n = 0;
while (n++ < 3) {
  console.log('loop sees n =', n);
}
console.log('after loop n =', n);
let d = 2;
const dec = d-- - --d;
console.log(dec, d);
