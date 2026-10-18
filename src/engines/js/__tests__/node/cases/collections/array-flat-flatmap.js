// flat with depth and Infinity (holes removed), flatMap returning arrays or [], and a recursive flatten using spread
const nested = [1, [2, [3, [4, [5]]]]];
console.log(nested.flat());
console.log(nested.flat(2));
console.log(nested.flat(Infinity));
console.log([1, , 3, [4, , 6]].flat());

const sentences = ['the quick fox', 'jumps over', ''];
const words = sentences.flatMap((s) => s.split(' '));
console.log(words, words.length);
console.log(sentences.map((s) => s.split(' ')));

const nums = [1, 2, 3, 4];
console.log(nums.flatMap((n) => (n % 2 === 0 ? [n, n * 10] : [])));
console.log(nums.flatMap((n) => [[n]]));

function flatten(arr) {
  const out = [];
  for (const item of arr) {
    if (Array.isArray(item)) out.push(...flatten(item));
    else out.push(item);
  }
  return out;
}
const flatResult = flatten([[['a']], 'b', [['c', ['d']]]]);
console.log(flatResult);
const orders = [{ id: 1, items: ['pen', 'ink'] }, { id: 2, items: [] }, { id: 3, items: ['pad'] }];
const allItems = orders.flatMap((o) => o.items.map((item) => `${o.id}:${item}`));
console.log(allItems);
