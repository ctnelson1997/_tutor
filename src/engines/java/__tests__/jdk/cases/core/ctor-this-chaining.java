public class Main {
  static class Point {
    int x, y;
    Point() { this(0, 0); }
    Point(int x, int y) { this.x = x; this.y = y; }
  }
  public static void main(String[] args) {
    Point p = new Point();
    Point q = new Point(3, 4);
    System.out.println(p.x + "," + p.y + " " + q.x + "," + q.y);
  }
}
