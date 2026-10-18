// new on a constructor function with prototype methods: instanceof, own vs inherited, returning an object, forgetting new
function Point(x, y) {
  this.x = x;
  this.y = y;
}
Point.prototype.distanceTo = function (other) {
  const dx = this.x - other.x;
  const dy = this.y - other.y;
  return Math.sqrt(dx * dx + dy * dy);
};
Point.prototype.toString = function () {
  return `(${this.x}, ${this.y})`;
};
Point.origin = function () {
  return new Point(0, 0);
};
const p = new Point(3, 4);
const o = Point.origin();
console.log(p.distanceTo(o), String(p), `${o}`);
console.log(p instanceof Point, p.constructor === Point, Object.getPrototypeOf(p) === Point.prototype);
console.log(p.hasOwnProperty('x'), p.hasOwnProperty('distanceTo'), 'distanceTo' in p);
console.log(Object.keys(p), p);
console.log('methods are shared:', p.distanceTo === o.distanceTo);
function Counter() {
  this.value = 0;
  return { value: 'replaced object' };
}
const c = new Counter();
console.log('returning an object from a constructor:', c, c instanceof Counter);
function Temp(celsius) {
  this.celsius = celsius;
}
const forgot = Temp(25);
console.log('without new:', forgot, 'globalThis.celsius =', globalThis.celsius);
Point.prototype.scale = function (k) {
  return new Point(this.x * k, this.y * k);
};
const big = p.scale(10);
console.log('added to the prototype later:', big.toString());
