// Recursively sorts an array with merge sort and counts how many merges happen
let mergeCount = 0;

function merge(left, right) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      result.push(left[i]);
      i++;
    } else {
      result.push(right[j]);
      j++;
    }
  }
  mergeCount++;
  return result.concat(left.slice(i)).concat(right.slice(j));
}

function mergeSort(arr) {
  if (arr.length <= 1) {
    return arr;
  }
  const mid = Math.floor(arr.length / 2);
  const left = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  return merge(left, right);
}

const values = [38, 27, 43, 3, 9, 82, 10, 15];
const sortedValues = mergeSort(values);
console.log("Input: ", values.join(" "));
console.log("Output:", sortedValues.join(" "));
console.log("Merges performed:", mergeCount);
const letters = mergeSort("mergesort".split(""));
console.log(letters.join(""));
