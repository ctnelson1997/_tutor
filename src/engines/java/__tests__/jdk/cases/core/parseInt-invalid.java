public class Main {
  public static void main(String[] args) {
    try {
      int n = Integer.parseInt("12abc");
      System.out.println("parsed " + n);
    } catch (NumberFormatException e) {
      System.out.println("NFE: " + e.getMessage());
    }
  }
}
