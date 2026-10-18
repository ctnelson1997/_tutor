// A return in finally overrides the try's return and swallows a throw; the try's return value is computed first
function overrideReturn() {
  try {
    return "from try";
  } finally {
    return "from finally";
  }
}

function swallowThrow() {
  try {
    throw new Error("lost");
  } finally {
    return "finally wins";
  }
}

let counter = 0;
function returnBeforeFinally() {
  try {
    return counter;
  } finally {
    counter += 10;
    console.log("finally sees counter", counter);
  }
}

function catchThenFinally() {
  try {
    JSON.parse("{bad");
  } catch (e) {
    return "catch";
  } finally {
    console.log("finally after catch return");
  }
}

const a = overrideReturn();
const b = swallowThrow();
const c = returnBeforeFinally();
const d = catchThenFinally();
console.log(a, "|", b, "|", c, counter, "|", d);
