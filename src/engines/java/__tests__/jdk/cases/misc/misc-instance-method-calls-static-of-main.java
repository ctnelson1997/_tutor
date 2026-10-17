public class Main {
  static int helper(int x) { return x + 1; }
  static class Worker {
    int run(int v) { return helper(v) * 10; }
  }
  public static void main(String[] args) {
    System.out.println(new Worker().run(4));
  }
}
