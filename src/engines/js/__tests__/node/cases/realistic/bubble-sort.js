// Sorts an array with bubble sort, stopping early when a pass makes no swaps
function bubbleSort(arr) {
  const a = arr.slice();
  let passes = 0;
  let swaps = 0;
  for (let end = a.length - 1; end > 0; end--) {
    let swapped = false;
    for (let i = 0; i < end; i++) {
      if (a[i] > a[i + 1]) {
        const temp = a[i];
        a[i] = a[i + 1];
        a[i + 1] = temp;
        swapped = true;
        swaps++;
      }
    }
    passes++;
    console.log("After pass " + passes + ": " + a.join(", "));
    if (!swapped) {
      break;
    }
  }
  return { sorted: a, passes, swaps };
}

const numbers = [29, 10, 14, 37, 13, 5, 22, 18];
const result = bubbleSort(numbers);
console.log("Original:", numbers);
console.log("Sorted:", result.sorted);
console.log("Passes:", result.passes, "Swaps:", result.swaps);
const alreadySorted = bubbleSort([1, 2, 3, 4]);
console.log("Already sorted took", alreadySorted.passes, "pass");
