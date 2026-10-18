// Symbol.toPrimitive receives the hint ('number', 'string', 'default') and takes precedence over valueOf
class Temperature {
  constructor(celsius) {
    this.celsius = celsius;
  }
  [Symbol.toPrimitive](hint) {
    console.log('hint:', hint);
    if (hint === 'number') return this.celsius;
    if (hint === 'string') return `${this.celsius}C`;
    return `Temp(${this.celsius})`;
  }
  valueOf() {
    return -1;
  }
}

const t = new Temperature(25);
const n = +t;
const s = `${t}`;
const d = t + '';
const cmp = t > 20;
const eq = t == 'Temp(25)';
console.log(n, s, d, cmp, eq);
console.log(String(t), Number(t), t * 2);

const epoch = new Date(0);
console.log(typeof (epoch + 1), typeof (epoch - 1), epoch - 1);

const weird = {
  [Symbol.toPrimitive]() {
    return { not: 'primitive' };
  },
};
try {
  console.log(weird + 1);
} catch (e) {
  console.log(e.constructor.name, e.message);
}
console.log(Object.keys(t), typeof Temperature.prototype[Symbol.toPrimitive]);
