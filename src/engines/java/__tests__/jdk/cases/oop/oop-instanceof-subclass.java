public class Main {
  static class A {}
  static class B extends A {}
  public static void main(String[] args) {
    A x = new B();
    System.out.println(x instanceof A);
    System.out.println(x instanceof B);
  }
}
