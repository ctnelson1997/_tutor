// yield* delegating to another generator, an array and a string, and yield*'s value from the inner return
function* inner(label) {
  yield label + "-a";
  yield label + "-b";
  return label + "-done";
}

function* outer() {
  const r1 = yield* inner("x");
  console.log("inner returned", r1);
  yield* [1, 2];
  yield* "hi";
  const r2 = yield* inner("y");
  return r2;
}

const values = [];
const it = outer();
let step = it.next();
while (!step.done) {
  values.push(step.value);
  step = it.next();
}
console.log(values.join(" "));
console.log("final", step);
