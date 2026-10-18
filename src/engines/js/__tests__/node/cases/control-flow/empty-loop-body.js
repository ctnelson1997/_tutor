// loops with empty bodies: for (...); while (...); and an empty block
let i;
for (i = 0; i < 5; i++);
console.log("i after empty for:", i);

const data = [4, 8, 15, 16, 23, 42];
let idx = 0;
while (data[idx] < 16) idx++;
console.log("first >= 16 at", idx);

let j = 0;
while (j++ < 3);
console.log("j", j);

let k;
for (k = 1; k < 100; k *= 2) {}
console.log("k", k);

var pos;
for (pos = data.length - 1; pos >= 0 && data[pos] % 2 === 0; pos--);
console.log("last odd index", pos, data[pos]);
