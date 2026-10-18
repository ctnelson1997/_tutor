// An object pointing to itself and an array containing itself: logging, walking, and JSON with a cycle guard
const node = { name: 'root', value: 1 };
node.self = node;
node.children = [node];
console.log(node.self === node, node.self.self.self.name);
console.log(node);

const arr = [1, 2];
arr.push(arr);
console.log(arr.length, arr[2][2][2] === arr);
console.log(arr);

let depth = 0;
let cur = node;
while (cur.self && depth < 5) {
  cur = cur.self;
  depth++;
}
console.log('walked', depth);

try {
  JSON.stringify(node);
} catch (e) {
  console.log(e.name);
}

const seen = new WeakSet();
const safe = JSON.stringify(node, (key, value) => {
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
  }
  return value;
});
console.log(safe);
console.log(String(arr));
