// Recursively flattens nested arrays, sums nested numbers, finds the depth and counts nested keys
function flatten(arr) {
  let result = [];
  for (const item of arr) {
    if (Array.isArray(item)) {
      result = result.concat(flatten(item));
    } else {
      result.push(item);
    }
  }
  return result;
}

function deepSum(arr) {
  let total = 0;
  for (const item of arr) {
    total += Array.isArray(item) ? deepSum(item) : item;
  }
  return total;
}

function depth(arr) {
  let max = 0;
  for (const item of arr) {
    if (Array.isArray(item)) {
      max = Math.max(max, depth(item));
    }
  }
  return max + 1;
}

function countKeys(obj) {
  let count = 0;
  for (const key in obj) {
    count++;
    if (typeof obj[key] === "object" && obj[key] !== null) {
      count += countKeys(obj[key]);
    }
  }
  return count;
}

const nested = [1, [2, 3], [4, [5, [6, 7]]], 8, [[9]]];
const flat = flatten(nested);
console.log("Flat:", flat);
console.log("Sum:", deepSum(nested));
console.log("Depth:", depth(nested));
const builtIn = nested.flat(Infinity);
console.log("Same as flat(Infinity)?", JSON.stringify(flat) === JSON.stringify(builtIn));
console.log("One level:", JSON.stringify(nested.flat()));

const config = { a: 1, b: { c: 2, d: { e: 3, f: null } }, g: [10, 20] };
console.log("Keys in nested object:", countKeys(config));
