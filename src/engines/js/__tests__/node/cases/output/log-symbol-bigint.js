// console.log of Symbols (as values and as keys) and BigInts (alone, in arrays/objects, in arithmetic)
const id = Symbol("id");
const anonSym = Symbol();
const shared = Symbol.for("app.shared");
const tagged = { name: "box", [id]: 123, [Symbol.iterator]: null };
const big = 12345678901234567890n;
const product = 2n ** 64n;
const mixed = [1n, -5n, 0n, big];
const account = { balance: 1000n, owner: "Kim" };
console.log(id, anonSym, shared, Symbol.iterator);
console.log(id.toString(), id.description, typeof id);
console.log(tagged);
console.log([id, shared], { sym: id });
console.log(big, product, typeof big);
console.log(mixed);
console.log(account);
console.log(7n / 2n, -7n % 3n, BigInt(42) === 42n, 10n > 9);
console.log(String(big), `${product}`, big.toString(16));
