public class Main {
  static int total = 0;
  static class Counter {
    static int created = 0;
    Counter() { created++; }
  }
  public static void main(String[] args) {
    Main.total = 5;
    new Counter();
    new Counter();
    System.out.println(Main.total + " " + Counter.created);
  }
}
