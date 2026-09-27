public class Main {
  static int f() {
    try {
      return 1;
    } finally {
      System.out.println("finally runs");
    }
  }
  public static void main(String[] args) {
    System.out.println(f());
  }
}
