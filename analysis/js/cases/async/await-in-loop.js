// await inside for...of and while loops runs the iterations one after another
function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
async function sequential() {
  const results = [];
  for (const [i, ms] of [30, 10, 20].entries()) {
    const v = await delay(ms, "job" + i);
    console.log("finished", v);
    results.push(v);
  }
  return results;
}
async function countdown(n) {
  while (n > 0) {
    console.log("tick", n);
    await null;
    n--;
  }
  return "liftoff";
}
let all;
sequential()
  .then((r) => {
    all = r;
    console.log("all:", r);
    return countdown(3);
  })
  .then((msg) => console.log(msg));
