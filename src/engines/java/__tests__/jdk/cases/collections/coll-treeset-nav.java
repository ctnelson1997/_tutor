import java.util.*;
public class Main {
  public static void main(String[] args) {
    TreeSet<Integer> ts = new TreeSet<>(List.of(5, 1, 9, 3));
    System.out.println(ts + " " + ts.first() + " " + ts.last());
    System.out.println(ts.floor(4) + " " + ts.ceiling(4) + " " + ts.higher(5));
  }
}
