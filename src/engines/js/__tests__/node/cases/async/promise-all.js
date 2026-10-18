// Promise.all keeps input order, waits for the slowest, and rejects on the first failure
function after(ms, value, fail = false) {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      console.log("settled", value);
      fail ? reject(new Error("failed: " + value)) : resolve(value);
    }, ms)
  );
}
let ok;
Promise.all([after(30, "slow"), after(10, "fast"), 42, after(20, "mid")])
  .then((vals) => {
    ok = vals;
    console.log("all resolved:", vals);
    return Promise.all([after(10, "a"), after(5, "b", true), after(15, "c")]);
  })
  .catch((err) => {
    console.log("all rejected:", err.message);
  });
