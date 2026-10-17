public class Main {
  static abstract class Shape {
    abstract double area();
    String report() { return String.format("area=%.2f", area()); }
  }
  static class Circle extends Shape {
    double r;
    Circle(double r) { this.r = r; }
    double area() { return Math.PI * r * r; }
  }
  static class Rect extends Shape {
    double w, h;
    Rect(double w, double h) { this.w = w; this.h = h; }
    double area() { return w * h; }
  }
  public static void main(String[] args) {
    Shape[] shapes = { new Circle(1), new Rect(2, 3) };
    double total = 0;
    for (Shape s : shapes) {
      System.out.println(s.report());
      total += s.area();
    }
    System.out.printf("total=%.3f%n", total);
  }
}
