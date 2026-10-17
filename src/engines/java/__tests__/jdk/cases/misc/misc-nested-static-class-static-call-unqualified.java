public class Main {
  static class Util {
    static int twice(int x) { return x * 2; }
    static int quad(int x) { return twice(twice(x)); }
  }
  public static void main(String[] args) {
    System.out.println(Util.quad(3));
  }
}
