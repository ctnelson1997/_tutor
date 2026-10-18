// Compares linear search and binary search on a sorted array, counting comparisons
function linearSearch(arr, target) {
  let comparisons = 0;
  for (let i = 0; i < arr.length; i++) {
    comparisons++;
    if (arr[i] === target) {
      return { index: i, comparisons };
    }
  }
  return { index: -1, comparisons };
}

function binarySearch(arr, target) {
  let low = 0;
  let high = arr.length - 1;
  let comparisons = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    comparisons++;
    if (arr[mid] === target) {
      return { index: mid, comparisons };
    } else if (arr[mid] < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { index: -1, comparisons };
}

function binarySearchRecursive(arr, target, low = 0, high = arr.length - 1) {
  if (low > high) return -1;
  const mid = Math.floor((low + high) / 2);
  if (arr[mid] === target) return mid;
  if (arr[mid] < target) return binarySearchRecursive(arr, target, mid + 1, high);
  return binarySearchRecursive(arr, target, low, mid - 1);
}

const sorted = [3, 8, 15, 21, 27, 34, 42, 56, 63, 71, 88, 95];
const targets = [42, 3, 95, 50];
const results = [];
for (const t of targets) {
  const lin = linearSearch(sorted, t);
  const bin = binarySearch(sorted, t);
  results.push({ target: t, linear: lin.comparisons, binary: bin.comparisons, found: bin.index });
  console.log(`target ${t}: index ${bin.index}, linear took ${lin.comparisons}, binary took ${bin.comparisons}`);
}
console.log("Recursive search for 71:", binarySearchRecursive(sorted, 71));
console.log("indexOf agrees:", targets.every(t => sorted.indexOf(t) === binarySearch(sorted, t).index));
