import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<Integer> nums = List.of(1, 2, 3);
    nums.forEach(n -> System.out.print(n * n + " "));
    System.out.println();
  }
}
