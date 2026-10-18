// const stops rebinding (a caught TypeError), not mutation; Object.freeze is shallow and fails silently in sloppy mode
const user = { name: 'Ada', tags: ['math'] };
user.name = 'Grace';
user.tags.push('navy');
user.age = 85;
console.log(user);
let rebindError = '';
try {
  user = { name: 'new' };
} catch (e) {
  rebindError = e.name + ': ' + e.message;
}
console.log(rebindError);
const frozen = Object.freeze({ level: 1, inner: { level: 2 } });
frozen.level = 99;
frozen.added = true;
frozen.inner.level = 3;
console.log(frozen, Object.isFrozen(frozen), Object.isFrozen(frozen.inner));
const list = [1, 2, 3];
list.length = 1;
list[3] = 4;
console.log(list, list.length);
const sealed = Object.seal({ x: 1 });
sealed.x = 2;
sealed.y = 3;
delete sealed.x;
console.log(sealed);
for (const item of [10, 20]) {
  console.log('const in for-of gets a new binding each time:', item);
}
