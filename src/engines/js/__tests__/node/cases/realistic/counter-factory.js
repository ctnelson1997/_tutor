// Uses closures to build independent counters and ID generators with private state
function makeCounter(start = 0, step = 1) {
  let count = start;

  function increment() {
    count += step;
    return count;
  }

  function decrement() {
    count -= step;
    return count;
  }

  function reset() {
    count = start;
  }

  function getValue() {
    return count;
  }

  return { increment, decrement, reset, getValue };
}

const clicks = makeCounter();
const byFives = makeCounter(100, 5);
clicks.increment();
clicks.increment();
clicks.increment();
byFives.increment();
byFives.decrement();
byFives.decrement();
console.log("clicks:", clicks.getValue());
console.log("byFives:", byFives.getValue());
clicks.reset();
console.log("after reset:", clicks.getValue(), "count is private:", clicks.count);

function makeIdGenerator(prefix) {
  let next = 1;
  return function () {
    const id = prefix + String(next).padStart(3, "0");
    next++;
    return id;
  };
}

const userId = makeIdGenerator("U");
const orderId = makeIdGenerator("ORD-");
const ids = [userId(), userId(), orderId(), userId(), orderId()];
console.log(ids);

const greeters = [];
for (let i = 0; i < 3; i++) {
  greeters.push(() => `greeter #${i}`);
}
console.log(greeters.map(g => g()));
