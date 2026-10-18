// mutual recursion: isEven/isOdd calling each other, and Hofstadter's female/male sequences
function isEven(n) {
  if (n === 0) return true;
  return isOdd(n - 1);
}
function isOdd(n) {
  if (n === 0) return false;
  return isEven(n - 1);
}
console.log('isEven(4):', isEven(4));
console.log('isOdd(7):', isOdd(7));
function female(n) {
  return n === 0 ? 1 : n - male(female(n - 1));
}
function male(n) {
  return n === 0 ? 0 : n - female(male(n - 1));
}
const fs = [];
const ms = [];
for (let i = 0; i < 6; i++) {
  fs.push(female(i));
  ms.push(male(i));
}
console.log('F:', fs.join(' '));
console.log('M:', ms.join(' '));
const parity = [0, 1, 2, 3].map(n => (isEven(n) ? 'even' : 'odd'));
console.log(parity);
