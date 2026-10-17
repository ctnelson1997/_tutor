public class Main {
  interface Shape {
    double PI_ISH = 3.0;
    double area();
    static String describe(Shape s) { return "area " + s.area(); }
  }

  interface Named {
    String name();
  }

  interface NamedShape extends Shape, Named { }

  static class Square implements NamedShape {
    double side;
    Square(double side) { this.side = side; }
    public double area() { return side * side; }
    public String name() { return "square"; }
  }

  static class Circle implements Shape {
    double r;
    Circle(double r) { this.r = r; }
    public double area() { return PI_ISH * r * r; }
  }

  public static void main(String[] args) {
    Shape[] shapes = { new Square(2), new Circle(1) };
    for (Shape s : shapes) {
      System.out.println(Shape.describe(s));
      System.out.println((s instanceof Named) + " " + (s instanceof NamedShape) + " " + (s instanceof Shape));
    }
    System.out.println(Shape.PI_ISH + " " + Square.PI_ISH);
    Named n = new Square(1);
    System.out.println(n.name());
    Object o = new Circle(2);
    if (o instanceof Shape sh) System.out.println(sh.area());
  }
}
