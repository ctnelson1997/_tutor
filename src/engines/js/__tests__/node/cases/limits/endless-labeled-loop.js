// endless: a labeled loop outer: while (true) {} never ends; the loop guard must still stop it
let status = "running";
const seen = [1, 2];
console.log(status, seen);
outer: while (true) {}
status = "done";
console.log(status);
