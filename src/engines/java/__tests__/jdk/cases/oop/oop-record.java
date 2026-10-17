public class Main {
  record Point(int x, int y) {}
  public static void main(String[] args) {
    Point p = new Point(1, 2);
    System.out.println(p.x() + p.y());
    System.out.println(p);
  }
}
