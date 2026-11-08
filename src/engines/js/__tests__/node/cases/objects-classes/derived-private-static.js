// A derived constructor's this after super(), private fields, static members, computed method names (#93)
class Animal {
  constructor(name) {
    this.name = name;
  }
}
class Dog extends Animal {
  constructor(name, breed) {
    super(name);
    this.breed = breed;
  }
}
class Account {
  static count = 0;
  #balance = 0;
  constructor(owner) {
    this.owner = owner;
    Account.count++;
  }
  deposit(n) {
    this.#balance += n;
    return this.#balance;
  }
  *[Symbol.iterator]() {
    yield this.owner;
  }
  ['computed' + 'Name']() {
    return 'computed';
  }
}
const rex = new Dog('Rex', 'lab');
const acct = new Account('ana');
acct.deposit(50);
console.log(rex, acct.deposit(25), Account.count, [...acct], acct.computedName());
const big = 10n ** 20n;
let __count__ = 3;
const withGetter = { get total() { return 1; }, plain: 2 };
console.log(big, __count__, withGetter.total);
