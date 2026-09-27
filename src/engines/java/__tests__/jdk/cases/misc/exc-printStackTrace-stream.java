public class Main {
  public static void main(String[] args) {
    try {
      throw new RuntimeException("oops");
    } catch (RuntimeException e) {
      e.printStackTrace();
    }
    System.out.println("after");
  }
}
