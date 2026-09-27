public class Main {
  public static void main(String[] args) {
    try {
      Object o = null;
      o.toString();
    } catch (IllegalArgumentException e) {
      System.out.println("IAE");
    } catch (RuntimeException e) {
      System.out.println("RTE");
    }
  }
}
