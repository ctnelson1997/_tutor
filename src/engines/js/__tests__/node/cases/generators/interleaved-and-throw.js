// Two generators consumed alternately (round robin), and gen.throw() caught inside a generator's try/catch
function* worker(name, jobs) {
  for (let i = 1; i <= jobs; i++) {
    yield `${name} job ${i}`;
  }
  return `${name} finished`;
}

const queue = [worker("A", 2), worker("B", 3)];
const log = [];
while (queue.length > 0) {
  const g = queue.shift();
  const r = g.next();
  if (r.done) {
    log.push(r.value);
  } else {
    log.push(r.value);
    queue.push(g);
  }
}
console.log(log.join("; "));

function* resilient() {
  let errors = 0;
  while (true) {
    try {
      yield errors;
    } catch (e) {
      errors++;
      console.log("caught inside generator:", e.message);
    }
  }
}

const r = resilient();
console.log(r.next().value);
console.log(r.throw(new Error("bad input")).value);
console.log(r.throw(new Error("again")).value);
console.log(r.next().value);
