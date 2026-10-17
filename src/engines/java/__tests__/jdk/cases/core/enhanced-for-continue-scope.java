public class Main {
  public static void main(String[] args) {
    int[] nums = {1, 2, 3, 4};
    int total = 0;
    for (int n : nums) {
      int doubled = n * 2;
      if (n % 2 == 0) continue;
      total += doubled;
    }
    System.out.println(total);
  }
}
