public class Main {
  static int log(String msg) {
    System.out.println(msg);
    return msg.length();
  }

  static class Widget {
    int a = log("field a");
    { log("block 1, a=" + a + ", b=" + this.b); }
    int b = log("field b");
    int[] parts = new int[a];
    { log("block 2, parts=" + parts.length); }

    Widget() {
      this(log("computing default size"));
      log("no-arg constructor body");
    }

    Widget(int size) {
      log("int constructor body, size=" + size + ", b=" + b);
    }
  }

  static class Plain {
    String label = "plain";
    int n;
  }

  public static void main(String[] args) {
    Widget w = new Widget();
    System.out.println(w.a + " " + w.b + " " + w.parts.length);
    log("---");
    new Widget(3);
    Plain p = new Plain();
    System.out.println(p.label + " " + p.n);
  }
}
