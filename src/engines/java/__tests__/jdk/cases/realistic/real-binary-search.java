public class Main {
  public static int binarySearch(int[] arr, int target) {
    int low = 0;
    int high = arr.length - 1;
    while (low <= high) {
      int mid = (low + high) / 2;
      if (arr[mid] == target) {
        return mid;
      } else if (arr[mid] < target) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return -1;
  }
  public static void main(String[] args) {
    int[] data = {2, 5, 8, 12, 16, 23, 38, 56, 72, 91};
    System.out.println("Index of 23: " + binarySearch(data, 23));
    System.out.println("Index of 7: " + binarySearch(data, 7));
  }
}
