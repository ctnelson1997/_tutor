public class Main {
  static abstract class Shape {
    private String name;
    Shape(String name) { this.name = name; }
    public String getName() { return name; }
    public abstract double area();
    @Override
    public String toString() { return String.format("%s with area %.2f", name, area()); }
  }
  static class Circle extends Shape {
    private double radius;
    Circle(double r) { super("Circle"); radius = r; }
    public double area() { return Math.PI * radius * radius; }
  }
  static class Rectangle extends Shape {
    private double w, h;
    Rectangle(double w, double h) { super("Rectangle"); this.w = w; this.h = h; }
    public double area() { return w * h; }
  }
  public static void main(String[] args) {
    Shape[] shapes = { new Circle(2), new Rectangle(3, 4) };
    for (Shape s : shapes) System.out.println(s);
  }
}
