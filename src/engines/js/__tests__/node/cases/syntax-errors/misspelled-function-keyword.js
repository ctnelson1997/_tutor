// syntax error: the keyword function is misspelled (fucntion)
const names = ["Ann", "Bo"];
let greeted = 0;
fucntion greet(name) {
  greeted++;
  return "Hi " + name;
}
console.log(names.map(greet), greeted);
