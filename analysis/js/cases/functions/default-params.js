// default parameters: referencing earlier parameters, a fresh default each call, undefined vs null, and fn.length
function greet(name = 'friend', greeting = 'Hello', message = greeting + ', ' + name + '!') {
  return message;
}
console.log(greet());
console.log(greet('Sam'));
console.log(greet('Sam', 'Hi'));
console.log(greet(undefined, 'Hey'));
console.log(greet(null, 'Yo'));
function addItem(item, list = []) {
  list.push(item);
  return list;
}
const first = addItem('a');
const second = addItem('b');
console.log(first, second, first === second);
let calls = 0;
function nextId() {
  calls++;
  return calls * 100;
}
function makeUser(name, id = nextId()) {
  return { name, id };
}
const u1 = makeUser('x');
const u2 = makeUser('y', 7);
const u3 = makeUser('z');
console.log(u1, u2, u3, 'nextId called', calls, 'times');
function rect(width, height = width) {
  return width * height;
}
console.log(rect(3), rect(3, 4));
console.log('lengths:', greet.length, addItem.length, rect.length, makeUser.length);
