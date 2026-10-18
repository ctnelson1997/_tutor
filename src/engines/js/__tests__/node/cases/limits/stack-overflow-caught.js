// unbounded recursion overflows the JS stack: the RangeError is caught and printed, and the program goes on
let deep = false;
function dive(n) {
  if (n > 1000) deep = true;
  return dive(n + 1) + 1;
}
let caught = null;
try {
  dive(1);
} catch (e) {
  caught = e;
  console.log(e instanceof RangeError, e.name);
  console.log(e.message);
}
console.log("went deeper than 1000 calls:", deep);
const recovered = "still running";
console.log(recovered, caught.name);
