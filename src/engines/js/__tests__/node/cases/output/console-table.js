// console.table of an array of objects, an object of objects, a plain array, a column filter, and a non-table value
const students = [
  { name: "Ann", grade: 91, passed: true },
  { name: "Bob", grade: 58, passed: false },
  { name: "Cy", grade: 77 },
];
const byCity = {
  madison: { pop: 270000, state: "WI" },
  austin: { pop: 960000, state: "TX" },
};
const primes = [2, 3, 5, 7];
const matrix = [
  [1, 2],
  [3, 4, 5],
];
console.table(students);
console.table(byCity);
console.table(primes);
console.table(matrix);
console.table(students, ["name"]);
console.table("not tabular");
console.table([]);
const average = students.reduce((s, x) => s + x.grade, 0) / students.length;
console.log("average", average);
