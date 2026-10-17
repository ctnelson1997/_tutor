public class Main {
  static int f(int n) { return f(n + 1) + 1; }
  public static void main(String[] args) {
    try {
      f(0);
    } catch (StackOverflowError e) {
      System.out.println("SO caught");
    }
  }
}
