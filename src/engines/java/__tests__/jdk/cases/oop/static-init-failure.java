public class Main {
  static class Fragile {
    static int value = compute();
    static int compute() {
      System.out.println("computing");
      int[] a = new int[2];
      return a[5];
    }
  }

  public static void main(String[] args) {
    try {
      System.out.println(Fragile.value);
    } catch (ExceptionInInitializerError e) {
      System.out.println("init failed: " + e.getCause());
    }
    try {
      System.out.println(Fragile.value);
    } catch (NoClassDefFoundError e) {
      System.out.println("second use: " + e.getMessage());
    }
  }
}
