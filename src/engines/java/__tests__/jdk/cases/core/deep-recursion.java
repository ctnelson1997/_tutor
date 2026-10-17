public class Main {
  static int depth(int n) { return n == 0 ? 0 : 1 + depth(n - 1); }
  public static void main(String[] args) {
    System.out.println(depth(900));
  }
}
