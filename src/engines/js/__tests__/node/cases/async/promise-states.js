// Settled promises print with their values (#92)
const p = Promise.resolve(42);
console.log(p);
const r = Promise.reject('nope');
r.catch(() => {});
console.log(r);
const made = new Promise((resolve) => resolve('made'));
console.log(made);
async function g() {
  return 'done';
}
const q = g();
q.then((v) => console.log(v, q));
const waiting = new Promise(() => {});
console.log(waiting);
