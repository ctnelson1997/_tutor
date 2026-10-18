// Sorts numbers and words in place with insertion sort, printing the array after each insertion
function insertionSort(arr) {
  for (let i = 1; i < arr.length; i++) {
    const current = arr[i];
    let j = i - 1;
    while (j >= 0 && arr[j] > current) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = current;
    console.log(`i=${i}: [${arr.join(" ")}]`);
  }
  return arr;
}

const data = [12, 11, 13, 5, 6, 7, 1, 9];
const original = data.slice();
insertionSort(data);
console.log("Before:", original.join(","));
console.log("After:", data.join(","));

const isSorted = data.every((value, index) => index === 0 || data[index - 1] <= value);
console.log("Sorted correctly?", isSorted);

const words = ["pear", "apple", "fig", "banana"];
const returned = insertionSort(words);
console.log(words, returned === words);
