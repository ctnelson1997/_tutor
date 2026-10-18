// toString and valueOf overrides used by +, template literals, String(), comparison, computed keys and sort
class Money {
  constructor(cents) {
    this.cents = cents;
  }
  valueOf() {
    return this.cents;
  }
  toString() {
    return `$${(this.cents / 100).toFixed(2)}`;
  }
}

const a = new Money(250);
const b = new Money(199);
console.log(a + b);
console.log(a + '');
console.log(`${a}`);
console.log(String(b), a > b, a * 2, [a, b].join(' & '));
console.log('Total: ' + a);

const onlyToString = {
  toString() {
    return 'TS';
  },
};
console.log(onlyToString + 1, `${onlyToString}`, onlyToString * 1);

const plain = { n: 1 };
console.log(plain + '', [1, [2, 3]] + '', [] + [], [] + {});

const calls = [];
const tracer = {
  valueOf() {
    calls.push('valueOf');
    return 10;
  },
  toString() {
    calls.push('toString');
    return 'ten';
  },
};
const sum = tracer + 5;
const text = `${tracer}`;
const keyed = { [tracer]: true };
console.log(sum, text, Object.keys(keyed), calls);
const sorted = [new Money(500), new Money(5), new Money(50)].sort((x, y) => x - y);
console.log(sorted.map(String));
