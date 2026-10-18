// Removes duplicates from arrays three ways: nested loop, indexOf with filter, and a Set
const rolls = [4, 2, 6, 2, 1, 4, 4, 5, 6, 3, 1];

const uniqueLoop = [];
for (let i = 0; i < rolls.length; i++) {
  let seen = false;
  for (let j = 0; j < uniqueLoop.length; j++) {
    if (uniqueLoop[j] === rolls[i]) {
      seen = true;
      break;
    }
  }
  if (!seen) {
    uniqueLoop.push(rolls[i]);
  }
}
console.log("Loop:", uniqueLoop);

const uniqueFilter = rolls.filter((value, index) => rolls.indexOf(value) === index);
console.log("Filter:", uniqueFilter);

const uniqueSet = [...new Set(rolls)];
console.log("Set:", uniqueSet);

const duplicates = rolls.filter((value, index) => rolls.indexOf(value) !== index);
const duplicateValues = Array.from(new Set(duplicates)).sort((a, b) => a - b);
console.log("Values that repeat:", duplicateValues);

const emails = ["a@x.com", "B@x.com", "b@x.com", "c@x.com", "A@X.com"];
const uniqueEmails = [...new Set(emails.map(e => e.toLowerCase()))];
console.log(uniqueEmails);
