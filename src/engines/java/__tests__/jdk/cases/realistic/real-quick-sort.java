public class Main {
  static int partition(int[] a, int lo, int hi) {
    int pivot = a[hi];
    int i = lo - 1;
    for (int j = lo; j < hi; j++) {
      if (a[j] < pivot) {
        i++;
        int t = a[i]; a[i] = a[j]; a[j] = t;
      }
    }
    int t = a[i + 1]; a[i + 1] = a[hi]; a[hi] = t;
    return i + 1;
  }
  static void quickSort(int[] a, int lo, int hi) {
    if (lo < hi) {
      int p = partition(a, lo, hi);
      quickSort(a, lo, p - 1);
      quickSort(a, p + 1, hi);
    }
  }
  public static void main(String[] args) {
    int[] a = {10, 7, 8, 9, 1, 5};
    quickSort(a, 0, a.length - 1);
    for (int v : a) System.out.print(v + " ");
    System.out.println();
  }
}
