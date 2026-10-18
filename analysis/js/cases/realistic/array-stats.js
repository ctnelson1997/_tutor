// Finds the max, min, sum, average, median and range of test scores using loops and var
var scores = [72, 95, 88, 61, 79, 100, 84, 67];

var max = scores[0];
var min = scores[0];
var sum = 0;
var maxIndex = 0;
for (var i = 0; i < scores.length; i++) {
  var s = scores[i];
  sum += s;
  if (s > max) {
    max = s;
    maxIndex = i;
  }
  if (s < min) {
    min = s;
  }
}
var average = sum / scores.length;
console.log("Max:", max, "at index", maxIndex);
console.log("Min:", min);
console.log("Sum:", sum);
console.log("Average:", average);
console.log("Range:", max - min);

var aboveAverage = [];
for (var j = 0; j < scores.length; j++) {
  if (scores[j] > average) aboveAverage.push(scores[j]);
}
console.log("Above average:", aboveAverage);
console.log("Check with Math:", Math.max.apply(null, scores), Math.min(...scores));

var sortedCopy = scores.slice().sort(function (a, b) {
  return a - b;
});
var mid = Math.floor(sortedCopy.length / 2);
var median = sortedCopy.length % 2 === 0 ? (sortedCopy[mid - 1] + sortedCopy[mid]) / 2 : sortedCopy[mid];
console.log("Median:", median);
console.log("Sorted:", sortedCopy, "original unchanged:", scores[0]);
