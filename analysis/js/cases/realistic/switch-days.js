// Uses switch statements on strings to classify days, count days in months and run a calculator
function dayType(day) {
  switch (day.toLowerCase()) {
    case "saturday":
    case "sunday":
      return "weekend";
    case "monday":
    case "tuesday":
    case "wednesday":
    case "thursday":
    case "friday":
      return "weekday";
    default:
      return "not a day";
  }
}

function daysInMonth(month) {
  let days;
  switch (month) {
    case "February":
      days = 28;
      break;
    case "April":
    case "June":
    case "September":
    case "November":
      days = 30;
      break;
    default:
      days = 31;
  }
  return days;
}

function calculator(op, a, b) {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      if (b === 0) return "cannot divide by zero";
      return a / b;
    default:
      return `unknown operator ${op}`;
  }
}

const days = ["Monday", "Saturday", "Funday", "SUNDAY", "friday"];
for (const d of days) {
  console.log(`${d}: ${dayType(d)}`);
}

const months = ["January", "February", "April", "September", "December"];
let totalDays = 0;
for (const m of months) {
  const n = daysInMonth(m);
  totalDays += n;
  console.log(m + " has " + n + " days");
}
console.log("Total:", totalDays);

const ops = [["+", 6, 3], ["-", 6, 3], ["*", 6, 3], ["/", 6, 3], ["/", 1, 0], ["%", 7, 2]];
const answers = ops.map(([op, a, b]) => calculator(op, a, b));
console.log(answers);
