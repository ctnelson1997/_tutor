// unbounded recursion overflows the JS stack: the RangeError is caught and printed, and the program goes on
let depth = 0;
function dive(n) {
  depth = n;
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
console.log("went deeper than 1000 calls:", depth > 1000);
const recovered = "still running";
console.log(recovered, caught.name);
