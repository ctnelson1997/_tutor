public class Main {
  static class Acc {
    int total = 10;
    int add(int total) { this.total += total; return this.total; }
  }
  public static void main(String[] args) {
    Acc a = new Acc();
    System.out.println(a.add(5));
  }
}
