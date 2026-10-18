// Order of try / catch / finally blocks with and without a throw, and code after the statement
const trace = [];

function attempt(shouldFail) {
  trace.push("enter " + shouldFail);
  try {
    trace.push("try start");
    if (shouldFail) {
      throw new Error("boom");
    }
    trace.push("try end");
  } catch (err) {
    trace.push("catch " + err.message);
  } finally {
    trace.push("finally");
  }
  trace.push("after");
  return trace.length;
}

const lenOk = attempt(false);
console.log(trace.join(" > "));
trace.length = 0;
const lenFail = attempt(true);
console.log(trace.join(" > "));
console.log(lenOk, lenFail);

let status = "init";
try {
  status = "trying";
} finally {
  status += "+finally";
}
console.log(status);
