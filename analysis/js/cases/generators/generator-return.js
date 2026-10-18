// A generator's return value shows in next() but not in for...of or spread; gen.return() ends it early
function* withReturn() {
  yield 1;
  yield 2;
  return 99;
}

const g1 = withReturn();
console.log(g1.next(), g1.next(), g1.next(), g1.next());

const seen = [];
for (const v of withReturn()) {
  seen.push(v);
}
console.log("for...of saw", seen);
console.log("spread saw", [...withReturn()]);

function* guarded() {
  try {
    yield "a";
    yield "b";
  } finally {
    console.log("cleanup ran");
  }
}

const g2 = guarded();
console.log(g2.next());
const early = g2.return("stopped");
console.log(early, g2.next());
