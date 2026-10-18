// switch(true) with range conditions, and case expressions with side effects evaluated in order
function grade(score) {
  switch (true) {
    case score >= 90:
      return "A";
    case score >= 80:
      return "B";
    case score >= 70:
      return "C";
    default:
      return "F";
  }
}
const scores = [95, 83, 70, 42];
const grades = scores.map(grade);
console.log(grades.join(","));

let evaluated = [];
function test(name, value) {
  evaluated.push(name);
  return value;
}
switch (3) {
  case test("first", 1):
    console.log("first");
    break;
  case test("second", 3):
    console.log("second matched");
    break;
  case test("third", 3):
    console.log("third");
}
console.log("case expressions evaluated:", evaluated);
