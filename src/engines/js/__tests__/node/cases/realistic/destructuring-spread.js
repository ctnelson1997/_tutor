// Practices destructuring, rest parameters, spread, swapping, and merging objects
const point = [3, 7];
let [x, y] = point;
[x, y] = [y, x];
console.log("swapped:", x, y);

const [first, second, ...others] = [10, 20, 30, 40, 50];
console.log(first, second, others);

const user = { name: "Kim", age: 21, address: { city: "Madison", zip: "53703" } };
const { name, age: years, address: { city }, email = "none" } = user;
console.log(`${name} is ${years} and lives in ${city}; email: ${email}`);

function sumAll(...nums) {
  let total = 0;
  for (const n of nums) total += n;
  return total;
}
console.log("sum:", sumAll(1, 2, 3), sumAll(...point, 10));

function describePet({ name, species = "cat", age }) {
  return `${name} the ${species}, age ${age}`;
}
console.log(describePet({ name: "Milo", age: 3 }));
console.log(describePet({ name: "Rex", species: "dog", age: 5 }));

const defaults = { theme: "light", fontSize: 14, notifications: true };
const prefs = { fontSize: 18, theme: "dark" };
const settings = { ...defaults, ...prefs, updated: true };
console.log(settings);

const nums = [5, 1, 4];
const more = [0, ...nums, 9];
const copy = [...more];
copy.push(100);
console.log(more, copy);

const pairs = Object.entries(settings).map(([key, value]) => `${key}=${value}`);
console.log(pairs.join("&"));
const { theme, ...rest } = settings;
console.log(theme, rest);
