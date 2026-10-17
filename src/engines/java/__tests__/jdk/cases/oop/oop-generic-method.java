public class Main {
  static <T> void printAll(T[] items) {
    for (T t : items) System.out.print(t + ";");
    System.out.println();
  }
  public static void main(String[] args) {
    printAll(new String[]{"a", "b"});
    printAll(new Integer[]{1, 2});
  }
}
