// push/pop/shift/unshift return values, mutation seen through an alias, a stack and a queue simulation
const queue = [];
const alias = queue;
console.log(queue.push('a'), queue.push('b', 'c'));
console.log(queue.unshift('z'), queue.unshift('x', 'y'));
console.log(queue);
console.log(queue.pop(), queue.shift(), alias.length);
console.log(alias);

const empty = [];
console.log(empty.pop(), empty.shift(), empty.length);

const stack = [];
const ops = ['push 1', 'push 2', 'pop', 'push 3', 'push 4', 'pop', 'pop'];
const popped = [];
for (const op of ops) {
  const [cmd, arg] = op.split(' ');
  if (cmd === 'push') stack.push(Number(arg));
  else popped.push(stack.pop());
}
console.log(stack, popped);

const line = ['Ann', 'Bob', 'Cat'];
const served = [];
while (line.length > 0) {
  const next = line.shift();
  served.push(next);
  if (next === 'Bob') line.push('Dan');
}
console.log(served, line);

const nested = [[1], [2]];
nested[0].push(9);
nested.push(nested[0]);
console.log(nested, nested[0] === nested[2]);
