// comma expressions: two counters in a for header, and sequence expressions as values
const word = "racecar";
let isPal = true;
for (let lo = 0, hi = word.length - 1; lo < hi; lo++, hi--) {
  if (word[lo] !== word[hi]) {
    isPal = false;
    break;
  }
}
console.log(word, "palindrome?", isPal);

const arr = [1, 2, 3, 4, 5, 6];
for (let a = 0, b = arr.length - 1, t; a < b; a++, b--) {
  t = arr[a];
  arr[a] = arr[b];
  arr[b] = t;
}
console.log("reversed", arr);

let x = (1, 2, 3);
console.log("x", x);
let calls = 0;
let y = (calls++, calls++, calls * 10);
console.log("y", y, "calls", calls);
let p, q;
for (p = 0, q = 10; p < q; p += 2, q -= 2) console.log(p, q);
