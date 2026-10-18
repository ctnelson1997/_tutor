// ends uncaught: a derived constructor that assigns to `this` before calling super() throws a ReferenceError
class Shape {
  constructor(kind) {
    this.kind = kind;
    console.log('Shape constructor', kind);
  }
}
class Circle extends Shape {
  constructor(r) {
    super('circle');
    this.r = r;
  }
  area() {
    return Math.round(Math.PI * this.r ** 2);
  }
}
class BadSquare extends Shape {
  constructor(side) {
    console.log('BadSquare start', side);
    this.side = side;
    super('square');
  }
}
const c = new Circle(2);
console.log(c.area(), c);
const shapes = [c];
const sq = new BadSquare(3);
shapes.push(sq);
console.log('never printed');
