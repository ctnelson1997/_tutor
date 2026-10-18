// Promise.resolve().then chains: passing values, returning a promise, two branches, finally
let trace = [];
Promise.resolve(2)
  .then((x) => {
    trace.push("double " + x);
    return x * 2;
  })
  .then((x) => {
    trace.push("square " + x);
    return Promise.resolve(x * x);
  })
  .then((x) => {
    trace.push("got " + x);
    console.log("result", x);
  })
  .finally(() => {
    console.log("finally; trace:", trace);
  });
const p = Promise.resolve("a");
p.then((v) => console.log("branch 1", v));
p.then((v) => console.log("branch 2", v + v));
console.log("sync code done first");
