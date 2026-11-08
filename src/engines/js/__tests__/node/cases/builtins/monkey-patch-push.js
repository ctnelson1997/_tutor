// Monkey-patching a built-in method (#88): only the program's own calls go through the patch
const originalPush = Array.prototype.push;
let calls = 0;
Array.prototype.push = function (...items) {
  calls++;
  console.log('push called with', items);
  return originalPush.apply(this, items);
};
const list = [];
list.push(1);
list.push(2, 3);
Array.prototype.push = originalPush;
console.log(list, calls);
