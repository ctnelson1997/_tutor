// Arrays with named properties: length ignores them, for-in/Object.keys include them, JSON/spread/map drop them; regex match arrays
const scores = [90, 85, 77];
scores.label = 'midterm';
scores.max = Math.max(...scores);
scores['2'] = 70;
scores['-1'] = 'negative key';
scores[1.5] = 'fraction key';
console.log(scores.length, scores);
console.log(Object.keys(scores));

const viaForIn = [];
for (const k in scores) viaForIn.push(k);
console.log(viaForIn);
const viaForOf = [];
for (const v of scores) viaForOf.push(v);
console.log(viaForOf);

console.log(JSON.stringify(scores), [...scores], scores.slice());
console.log(scores.map((x) => x + 1).label, scores.at(-1), scores[-1]);

scores.length = 0;
console.log(scores, scores.label);

function tagged(values, tag) {
  const arr = [...values];
  arr.tag = tag;
  arr.sum = arr.reduce((a, b) => a + b, 0);
  return arr;
}
const t = tagged([1, 2, 3], 'small');
console.log(t, t.sum, t.tag, Array.isArray(t));
const re = /(\d+)-(\d+)/.exec('call 555-1234 now');
console.log(re.index, re.input, re.length, [...re]);
console.log(re);
