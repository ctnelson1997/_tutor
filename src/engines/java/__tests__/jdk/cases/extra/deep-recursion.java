// Recursion deeper than the steps can show (#73): Java's stack holds thousands of frames.
public class Main {
  static int sum(int n) { return n == 0 ? 0 : n + sum(n - 1); }

  static long total(int n) {
    if (n == 0) {
      return 0;
    }
    long below = total(n - 1);
    return below + n;
  }

  static int calls = 0;

  static int endless(int n) {
    calls++;
    return endless(n + 1) + 1;
  }

  public static void main(String[] args) {
    System.out.println(sum(1300));
    System.out.println(total(6000));
    try {
      endless(0);
    } catch (StackOverflowError e) {
      System.out.println("endless recursion: StackOverflowError after more than 5000 calls: " + (calls > 5000));
    }
  }
}
