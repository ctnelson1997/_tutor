// A BankAccount class with deposits, withdrawals, transfers, a static counter and error handling
class BankAccount {
  static accountsOpened = 0;

  constructor(owner, balance = 0) {
    this.owner = owner;
    this.balance = balance;
    this.history = [];
    BankAccount.accountsOpened++;
    this.number = 1000 + BankAccount.accountsOpened;
  }

  deposit(amount) {
    if (amount <= 0) {
      throw new Error("Deposit must be positive");
    }
    this.balance += amount;
    this.history.push(`deposit ${amount}`);
    return this.balance;
  }

  withdraw(amount) {
    if (amount > this.balance) {
      throw new Error(`Insufficient funds: balance is ${this.balance}`);
    }
    this.balance -= amount;
    this.history.push(`withdraw ${amount}`);
    return this.balance;
  }

  transferTo(other, amount) {
    this.withdraw(amount);
    other.deposit(amount);
  }

  toString() {
    return `#${this.number} ${this.owner}: $${this.balance.toFixed(2)}`;
  }
}

const alice = new BankAccount("Alice", 100);
const bob = new BankAccount("Bob");
alice.deposit(50);
alice.transferTo(bob, 30);
try {
  bob.withdraw(100);
} catch (err) {
  console.log("Error:", err.message);
}
try {
  alice.deposit(-5);
} catch (err) {
  console.log("Error:", err.message);
} finally {
  console.log("Checked deposit");
}
bob.deposit(12.5);
console.log(alice.toString());
console.log(`${bob}`);
console.log("Accounts opened:", BankAccount.accountsOpened);
console.log(alice.history, bob.history);
