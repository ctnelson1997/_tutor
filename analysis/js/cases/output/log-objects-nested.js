// console.log of objects: empty, nested past the default depth, odd keys, arrays of objects, long objects that wrap
const empty = {};
const point = { x: 1, y: 2 };
const user = {
  name: "Grace",
  address: { city: "Arlington", geo: { lat: 38.88, lng: -77.1, extra: { level: 4, deeper: { level: 5 } } } },
  tags: ["admin", "dev"],
};
const oddKeys = { "first name": "Al", "x-y": 1, 42: "answer", valid_id: true, "": "empty" };
const people = [
  { name: "Ann", age: 30 },
  { name: "Bob", age: 25 },
];
const wide = { alpha: "aaaaaaaaaa", beta: "bbbbbbbbbb", gamma: "cccccccccc", delta: "dddddddddd", epsilon: 5 };
const proto = Object.create(null);
proto.bare = true;
console.log(empty, point);
console.log(user);
console.log(oddKeys);
console.log(people);
console.log(wide);
console.log(proto);
console.log({ nested: { a: { b: { c: {} } } } });
