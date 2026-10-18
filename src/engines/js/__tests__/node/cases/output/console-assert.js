// console.assert: silent when true, "Assertion failed" on stderr when false, with a message, format string, objects, or nothing
const balance = 50;
const withdraw = 80;
console.assert(balance >= 0, "balance is negative");
console.assert(balance >= withdraw, "insufficient funds:", balance, "<", withdraw);
console.assert(withdraw % 2 === 1, "expected odd, got %d", withdraw);
console.assert(false, { balance, withdraw });
console.assert(false);
console.assert(0, "zero is falsy");
console.assert("", "empty string is falsy");
console.assert([], "empty array is truthy, so this never prints");
const checks = [1, 2, 3].map((n) => n < 3);
checks.forEach((ok, i) => console.assert(ok, "check", i, "failed"));
console.log("after asserts", checks);
