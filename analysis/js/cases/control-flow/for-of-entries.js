// for...of with entries() on arrays and Maps, Object.entries, destructuring and continue
const fruits = ["apple", "banana", "cherry"];
for (const [i, fruit] of fruits.entries()) {
  console.log(i, fruit);
}

const stock = { apple: 5, banana: 0, cherry: 12 };
const empty = [];
for (const [name, count] of Object.entries(stock)) {
  if (count === 0) {
    empty.push(name);
    continue;
  }
  console.log(`${name}: ${count}`);
}
console.log("out of stock:", empty);

const m = new Map();
m.set("x", { v: 1 }).set("y", { v: 2 });
for (const entry of m.entries()) {
  entry[1].v *= 10;
  console.log(entry);
}
const iter = fruits.entries();
const first = iter.next();
console.log(first.value, first.done);
