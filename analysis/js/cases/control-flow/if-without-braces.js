// if/else without braces: on the same line, on the next line, else-if chains, dangling else
function abs(x) {
  if (x < 0) return -x;
  return x;
}
console.log(abs(-4), abs(3));

let msg = "";
const temp = 15;
if (temp > 25) msg = "hot"; else if (temp > 10) msg = "mild"; else msg = "cold";
console.log(msg);

let count = 0;
for (let i = 0; i < 6; i++) if (i % 2) count++;
console.log("odd count", count);

function dangling(a, b) {
  if (a)
    if (b) return "a and b";
    else return "a only";
  return "not a";
}
console.log(dangling(true, true), "|", dangling(true, false), "|", dangling(false, true));

let x = 5;
if (x > 3) x *= 2, console.log("doubled", x);
if (x > 100) console.log("never"); console.log("after if, same line");
