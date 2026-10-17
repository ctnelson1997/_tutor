public class Main {
  static class Pt {
    int x, y;
    Pt(int x, int y) { this.x = x; this.y = y; }
    public String toString() { return "(" + x + ", " + y + ")"; }
  }
  public static void main(String[] args) {
    Pt p = new Pt(1, 2);
    System.out.printf("p=%s%n", p);
    System.out.println(String.format("%s", p));
  }
}
