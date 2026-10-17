public class Main {
  static class Point {
    int x, y;
    Point() { this(5, 7); }
    Point(int x, int y) { this.x = x; this.y = y; }
  }
  public static void main(String[] args) {
    Point p = new Point();
    System.out.println(p.x + "," + p.y);
  }
}
