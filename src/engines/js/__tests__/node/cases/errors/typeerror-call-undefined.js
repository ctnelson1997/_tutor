// TypeErrors from calling undefined/non-functions, a missing method, and assigning to a const; V8's message text
const calculator = {
  add(a, b) {
    return a + b;
  },
};

const messages = [];
function record(fn) {
  try {
    fn();
  } catch (e) {
    messages.push(e.constructor.name);
    console.log(e.name + ": " + e.message);
  }
}

record(() => calculator.subtract(5, 2));
record(() => {
  let callback;
  callback();
});
record(() => {
  const notFn = 7;
  notFn();
});
record(() => {
  const limit = 1;
  limit = 2;
});
record(() => calculator.add.missing.deep);
record(() => new calculator.add());
console.log(messages.length, new Set(messages).size);
console.log(calculator.add(2, 3));
