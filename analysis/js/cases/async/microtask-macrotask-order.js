// ordering: sync code, then microtasks (then, queueMicrotask, await), then each timer with its microtasks
const order = [];
function note(s) {
  order.push(s);
  console.log(s);
}
note("sync 1");
setTimeout(() => note("timeout 1"), 0);
Promise.resolve().then(() => note("then 1"));
queueMicrotask(() => note("microtask 1"));
(async () => {
  note("async body (sync)");
  await null;
  note("after await");
})();
setTimeout(() => {
  note("timeout 2");
  Promise.resolve().then(() => note("then inside timeout 2"));
  queueMicrotask(() => note("microtask inside timeout 2"));
}, 0);
setTimeout(() => note("timeout 3"), 0);
Promise.resolve().then(() => {
  note("then 2");
  queueMicrotask(() => note("nested microtask"));
});
note("sync 2");
