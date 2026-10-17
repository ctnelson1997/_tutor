public class Main {
  static void risky() {
    throw new IllegalStateException("inner");
  }
  public static void main(String[] args) {
    try {
      try {
        risky();
      } catch (IllegalStateException e) {
        throw new RuntimeException("wrapped: " + e.getMessage());
      }
    } catch (RuntimeException e) {
      System.out.println(e.getMessage());
    }
  }
}
