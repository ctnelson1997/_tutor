// what a program can see of its functions: their text, length, name, arguments, new.target, and the runtime's own functions
function area(width, height = 1, ...rest) {
  return width * height + rest.length;
}
const square = (s) => s * s;
const shapes = {
  circle(r) {
    return 3 * r * r;
  },
  get unit() {
    return 1;
  },
};
class Box {
  static make(size) {
    return new Box(size);
  }
  constructor(size) {
    this.size = size;
    this.madeWithNew = new.target === Box;
  }
}
function count() {
  return arguments.length;
}
console.log(area.toString());
console.log(String(square), `${square}`.length);
console.log(Function.prototype.toString.call(shapes.circle));
console.log(Object.getOwnPropertyDescriptor(shapes, "unit").get.toString());
console.log(Box.make.toString());
console.log(Box.toString().split("\n")[0]);
console.log(area.length, square.length, Box.length, area.name, square.name, shapes.circle.name, Box.make.name);
console.log(count(1, 2, 3), count(), Box.make(2).madeWithNew);
console.log(Math.max.toString(), typeof console.log, String(parseInt));
console.log([1, 2, 3].map((x) => x + 1).toString(), (function named() {}).name);
