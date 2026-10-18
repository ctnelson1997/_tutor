// ends uncaught: a custom InsufficientFundsError (with extra fields) thrown from a function and never caught
class InsufficientFundsError extends Error {
  constructor(balance, amount) {
    super(`cannot withdraw ${amount}; balance is ${balance}`);
    this.name = "InsufficientFundsError";
    this.balance = balance;
    this.shortBy = amount - balance;
  }
}

const account = { owner: "Kim", balance: 100, history: [] };

function withdraw(acct, amount) {
  if (amount > acct.balance) {
    throw new InsufficientFundsError(acct.balance, amount);
  }
  acct.balance -= amount;
  acct.history.push(-amount);
  return acct.balance;
}

console.log(withdraw(account, 30));
console.log(withdraw(account, 50));
console.log(account.history);
withdraw(account, 75);
console.log("unreachable");
