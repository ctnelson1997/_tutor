public class Main {
  static int total = 0;
  static final int LIMIT = 3;
  static long[] memo = new long[LIMIT];

  static class Counter {
    static int created = announce("Counter");
    int id;
    Counter() { created++; total++; id = created; }
  }

  static class Unused {
    static int value = announce("Unused");
  }

  static int announce(String name) {
    System.out.println(name + " initialized");
    return 100;
  }

  public static void main(String[] args) {
    System.out.println("start " + total + " " + LIMIT);
    memo[1] = 5;
    Counter a = new Counter();
    Counter b = new Counter();
    System.out.println(a.id + " " + b.id + " " + Counter.created + " " + total + " " + memo[1]);
  }
}
