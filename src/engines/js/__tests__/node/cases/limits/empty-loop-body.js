// A loop with an empty body takes no step: it isn't an infinite loop at 10,000 iterations (#91)
const big = [...Array(12000).keys()];
let last;
for (last of big) {}
console.log(last);
