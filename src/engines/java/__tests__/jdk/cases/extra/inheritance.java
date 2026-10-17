import java.util.*;

// Inheritance (#15): fields and methods through the class chain, construction
// order, super calls, hidden fields, default methods, Object's methods,
// getClass(), clone(), instanceof and catch through the hierarchy.
public class Main {
  static StringBuilder log = new StringBuilder();

  static abstract class Shape implements Comparable<Shape> {
    protected String name;
    int id = next("Shape.id");
    { log.append("[Shape init]"); }
    Shape(String name) { this.name = name; log.append("[Shape(" + name + ")]"); }
    abstract double area();
    public String toString() { return name + " with area " + String.format("%.2f", area()); }
    public int compareTo(Shape o) { return Double.compare(area(), o.area()); }
  }

  static class Circle extends Shape {
    double r;
    int id = next("Circle.id");
    Circle(double r) { super("Circle"); this.r = r; log.append("[Circle]"); }
    double area() { return Math.PI * r * r; }
  }

  static class Square extends Shape {
    double side;
    Square(double side) { this(side, "Square"); log.append("[Square]"); }
    Square(double side, String label) { super(label); this.side = side; }
    double area() { return side * side; }
    public String toString() { return "[" + super.toString() + "]"; }
  }

  static class Unit extends Square {
    Unit() { super(1); }
    double area() { return super.area() * 1; }
  }

  static int counter = 0;
  static int next(String what) { log.append("{" + what + "}"); return ++counter; }

  interface Greeter {
    String name();
    default String greet() { return "Hello, " + name() + "!"; }
    default String shout() { return greet().toUpperCase(); }
  }
  interface Polite extends Greeter {
    default String greet() { return "Good day, " + name() + "."; }
  }
  static class Ann implements Greeter { public String name() { return "Ann"; } }
  static class Bob implements Polite {
    public String name() { return "Bob"; }
    public String shout() { return "(quietly) " + greet(); }
  }

  static class Animal {
    String sound = "...";
    String describe() { return getClass().getSimpleName() + " says " + sound(); }
    String sound() { return sound; }
  }
  static class Dog extends Animal {
    String sound = "Woof";
    String sound() { return sound + " (not " + super.sound + ")"; }
  }
  static class Puppy extends Dog { }

  static class Point implements Cloneable {
    int x, y;
    Point(int x, int y) { this.x = x; this.y = y; }
    public boolean equals(Object o) {
      if (this == o) return true;
      if (o == null || getClass() != o.getClass()) return false;
      Point p = (Point) o;
      return x == p.x && y == p.y;
    }
    public int hashCode() { return 31 * x + y; }
    public Point clone() {
      try { return (Point) super.clone(); } catch (CloneNotSupportedException e) { throw new RuntimeException(e); }
    }
  }
  static class Point3 extends Point { int z; Point3(int x, int y, int z) { super(x, y); this.z = z; } }

  static class AppException extends Exception { AppException(String m) { super(m); } }
  static class NotFound extends AppException { NotFound(String what) { super(what + " not found"); } }

  static class Plain { }

  public static void main(String[] args) {
    List<Shape> shapes = new ArrayList<>(List.of(new Circle(2), new Square(3), new Unit()));
    System.out.println(log);
    log.setLength(0);
    for (Shape s : shapes) System.out.println(s + " id=" + s.id);
    Collections.sort(shapes);
    System.out.println(shapes);
    Circle c = (Circle) shapes.get(2);
    System.out.println(c.id + " " + ((Shape) c).id + " " + c.name);

    System.out.println(new Ann().shout() + " | " + new Bob().shout() + " | " + new Bob().greet());
    Greeter g = new Bob();
    System.out.println(g instanceof Polite ? "polite" : "not");

    Animal a = new Puppy();
    System.out.println(a.describe() + " / " + a.sound + " / " + ((Dog) a).sound);
    System.out.println(a instanceof Dog);
    System.out.println(a instanceof Animal);
    System.out.println(new Animal() instanceof Dog);
    try {
      Dog d = (Dog) new Animal();
      System.out.println("no exception " + d);
    } catch (ClassCastException e) {
      System.out.println("ClassCastException");
    }

    Point p = new Point(1, 2);
    Point q = p.clone();
    q.x = 9;
    Set<Point> set = new HashSet<>(List.of(new Point(1, 2), new Point(1, 2), new Point3(1, 2, 3)));
    System.out.println(p.x + " " + q.x + " " + p.equals(new Point(1, 2)) + " " + p.equals(new Point3(1, 2, 3)) + " " + set.size());
    System.out.println(p.getClass().getName() + " " + new Point3(0, 0, 0).getClass().getSimpleName() + " " + (p.getClass() == q.getClass()));
    System.out.println("s".getClass().getName() + " " + Integer.valueOf(3).getClass().getSimpleName() + " " + new int[0].getClass().getSimpleName() + " " + new ArrayList<String>().getClass().getName());

    int[][] grid = {{1, 2}, {3, 4}};
    int[][] copy = grid.clone();
    copy[0][0] = 99;
    copy[1] = new int[] {7, 7};
    System.out.println(Arrays.deepToString(grid) + " " + Arrays.deepToString(copy));

    Plain x = new Plain(), y = new Plain();
    System.out.println(x.equals(y) + " " + x.equals(x) + " " + x.toString().startsWith("Main$Plain@") + " " + (x.hashCode() == x.hashCode()));

    try {
      throw new NotFound("key");
    } catch (AppException e) {
      System.out.println(e.getClass().getSimpleName() + ": " + e.getMessage() + " " + (e instanceof Exception));
    }
    try {
      Object o = "text";
      Integer i = (Integer) o;
      System.out.println(i);
    } catch (RuntimeException e) {
      System.out.println(e.getClass().getName());
    }
  }
}
