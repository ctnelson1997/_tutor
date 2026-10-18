// Sorts names alphabetically and products by price using a selection sort with a compare function
function selectionSort(items, compare) {
  const arr = [...items];
  for (let i = 0; i < arr.length - 1; i++) {
    let minIndex = i;
    for (let j = i + 1; j < arr.length; j++) {
      if (compare(arr[j], arr[minIndex]) < 0) {
        minIndex = j;
      }
    }
    if (minIndex !== i) {
      [arr[i], arr[minIndex]] = [arr[minIndex], arr[i]];
    }
  }
  return arr;
}

const names = ["Maya", "Liam", "Zoe", "Ethan", "Ava", "Noah", "Olivia"];
const byName = selectionSort(names, (a, b) => (a < b ? -1 : a > b ? 1 : 0));
console.log(byName);

const products = [
  { name: "Notebook", price: 3.5 },
  { name: "Backpack", price: 24.99 },
  { name: "Pencil", price: 0.25 },
  { name: "Calculator", price: 12 },
  { name: "Ruler", price: 1.75 }
];
const byPrice = selectionSort(products, (a, b) => a.price - b.price);
for (const p of byPrice) {
  console.log(p.name.padEnd(12) + "$" + p.price.toFixed(2));
}
const cheapest = byPrice[0];
const priciest = byPrice[byPrice.length - 1];
console.log(`Cheapest: ${cheapest.name}, priciest: ${priciest.name}`);
console.log("Same objects?", cheapest === products[2]);
