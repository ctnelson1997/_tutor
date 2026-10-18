// A class with a constructor, methods calling each other through this, per-instance arrays, and toString
class BankAccount {
  constructor(owner, balance = 0) {
    this.owner = owner;
    this.balance = balance;
    this.history = [];
  }
  deposit(amount) {
    this.balance += amount;
    this.log('deposit', amount);
    return this.balance;
  }
  withdraw(amount) {
    if (amount > this.balance) {
      this.log('denied', amount);
      return false;
    }
    this.balance -= amount;
    this.log('withdraw', amount);
    return true;
  }
  log(type, amount) {
    this.history.push({ type, amount });
  }
  toString() {
    return `${this.owner}: $${this.balance}`;
  }
}

const a = new BankAccount('Ana', 100);
const b = new BankAccount('Ben');
a.deposit(50);
console.log(a.withdraw(500), a.withdraw(30));
b.deposit(20);
console.log(String(a), `${b}`);
console.log(a.history);
console.log(a.deposit === b.deposit, Object.getOwnPropertyNames(BankAccount.prototype));
console.log(typeof BankAccount, a.constructor.name);
const transfer = (from, to, amt) => from.withdraw(amt) && to.deposit(amt);
console.log(transfer(a, b, 60), transfer(b, a, 1000), a.balance, b.balance);
console.log(a, b);
