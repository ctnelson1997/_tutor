public class Main {
  static class MathUtil {
    static int square(int x) { return x * x; }
  }
  static class Calc {
    int base = 3;
    int compute() { return MathUtil.square(base) + 1; }
  }
  public static void main(String[] args) {
    System.out.println(new Calc().compute());
  }
}
