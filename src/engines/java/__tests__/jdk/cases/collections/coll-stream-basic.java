import java.util.*;
import java.util.stream.*;
public class Main {
  public static void main(String[] args) {
    List<Integer> nums = List.of(1, 2, 3, 4, 5, 6);
    int evenSum = nums.stream().filter(n -> n % 2 == 0).mapToInt(Integer::intValue).sum();
    System.out.println(evenSum);
    List<String> strs = nums.stream().map(n -> "#" + n).collect(Collectors.toList());
    System.out.println(strs);
  }
}
