import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<Integer> xs = new ArrayList<>(List.of(4, 8, 1, 8, 3));
    System.out.println(Collections.max(xs) + " " + Collections.min(xs) + " " + Collections.frequency(xs, 8));
    Collections.reverse(xs);
    System.out.println(xs);
  }
}
