// Prints FizzBuzz from 1 to 20 and counts how many of each kind appeared
var counts = { Fizz: 0, Buzz: 0, FizzBuzz: 0, number: 0 };
var output = [];

for (var i = 1; i <= 20; i++) {
  var word;
  if (i % 15 === 0) {
    word = "FizzBuzz";
  } else if (i % 3 === 0) {
    word = "Fizz";
  } else if (i % 5 === 0) {
    word = "Buzz";
  } else {
    word = i;
  }
  if (typeof word === "number") {
    counts.number++;
  } else {
    counts[word]++;
  }
  output.push(word);
  console.log(word);
}

console.log(counts);
console.log("Loop variable after the loop: " + i);
