import java.util.Arrays;
public class Main {
  static void mergeSort(int[] a, int lo, int hi) {
    if (hi - lo < 1) return;
    int mid = (lo + hi) / 2;
    mergeSort(a, lo, mid);
    mergeSort(a, mid + 1, hi);
    int[] tmp = new int[hi - lo + 1];
    int i = lo, j = mid + 1, k = 0;
    while (i <= mid && j <= hi) {
      if (a[i] <= a[j]) tmp[k++] = a[i++];
      else tmp[k++] = a[j++];
    }
    while (i <= mid) tmp[k++] = a[i++];
    while (j <= hi) tmp[k++] = a[j++];
    for (k = 0; k < tmp.length; k++) a[lo + k] = tmp[k];
  }
  public static void main(String[] args) {
    int[] a = {38, 27, 43, 3, 9, 82, 10};
    mergeSort(a, 0, a.length - 1);
    System.out.println(Arrays.toString(a));
  }
}
