public class Main {
  static class Counter { int count = 0; }
  public static void main(String[] args) {
    Counter c = new Counter();
    c.count++;
    c.count += 5;
    System.out.println(c.count);
  }
}
