// labeled block statements (not loops) exited with break, including nested labels
function classify(n) {
  let result = "start";
  check: {
    if (n < 0) {
      result = "negative";
      break check;
    }
    result = "non-negative";
    inner: {
      if (n === 0) break inner;
      result += " and positive";
      if (n > 100) break check;
      result += " and small";
    }
    result += "!";
  }
  return result;
}
console.log(classify(-5));
console.log(classify(0));
console.log(classify(7));
console.log(classify(500));

let count = 0;
block: {
  count++;
  if (count > 0) break block;
  count = 99;
}
console.log("count", count);
