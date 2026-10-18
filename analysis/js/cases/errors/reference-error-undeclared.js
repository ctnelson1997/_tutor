// ReferenceError from an undeclared name (typo) and from a let in its temporal dead zone; typeof stays safe
const results = [];

function useTypo() {
  const totalScore = 10;
  return totalScroe + 1;
}

function useBeforeLet() {
  const before = typeof later === "undefined" ? "unknown" : "known";
  results.push(before);
  const value = laterLet * 2;
  let laterLet = 3;
  return value;
}

for (const fn of [useTypo, useBeforeLet]) {
  try {
    results.push(fn());
  } catch (e) {
    results.push(e.name);
    console.log(fn.name, "->", e.name + ":", e.message, e instanceof ReferenceError);
  }
}

console.log(typeof neverDeclared, typeof results);
let shadow = "outer";
{
  try {
    console.log(shadow);
  } catch (e) {
    console.log("block TDZ:", e.message);
  }
  let shadow = "inner";
  results.push(shadow);
}
console.log(results.join(" "), shadow);
