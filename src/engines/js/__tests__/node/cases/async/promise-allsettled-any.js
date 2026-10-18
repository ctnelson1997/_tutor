// Promise.allSettled reports every outcome; Promise.any takes the first success or an AggregateError
const tasks = [
  Promise.resolve(1),
  Promise.reject(new Error("boom")),
  new Promise((resolve) => setTimeout(() => resolve("late"), 10)),
  Promise.reject("plain string"),
];
let report;
Promise.allSettled(tasks).then((results) => {
  report = results.map((r) => (r.status === "fulfilled" ? "ok:" + r.value : "err:" + (r.reason.message ?? r.reason)));
  console.log(report);
  for (const r of results) console.log(r.status);
});
Promise.any([Promise.reject(new Error("x")), new Promise((r) => setTimeout(() => r("first success"), 5))]).then((v) =>
  console.log("any:", v)
);
Promise.any([Promise.reject(new Error("a")), Promise.reject(new Error("b"))]).catch((e) => {
  console.log(e.constructor.name, e.errors.map((x) => x.message));
});
