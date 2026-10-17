public class Main {
  static class A { int v() { return 1; } }
  public static void main(String[] args) {
    A[] arr = new A[2];
    try {
      System.out.println(arr[0].v());
    } catch (NullPointerException e) {
      System.out.println("NPE");
    }
  }
}
