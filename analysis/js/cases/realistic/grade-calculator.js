// Validates raw score strings, computes each student's average and letter grade, and the class average
function letterGrade(score) {
  if (score >= 90) {
    return "A";
  } else if (score >= 80) {
    return "B";
  } else if (score >= 70) {
    return "C";
  } else if (score >= 60) {
    return "D";
  }
  return "F";
}

function parseScores(rawList) {
  const valid = [];
  for (var i = 0; i < rawList.length; i++) {
    const n = parseFloat(rawList[i]);
    if (isNaN(n) || n < 0 || n > 100) {
      console.log(`  skipping invalid score "${rawList[i]}"`);
      continue;
    }
    valid.push(n);
  }
  return valid;
}

function average(nums) {
  let total = 0;
  for (let i = 0; i < nums.length; i++) {
    total += nums[i];
  }
  return total / nums.length;
}

const roster = {
  Ava: ["92", "88", "95.5"],
  Ben: ["75", "sixty", "81"],
  Cara: ["58", "62", "", "49"],
  Dev: ["85", "90", "105", "78"]
};

const report = [];
for (const name in roster) {
  console.log("Grading " + name);
  const scores = parseScores(roster[name]);
  const avg = average(scores);
  const grade = letterGrade(avg);
  report.push({ name: name, avg: Math.round(avg * 10) / 10, grade: grade });
  console.log(name + ": " + avg.toFixed(1) + " (" + grade + ")");
}

let classTotal = 0;
for (const entry of report) {
  classTotal += entry.avg;
}
const classAverage = classTotal / report.length;
console.log("Class average: " + classAverage.toFixed(2));
const passing = report.filter(r => r.grade !== "F").length;
console.log(passing + " of " + report.length + " students passed");
