// A Shape class hierarchy using extends, super, method overriding and instanceof
class Shape {
  constructor(name) {
    this.name = name;
  }
  area() {
    return 0;
  }
  perimeter() {
    return 0;
  }
  describe() {
    return `${this.name} with area ${this.area().toFixed(2)} and perimeter ${this.perimeter().toFixed(2)}`;
  }
}

class Circle extends Shape {
  constructor(radius) {
    super("Circle");
    this.radius = radius;
  }
  area() {
    return Math.PI * this.radius ** 2;
  }
  perimeter() {
    return 2 * Math.PI * this.radius;
  }
}

class Rectangle extends Shape {
  constructor(width, height) {
    super("Rectangle");
    this.width = width;
    this.height = height;
  }
  area() {
    return this.width * this.height;
  }
  perimeter() {
    return 2 * (this.width + this.height);
  }
}

class Square extends Rectangle {
  constructor(side) {
    super(side, side);
    this.name = "Square";
  }
  describe() {
    return super.describe() + " (all sides " + this.width + ")";
  }
}

const shapes = [new Circle(2), new Rectangle(3, 4.5), new Square(5), new Circle(0.5)];
for (const s of shapes) {
  console.log(s.describe());
}
const totalArea = shapes.reduce((sum, s) => sum + s.area(), 0);
console.log("Total area:", totalArea.toFixed(3));
const rectangles = shapes.filter(s => s instanceof Rectangle).length;
console.log("Rectangles (incl. squares):", rectangles);
const largest = shapes.reduce((best, s) => (s.area() > best.area() ? s : best));
console.log("Largest:", largest.name, largest.constructor.name);
console.log("Square is a Shape?", shapes[2] instanceof Shape, "Circle is a Rectangle?", shapes[0] instanceof Rectangle);
