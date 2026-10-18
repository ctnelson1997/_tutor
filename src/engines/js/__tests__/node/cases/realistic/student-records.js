// Stores students as objects, computes averages, finds the top student and the honor roll
const students = [
  { name: "Maria", id: 101, grades: { math: 91, science: 88, english: 94 } },
  { name: "James", id: 102, grades: { math: 72, science: 80, english: 68 } },
  { name: "Priya", id: 103, grades: { math: 98, science: 95, english: 89 } },
  { name: "Tom", id: 104, grades: { math: 65, science: 70, english: 77 } }
];

function studentAverage(student) {
  let total = 0;
  let count = 0;
  for (const subject in student.grades) {
    total += student.grades[subject];
    count++;
  }
  return total / count;
}

let top = null;
for (const s of students) {
  s.average = Math.round(studentAverage(s) * 100) / 100;
  if (top === null || s.average > top.average) {
    top = s;
  }
}

console.log("Top student:", top.name, top.average);
const honorRoll = students.filter(s => s.average >= 85).map(s => s.name);
console.log("Honor roll:", honorRoll.join(", "));

const subjects = Object.keys(students[0].grades);
const subjectAverages = {};
for (const subject of subjects) {
  let sum = 0;
  for (const s of students) {
    sum += s.grades[subject];
  }
  subjectAverages[subject] = sum / students.length;
}
console.log(subjectAverages);

const james = students.find(s => s.id === 102);
james.grades.english = 75;
console.log(`${james.name}'s new average: ${studentAverage(james).toFixed(2)}`);
delete james.average;
console.log(james);
