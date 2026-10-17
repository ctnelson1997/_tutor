public class Main {
  static class A { static int count = 1; }
  static class B { static int count = 2; }
  public static void main(String[] args) {
    System.out.println(A.count + " " + B.count);
  }
}
