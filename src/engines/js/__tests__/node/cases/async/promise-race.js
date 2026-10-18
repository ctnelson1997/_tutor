// Promise.race settles with the first promise to settle; a timeout implemented with race
function wait(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
function failAfter(ms, msg) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));
}
let winner = null;
Promise.race([wait(20, "tortoise"), wait(5, "hare")]).then((v) => {
  winner = v;
  console.log("winner:", v);
});
async function withTimeout(promise, ms) {
  try {
    return await Promise.race([promise, failAfter(ms, "timed out")]);
  } catch (e) {
    return "error: " + e.message;
  }
}
withTimeout(wait(50, "slow data"), 15).then((r) => console.log("first:", r));
withTimeout(wait(8, "quick data"), 30).then((r) => console.log("second:", r));
Promise.race([Promise.resolve("already"), wait(1, "later")]).then((v) => console.log("race of resolved:", v));
