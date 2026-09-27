public class Main {
  public static void main(String[] args) {
    try {
      throw new IllegalStateException("bad state");
    } catch (IllegalStateException e) {
      System.out.println(e);
    }
    throw new IllegalArgumentException("boom");
  }
}
