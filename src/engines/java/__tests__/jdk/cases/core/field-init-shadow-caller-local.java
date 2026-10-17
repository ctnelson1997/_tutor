public class Main {
  static class A {
    int x = 5;
    int y = x * 2;
  }
  public static void main(String[] args) {
    int x = 100;
    A a = new A();
    System.out.println(a.y);
  }
}
