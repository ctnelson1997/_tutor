public class Main {
  public static void main(String[] args) {
    Rectangle r = new Rectangle(3, 4);
    System.out.println("Area: " + r.area());
    System.out.println("Perimeter: " + r.perimeter());
    r.scale(2);
    System.out.println("Scaled area: " + r.area());
  }
}
class Rectangle {
  private int width;
  private int height;
  public Rectangle(int width, int height) {
    this.width = width;
    this.height = height;
  }
  public int area() { return width * height; }
  public int perimeter() { return 2 * (width + height); }
  public void scale(int factor) {
    width *= factor;
    height *= factor;
  }
}
