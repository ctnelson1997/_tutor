// loops whose whole body sits on the header's line, with and without braces, nested
let total = 0;
for (let i = 1; i <= 5; i++) total += i;
console.log("total", total);

let n = 100, halvings = 0;
while (n > 1) { n = Math.floor(n / 2); halvings++; }
console.log("halvings", halvings);

const word = "loop";
let rev = "";
for (const ch of word) rev = ch + rev;
console.log(rev);

let fact = 1;
for (let k = 2; k <= 6; k++) { fact *= k; } console.log("6! =", fact);

const grid = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.push(r * c);
console.log(grid);
let t = 0;
do t++; while (t < 4); console.log("t", t);
