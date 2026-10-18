// syntax error: the same let variable is declared twice in one scope
let count = 0;
const items = ["a", "b", "c"];
for (const item of items) {
  count++;
}
let count = items.length;
console.log(count);
