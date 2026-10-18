// syntax error: a semicolon after an if block leaves the else with no if
const score = 72;
let result = "";
if (score >= 60) {
  result = "pass";
};
else {
  result = "fail";
}
console.log(result);
