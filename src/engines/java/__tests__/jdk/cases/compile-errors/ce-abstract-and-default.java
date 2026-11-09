public class Main {
  interface A { default String m() { return "A"; } }
  interface B { String m(); }
  static class C implements A, B {}
  interface D extends A, B {}
  public static void main(String[] args) {
    System.out.println(new C().m());
  }
}
