// a method detached from its object loses this (sloppy mode: globalThis); (obj.m)() vs (0, obj.m)(); callbacks; bind fixes it
const account = {
  owner: 'Lin',
  balance: 50,
  describe() {
    if (this === globalThis) return 'this is globalThis';
    if (this === undefined) return 'this is undefined';
    return this.owner + ' has ' + this.balance;
  },
};
console.log(account.describe());
const detached = account.describe;
console.log(detached());
const wrapper = { owner: 'Wrapper', balance: 0, describe: account.describe };
console.log(wrapper.describe());
console.log('parenthesized member keeps this:', (account.describe)());
console.log('comma expression loses this:', (0, account.describe)());
const results = [1].map(account.describe);
console.log('as a callback:', results[0]);
const mapWithThis = [1].map(account.describe, account);
console.log('map thisArg:', mapWithThis[0]);
const bound = account.describe.bind(account);
console.log('bound:', bound());
const viaArrow = () => account.describe();
console.log('arrow wrapper:', viaArrow());
function callLater(fn) {
  return fn();
}
const fromHelper = callLater(account.describe);
console.log('passed to a helper:', fromHelper);
