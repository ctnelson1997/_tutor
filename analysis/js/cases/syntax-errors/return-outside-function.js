// syntax error: a function closed one brace too early leaves its return statement outside any function
function average(nums) {
  let sum = 0;
  for (const n of nums) sum += n;
}
  return sum / nums.length;
}
console.log(average([2, 4, 6]));
