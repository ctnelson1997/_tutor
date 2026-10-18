// next(value) sends values into a paused generator; the first next() argument is ignored
function* accumulator() {
  let total = 0;
  console.log("generator started");
  while (true) {
    const amount = yield total;
    console.log("received", amount);
    if (amount === undefined) break;
    total += amount;
  }
  return "final " + total;
}

const acc = accumulator();
const r0 = acc.next("ignored");
console.log(r0);
const r1 = acc.next(5);
const r2 = acc.next(10);
console.log(r1.value, r2.value);
const r3 = acc.next(-3);
console.log(r3);
const r4 = acc.next();
console.log(r4);

function* conversation() {
  const name = yield "What is your name?";
  const hobby = yield `Hi ${name}! Hobby?`;
  return `${name} likes ${hobby}`;
}

const chat = conversation();
const q1 = chat.next().value;
const q2 = chat.next("Ada").value;
const summary = chat.next("math").value;
console.log(q1, "|", q2, "|", summary);
