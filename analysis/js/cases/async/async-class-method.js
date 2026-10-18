// async methods on a class that use this, a static helper returning a promise, and a rejection
class Account {
  constructor(owner) {
    this.owner = owner;
    this.balance = 0;
    this.log = [];
  }
  async deposit(amount) {
    await Account.pause(5);
    this.balance += amount;
    this.log.push("+" + amount);
    return this.balance;
  }
  async withdraw(amount) {
    await Account.pause(5);
    if (amount > this.balance) throw new Error("insufficient funds");
    this.balance -= amount;
    this.log.push("-" + amount);
    return this.balance;
  }
  static pause(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
const acct = new Account("Ana");
async function run() {
  console.log("after deposit:", await acct.deposit(100));
  console.log("after withdraw:", await acct.withdraw(30));
  try {
    await acct.withdraw(500);
  } catch (e) {
    console.log("failed:", e.message);
  }
  console.log(acct.owner, acct.balance, acct.log);
}
run();
