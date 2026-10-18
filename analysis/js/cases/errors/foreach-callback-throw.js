// An error thrown inside forEach / map callbacks is caught outside, stopping iteration partway
const items = [3, 7, -1, 9];
const processed = [];

try {
  items.forEach((item, index) => {
    if (item < 0) {
      throw new Error(`negative at index ${index}`);
    }
    processed.push(item * 2);
  });
} catch (e) {
  console.log("caught:", e.message);
}
console.log("processed", processed);

let found = null;
try {
  items.forEach(item => {
    if (item > 5) {
      found = item;
      throw "stop";
    }
  });
} catch (signal) {
  console.log("stopped with", signal, "found", found);
}

function safeMap(arr, fn) {
  try {
    return arr.map(fn);
  } catch (e) {
    return `map failed: ${e.message}`;
  }
}
const mapped = safeMap(["a", "bb", null], s => s.toUpperCase());
const okMapped = safeMap(["x", "y"], s => s + s);
console.log(mapped);
console.log(okMapped);
