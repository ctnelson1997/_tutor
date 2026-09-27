import java.util.Arrays;
public class Main {
  public static void selectionSort(int[] arr) {
    for (int i = 0; i < arr.length - 1; i++) {
      int minIndex = i;
      for (int j = i + 1; j < arr.length; j++) {
        if (arr[j] < arr[minIndex]) {
          minIndex = j;
        }
      }
      int temp = arr[i];
      arr[i] = arr[minIndex];
      arr[minIndex] = temp;
    }
  }
  public static void main(String[] args) {
    int[] nums = {64, 25, 12, 22, 11};
    System.out.println("Before: " + Arrays.toString(nums));
    selectionSort(nums);
    System.out.println("After:  " + Arrays.toString(nums));
  }
}
