// Getters and setters in an object literal: computed values, validation, a getter-only property, spread copying
const temp = {
  _celsius: 20,
  get fahrenheit() {
    return this._celsius * 9 / 5 + 32;
  },
  set fahrenheit(f) {
    this._celsius = (f - 32) * 5 / 9;
  },
  get celsius() {
    return this._celsius;
  },
  set celsius(c) {
    if (typeof c !== 'number') {
      console.log('rejected', c);
      return;
    }
    this._celsius = c;
  },
};

console.log(temp.fahrenheit);
temp.fahrenheit = 212;
console.log(temp.celsius, temp._celsius);
temp.celsius = 'hot';
temp.celsius = -40;
console.log(temp.fahrenheit);

const readOnly = {
  get answer() {
    return 42;
  },
};
readOnly.answer = 7;
console.log(readOnly.answer);

const desc = Object.getOwnPropertyDescriptor(temp, 'fahrenheit');
console.log(typeof desc.get, typeof desc.set, 'value' in desc);
console.log(Object.keys(temp));
console.log(temp);
const copy = { ...temp };
console.log(Object.getOwnPropertyDescriptor(copy, 'fahrenheit').value, copy);
