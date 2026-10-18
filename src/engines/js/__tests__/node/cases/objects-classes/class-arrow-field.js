// Class fields holding arrow functions keep `this` when detached; detached prototype methods get undefined
class Clicker {
  clicks = 0;
  name;
  handleArrow = () => {
    this.clicks++;
    return `${this.name} arrow: ${this.clicks}`;
  };
  constructor(name) {
    this.name = name;
  }
  handleMethod() {
    return this === undefined ? 'this is undefined' : `${this.name} method`;
  }
}

const btn = new Clicker('save');
const arrow = btn.handleArrow;
const method = btn.handleMethod;
console.log(arrow());
console.log(arrow());
console.log(method());
console.log(method.call(btn));
const bound = btn.handleMethod.bind({ name: 'other' });
console.log(bound());

const listeners = [btn.handleArrow, new Clicker('load').handleArrow];
const results = listeners.map((fn) => fn());
console.log(results);
console.log(Object.keys(btn), btn.hasOwnProperty('handleMethod'));
console.log(btn.handleArrow === new Clicker('x').handleArrow, btn.handleMethod === Clicker.prototype.handleMethod);
const detached = { run: btn.handleArrow, name: 'detached' };
console.log(detached.run(), btn.clicks);
console.log(btn);
