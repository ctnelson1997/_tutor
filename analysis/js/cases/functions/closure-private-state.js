// private state through closures: a bank account whose balance and history are reachable only through its methods
function createAccount(owner, initial) {
  let balance = initial;
  const history = [];
  function record(type, amount) {
    history.push(`${type} ${amount} -> ${balance}`);
  }
  return {
    owner,
    deposit(amount) {
      if (amount <= 0) throw new RangeError('Deposit must be positive');
      balance += amount;
      record('deposit', amount);
      return balance;
    },
    withdraw(amount) {
      if (amount > balance) throw new Error(`Insufficient funds: balance is ${balance}`);
      balance -= amount;
      record('withdraw', amount);
      return balance;
    },
    getBalance: () => balance,
    getHistory: () => history.slice(),
  };
}
const acct = createAccount('Mia', 100);
acct.deposit(50);
acct.withdraw(30);
try {
  acct.withdraw(500);
} catch (e) {
  console.log(e.message);
}
try {
  acct.deposit(-5);
} catch (e) {
  console.log(e.name, e.message);
}
acct.balance = 1000000;
console.log('balance:', acct.getBalance(), 'fake property:', acct.balance);
console.log(acct.getHistory());
const copyOfHistory = acct.getHistory();
copyOfHistory.push('tampered');
console.log(acct.getHistory().length, copyOfHistory.length);
