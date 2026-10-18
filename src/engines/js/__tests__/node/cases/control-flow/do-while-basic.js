// do...while runs its body at least once; braceless do-while; do-while(true) with break
let n = 9875;
let digits = 0;
let digitSum = 0;
do {
  digitSum += n % 10;
  n = Math.floor(n / 10);
  digits++;
} while (n > 0);
console.log("digits", digits, "sum", digitSum);

let ran = 0;
do {
  ran++;
  console.log("body ran once even though test is false");
} while (false);

let x = 0;
do x += 3; while (x < 10);
console.log("x", x);

let attempts = 0;
let value = 1;
do {
  attempts++;
  value *= 2;
  if (value > 50) break;
} while (true);
console.log("value", value, "attempts", attempts);
