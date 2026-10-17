import java.util.*;
public class Main {
  static class Range implements Iterable<Integer> {
    int lo, hi;
    Range(int lo, int hi) { this.lo = lo; this.hi = hi; }
    public Iterator<Integer> iterator() {
      return new Iterator<Integer>() {
        int cur = lo;
        public boolean hasNext() { return cur < hi; }
        public Integer next() { return cur++; }
      };
    }
  }
  public static void main(String[] args) {
    for (int x : new Range(3, 6)) System.out.print(x + " ");
    System.out.println();
  }
}
