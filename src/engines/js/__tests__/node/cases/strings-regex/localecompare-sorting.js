// Default sort (UTF-16 order) vs localeCompare, numeric collation, case-insensitive sort, multi-key sort
const names = ["bob", "Alice", "carol", "Dave", "alice", "Émile"];
const byCodeUnits = [...names].sort();
console.log(byCodeUnits.join(" "));

const byLocale = [...names].sort((a, b) => a.localeCompare(b, "en"));
console.log(byLocale.join(" "));

const caseless = [...names].sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
console.log(caseless.join(" "));

console.log("a".localeCompare("b"), "b".localeCompare("a"), "a".localeCompare("a"));
console.log("a".localeCompare("A", "en", { sensitivity: "base" }), "résumé".localeCompare("resume", "en", { sensitivity: "base" }));

const files = ["file10.txt", "file2.txt", "file1.txt", "file20.txt"];
console.log([...files].sort().join(" "));
console.log([...files].sort((a, b) => a.localeCompare(b, "en", { numeric: true })).join(" "));

const students = [
  { last: "Lee", first: "Sam" },
  { last: "Kim", first: "Jo" },
  { last: "Lee", first: "Ana" },
];
students.sort((x, y) => x.last.localeCompare(y.last) || x.first.localeCompare(y.first));
const roster = students.map(s => `${s.last}, ${s.first}`);
console.log(roster);
