// printing circular structures: an object that points to itself, a cycle through two objects, an array containing itself
const node = { name: "self" };
node.me = node;
const a = { name: "a" };
const b = { name: "b", peer: a };
a.peer = b;
const arr = [1, 2];
arr.push(arr);
const parent = { name: "p", children: [] };
const child = { name: "c", parent };
parent.children.push(child);
const ring = new Map();
ring.set("ring", ring);
console.log(node);
console.log(a);
console.log(b);
console.log(arr);
console.log(parent);
console.log([node, a]);
console.log(ring);
let jsonError = "";
try {
  JSON.stringify(node);
} catch (e) {
  jsonError = e.name;
}
console.log("JSON.stringify threw", jsonError);
