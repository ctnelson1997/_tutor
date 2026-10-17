public class Main {
  static int mainValue = log("Main field");
  static { log("Main static block"); }

  static int log(String msg) {
    System.out.println(msg);
    return msg.length();
  }

  static class Config {
    static final int MAX = 10;             // a constant: reading it doesn't initialize Config
    static final String NAME = "cfg";      // also a constant
    static int loaded = log("Config field");
    static { log("Config static block, loaded=" + loaded); }
    static int twice(int x) { return 2 * x; }
  }

  static class Counter {
    static int count;
    static { count = 100; log("Counter static block"); }
    int id;
    Counter() { id = ++count; }
  }

  static class Order {
    static int a = next("a");
    static { next("block"); }
    static int b = next("b");
    static int seq = 0;          // runs last, so it resets seq after a, block and b used it
    static int next(String what) {
      seq++;
      log(what + " -> " + seq);
      return seq;
    }
  }

  public static void main(String[] args) {
    log("main starts");
    System.out.println(Config.MAX + " " + Config.NAME);
    log("after constants");
    System.out.println(Config.twice(3));
    System.out.println(Config.loaded);
    new Counter();
    Counter c = new Counter();
    System.out.println("counter " + c.id);
    System.out.println(Order.a + " " + Order.b + " " + Order.seq);
  }
}
