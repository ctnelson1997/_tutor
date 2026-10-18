// splice (remove, insert, replace, negative start) mutates and returns removed items; slice copies; splice-in-loop bug
const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
const removed = letters.splice(1, 2);
console.log(removed, letters);
const none = letters.splice(1, 0, 'X', 'Y');
console.log(none, letters);
const replaced = letters.splice(-2, 1, 'Q');
console.log(replaced, letters);
const tail = letters.splice(4);
console.log(tail, letters);

const nums = [10, 20, 30, 40, 50];
console.log(nums.slice(1, 3), nums.slice(-2), nums.slice(3, 1), nums.slice());
const copy = nums.slice();
copy[0] = 99;
console.log(nums[0], copy[0]);

const objs = [{ id: 1 }, { id: 2 }];
const objCopy = objs.slice();
objCopy[0].id = 100;
console.log(objs[0].id, objCopy === objs);

const todo = ['wash', 'cook', 'clean', 'shop', 'nap'];
for (let i = todo.length - 1; i >= 0; i--) {
  if (todo[i].length === 4) todo.splice(i, 1);
}
console.log(todo);

const buggy = [1, 2, 2, 3, 2];
for (let i = 0; i < buggy.length; i++) {
  if (buggy[i] === 2) buggy.splice(i, 1);
}
console.log(buggy);
