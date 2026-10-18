// Promise.allSettled waits for every request, fulfilled or rejected, and reports each outcome in input order
function fakeRequest(name, ms, ok) {
  return new Promise((resolve, reject) => {
    setTimeout(() => (ok ? resolve(name + " loaded") : reject(new Error(name + " failed"))), ms);
  });
}
const requests = [fakeRequest("users", 60, true), fakeRequest("posts", 20, false), fakeRequest("tags", 40, true)];
let outcomes = [];
let failures = 0;
console.log("waiting for", requests.length, "requests");
Promise.allSettled(requests).then((results) => {
  for (const r of results) {
    if (r.status === "fulfilled") {
      console.log("ok:", r.value);
    } else {
      failures++;
      console.log("failed:", r.reason.message);
    }
  }
  outcomes = results.map((r) => r.status);
  console.log(outcomes, "failures:", failures);
});
console.log("requests sent");
