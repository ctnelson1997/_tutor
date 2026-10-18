// Class getters/setters live on the prototype: validation, a getter-only property, static getter, super.x = in a setter
class Rectangle {
  constructor(width, height) {
    this._width = width;
    this._height = height;
  }
  get area() {
    return this._width * this._height;
  }
  get width() {
    return this._width;
  }
  set width(w) {
    if (w <= 0) {
      console.log('width must be positive');
      return;
    }
    this._width = w;
  }
  static get unit() {
    return 'cm';
  }
}

const r = new Rectangle(3, 4);
console.log(r.area, Rectangle.unit);
r.width = 10;
console.log(r.width, r.area);
r.width = -1;
console.log(r.width);
r.area = 99;
console.log(r.area);
console.log(Object.keys(r), 'area' in r, r.hasOwnProperty('area'));
console.log(r);

class Square extends Rectangle {
  constructor(side) {
    super(side, side);
  }
  set width(w) {
    super.width = w;
    this._height = this._width;
  }
  get width() {
    return super.width;
  }
}
const s = new Square(5);
s.width = 7;
console.log(s.area, s.width, s instanceof Rectangle, s);
