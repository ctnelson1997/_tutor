import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<Integer> a = new ArrayList<>(List.of(1, 2, 3));
    List<Integer> b = new ArrayList<>(List.of(1, 2, 3));
    System.out.println(a.equals(b));
    System.out.println(a == b);
  }
}
