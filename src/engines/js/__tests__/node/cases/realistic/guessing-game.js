// Simulates a number guessing game with while/break, a Collatz do-while and a while/continue search
const secret = 73;
let low = 1;
let high = 100;
let guesses = 0;
const guessLog = [];

while (true) {
  const guess = Math.floor((low + high) / 2);
  guesses++;
  guessLog.push(guess);
  if (guess === secret) {
    console.log(`Got it! ${guess} in ${guesses} guesses`);
    break;
  } else if (guess < secret) {
    console.log(`${guess} is too low`);
    low = guess + 1;
  } else {
    console.log(`${guess} is too high`);
    high = guess - 1;
  }
  if (guesses >= 10) {
    console.log("Giving up");
    break;
  }
}
console.log("Guesses:", guessLog);

let n = 7;
let steps = 0;
const sequence = [];
do {
  sequence.push(n);
  n = n % 2 === 0 ? n / 2 : 3 * n + 1;
  steps++;
} while (n !== 1);
sequence.push(1);
console.log("Collatz from 7:", sequence.join(" "), `(${steps} steps)`);

let candidate = 0;
let found = null;
while (candidate < 200) {
  candidate++;
  if (candidate % 3 !== 0) continue;
  if (candidate % 4 === 0 && candidate % 5 === 0) {
    found = candidate;
    break;
  }
}
console.log("First number divisible by 3, 4 and 5:", found);
