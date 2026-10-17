public class Main {
  public static void main(String[] args) {
    int[] a = new int[3];
    try {
      a[5] = 1;
    } catch (ArrayIndexOutOfBoundsException e) {
      System.out.println("caught: " + e.getMessage());
    }
  }
}
