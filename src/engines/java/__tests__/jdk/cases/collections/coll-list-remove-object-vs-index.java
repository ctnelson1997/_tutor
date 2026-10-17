import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<Integer> nums = new ArrayList<>(Arrays.asList(10, 20, 30, 40));
    nums.remove(1);
    System.out.println(nums);
    nums.remove(Integer.valueOf(40));
    System.out.println(nums);
  }
}
