// endless: while (true) {} with an empty body never ends; earlier steps and output should survive the stop
let count = 0;
const log = ["start"];
console.log("starting");
count = 1;
while (true) {}
console.log("never printed", count, log);
