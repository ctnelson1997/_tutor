// BigInt values held in variables, objects and arrays: arithmetic, division, mixing with numbers (caught)
const a = 9007199254740993n;
const b = 2n ** 64n;
const c = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
const quotient = 7n / 2n;
const remainder = -7n % 2n;
console.log(a, b, c, quotient, remainder);
console.log(typeof a, a === c, a == 9007199254740992, 1n == 1, 1n === 1);
console.log(String(b), b.toString(16), `${a}`);
let mixError = null;
try {
  console.log(a + 1);
} catch (e) {
  mixError = e.message;
  console.log(e.name + ':', e.message);
}
const account = { id: 1, balance: 123456789012345678901234567890n };
const list = [1n, -2n, 0n];
account.balance -= 1n;
console.log(account, list);
console.log(Boolean(0n), 0n ? 'truthy' : 'falsy', 2n > 1, Number(10n) + 1);
let factorial = 1n;
for (let i = 1n; i <= 25n; i++) {
  factorial *= i;
}
console.log('25! =', factorial);
