import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<Integer> nums = new ArrayList<>(List.of(1, 2, 3, 4, 5, 6));
    Iterator<Integer> it = nums.iterator();
    while (it.hasNext()) {
      if (it.next() % 2 == 0) it.remove();
    }
    System.out.println(nums);
  }
}
