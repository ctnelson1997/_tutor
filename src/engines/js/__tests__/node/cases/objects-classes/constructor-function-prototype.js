// Constructor functions with prototype methods, shadowing a prototype method on one instance, and manual inheritance
function Point(x, y) {
  this.x = x;
  this.y = y;
}
Point.prototype.toString = function () {
  return `(${this.x}, ${this.y})`;
};
Point.prototype.move = function (dx, dy) {
  this.x += dx;
  this.y += dy;
  return this;
};
Point.distance = function (a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
};

const p = new Point(1, 2);
const q = new Point(4, 6);
console.log(String(p), '' + q.move(0, 0), Point.distance(p, q));

q.toString = function () {
  return 'custom q';
};
console.log(`${p} ${q}`, q.hasOwnProperty('toString'), p.hasOwnProperty('toString'));
delete q.toString;
console.log(`${q}`);

Point.prototype.scale = function (k) {
  return new Point(this.x * k, this.y * k);
};
console.log(p.scale(3).toString(), p instanceof Point, p.constructor === Point);
console.log(Object.keys(p), Object.keys(Point.prototype));

function Point3D(x, y, z) {
  Point.call(this, x, y);
  this.z = z;
}
Point3D.prototype = Object.create(Point.prototype);
Point3D.prototype.constructor = Point3D;
const r = new Point3D(1, 1, 1);
console.log(r.move(1, 1).toString(), r.z, r instanceof Point, r instanceof Point3D);
console.log(p, r);
