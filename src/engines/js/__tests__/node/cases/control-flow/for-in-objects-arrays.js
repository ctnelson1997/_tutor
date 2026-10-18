// for...in over an object, an array (string keys, extra props), and inherited properties
const scores = { alice: 90, bob: 72, carol: 85 };
let total = 0;
for (const name in scores) {
  console.log(name, scores[name]);
  total += scores[name];
}
console.log("total", total);

const arr = [10, 20, 30];
arr.extra = "x";
const keys = [];
for (const k in arr) {
  keys.push(k + ":" + typeof k);
}
console.log(keys);

const base = { kind: "animal", legs: 4 };
const dog = Object.create(base);
dog.name = "Rex";
dog.legs = 3;
const own = [];
const all = [];
for (const key in dog) {
  all.push(key);
  if (Object.hasOwn(dog, key)) own.push(key);
}
console.log("all:", all, "own:", own);

const obj = { b: 1, a: 2, 2: "two", 1: "one" };
let order = "";
for (const k in obj) order += k + " ";
console.log("order:", order);
