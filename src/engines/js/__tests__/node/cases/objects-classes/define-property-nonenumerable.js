// Object.defineProperty: non-enumerable, non-writable and accessor props, and what keys/JSON/spread/log see
const account = { owner: 'Lee' };
Object.defineProperty(account, 'id', { value: 42 });
Object.defineProperty(account, 'balance', {
  value: 100,
  writable: true,
  enumerable: false,
});
let reads = 0;
Object.defineProperty(account, 'summary', {
  get() {
    reads++;
    return `${this.owner} has ${this.balance}`;
  },
  enumerable: true,
});

account.id = 7;
account.balance += 50;
console.log(account.id, account.balance, account.summary);
console.log(Object.keys(account), JSON.stringify(account));
console.log(Object.getOwnPropertyNames(account));
console.log(Object.getOwnPropertyDescriptor(account, 'id'));
console.log(account.propertyIsEnumerable('balance'), 'balance' in account);

const spread = { ...account };
console.log(spread, reads);

try {
  Object.defineProperty(account, 'id', { value: 1 });
} catch (e) {
  console.log(e.name);
}
delete account.id;
console.log(account.id);

const arr = [1, 2, 3];
Object.defineProperty(arr, 'sum', { get() { return this.reduce((a, b) => a + b, 0); } });
arr.push(4);
console.log(arr.sum, arr.length, Object.keys(arr));
console.log(account, reads);
