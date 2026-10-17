public class Main {
  static String describe(int x) { return "int " + x; }
  static String describe(String s) { return "String " + s; }
  static String describe(double d) { return "double " + d; }
  public static void main(String[] args) {
    System.out.println(describe(5));
    System.out.println(describe("hi"));
    System.out.println(describe(2.5));
  }
}
