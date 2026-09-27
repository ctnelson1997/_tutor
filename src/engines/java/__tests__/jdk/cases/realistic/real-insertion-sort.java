public class Main {
  public static void insertionSort(int[] a) {
    for (int i = 1; i < a.length; i++) {
      int key = a[i];
      int j = i - 1;
      while (j >= 0 && a[j] > key) {
        a[j + 1] = a[j];
        j--;
      }
      a[j + 1] = key;
    }
  }
  public static void main(String[] args) {
    int[] a = {5, 2, 4, 6, 1, 3};
    insertionSort(a);
    for (int x : a) System.out.print(x + " ");
    System.out.println();
  }
}
