public class Main {
  static class Counter {
    int count = 0;
    void inc() { this.count++; }
  }
  public static void main(String[] args) {
    Counter c = new Counter();
    c.inc(); c.inc(); c.inc();
    System.out.println(c.count);
  }
}
