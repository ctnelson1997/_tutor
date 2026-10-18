// break, continue and return inside try blocks: finally still runs each time, then control goes where it should
const log = [];

for (let i = 0; i < 5; i++) {
  try {
    if (i === 1) continue;
    if (i === 3) break;
    log.push("body " + i);
  } finally {
    log.push("finally " + i);
  }
}
console.log(log.join(", "));

function findFirstEven(nums) {
  let checked = 0;
  for (const n of nums) {
    try {
      checked++;
      if (n % 2 === 0) {
        return `found ${n} after ${checked}`;
      }
    } finally {
      console.log("checked", n);
    }
  }
  return "none";
}
const found = findFirstEven([5, 7, 8, 9]);
console.log(found);

let rounds = 0;
outer: while (true) {
  rounds++;
  for (let j = 0; j < 3; j++) {
    try {
      if (rounds === 2 && j === 1) break outer;
    } finally {
      log.push(`r${rounds}j${j}`);
    }
  }
}
console.log(rounds, log.slice(-5).join(" "));
