// Uses map, filter, reduce, sort, find, some and forEach on an array of employee objects
const employees = [
  { name: "Alice", dept: "Engineering", salary: 95000, years: 5 },
  { name: "Bob", dept: "Sales", salary: 55000, years: 2 },
  { name: "Carmen", dept: "Engineering", salary: 105000, years: 8 },
  { name: "Dan", dept: "Marketing", salary: 62000, years: 3 },
  { name: "Eve", dept: "Sales", salary: 70000, years: 6 },
  { name: "Frank", dept: "Marketing", salary: 58000, years: 1 }
];

const names = employees.map(e => e.name);
console.log("Names:", names);

const engineers = employees.filter(e => e.dept === "Engineering");
console.log("Engineers:", engineers.map(e => e.name).join(" & "));

const payroll = employees.reduce((total, e) => total + e.salary, 0);
console.log("Total payroll:", payroll);

const byDept = employees.reduce((groups, e) => {
  if (!groups[e.dept]) {
    groups[e.dept] = [];
  }
  groups[e.dept].push(e.name);
  return groups;
}, {});
console.log(byDept);

const bySalary = [...employees].sort((a, b) => b.salary - a.salary);
console.log("Highest paid:", bySalary[0].name);

const veteran = employees.find(e => e.years > 5);
console.log("First veteran:", veteran.name);
console.log("Anyone under 50k?", employees.some(e => e.salary < 50000));
console.log("Everyone over 50k?", employees.every(e => e.salary > 50000));

const raises = employees.map(e => ({ ...e, salary: Math.round(e.salary * 1.03) }));
raises.forEach((e, i) => {
  console.log(`${i + 1}. ${e.name}: ${e.salary}`);
});
