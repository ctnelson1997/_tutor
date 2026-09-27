public class Main {
  public static void main(String[] args) {
    int[] a = {1, 2, 3, 4, 5};
    for (int i = 0, j = a.length - 1; i < j; i++, j--) {
      int t = a[i]; a[i] = a[j]; a[j] = t;
    }
    for (int v : a) System.out.print(v + " ");
    System.out.println();
  }
}
