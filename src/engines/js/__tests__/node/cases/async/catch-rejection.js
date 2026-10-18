// rejections handled with .catch, with then(onFulfilled, onRejected), and recovering the chain
function check(n) {
  return new Promise((resolve, reject) => {
    if (n < 0) reject(new RangeError("negative: " + n));
    else resolve(Math.sqrt(n));
  });
}
check(16)
  .then((v) => console.log("sqrt", v))
  .catch((e) => console.log("not reached", e));

check(-4)
  .then((v) => console.log("not reached", v))
  .catch((e) => {
    console.log("caught", e.name, e.message);
    return 0;
  })
  .then((v) => console.log("recovered with", v));

check(-1).then(
  (v) => console.log("no", v),
  (e) => console.log("second handler:", e.message)
);

let thrown = Promise.resolve(1).then(() => {
  throw new TypeError("thrown inside then");
});
thrown.catch((e) => console.log("caught thrown:", e.message));
