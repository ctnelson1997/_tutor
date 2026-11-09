public class Main {
  interface A { default String m() { return "A"; } }
  interface B { default String m() { return "B"; } }
  static class C implements A, B {}
  public static void main(String[] args) {
    System.out.println(new C().m());
  }
}
