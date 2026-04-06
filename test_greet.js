const { instrument } = require('./src/engines/js/instrumenter');

const code = `function greet(g) {
   console.log(g());
   console.log(":)");
}
function hello() {
  return "Hello there!";
}
function welcome() {
  return "Welcome!";
}
greet(hello);
greet(welcome);`;

const instrumented = instrument(code);
console.log("=== INSTRUMENTED CODE ===");
console.log(instrumented);
