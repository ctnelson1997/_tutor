// ends with an unhandled promise rejection (an async function throws, nothing catches it)
async function validate(age) {
  if (age < 0) throw new RangeError("age cannot be negative: " + age);
  return age;
}
async function main() {
  const a = await validate(30);
  console.log("valid", a);
  const b = await validate(-3);
  console.log("never printed", b);
}
let started = true;
main();
console.log("main called");
