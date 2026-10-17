import java.util.*;
public class Main {
  static class Pt {
    int x, y;
    Pt(int x, int y) { this.x = x; this.y = y; }
    @Override
    public boolean equals(Object o) {
      if (!(o instanceof Pt)) return false;
      Pt p = (Pt) o;
      return x == p.x && y == p.y;
    }
    @Override
    public int hashCode() { return 31 * x + y; }
  }
  public static void main(String[] args) {
    List<Pt> pts = new ArrayList<>();
    pts.add(new Pt(1, 2));
    System.out.println(pts.contains(new Pt(1, 2)));
    Set<Pt> set = new HashSet<>();
    set.add(new Pt(3, 4));
    set.add(new Pt(3, 4));
    System.out.println(set.size());
  }
}
