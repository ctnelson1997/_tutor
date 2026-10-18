// RangeErrors from new Array(-1), toFixed and repeat; built-in error name/message/toString and instanceof
const attempts = [
  () => new Array(-1),
  () => (1.5).toFixed(101),
  () => "ab".repeat(-2),
  () => null.length,
];

const caught = [];
for (const fn of attempts) {
  try {
    fn();
  } catch (e) {
    caught.push(e.name);
    console.log(e.name + ": " + e.message);
    console.log(e instanceof RangeError, e instanceof TypeError, e instanceof Error);
  }
}
console.log(caught);

const made = new TypeError("custom type problem");
console.log(made.toString(), made.name, made.constructor === TypeError);
const plain = new Error();
console.log(JSON.stringify(plain.message), plain.toString());
const syntax = new SyntaxError("odd");
console.log(syntax instanceof Error, Object.prototype.toString.call(syntax));
