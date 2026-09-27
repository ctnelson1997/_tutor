import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<String> xs = new ArrayList<>(List.of("a", "b", "c"));
    try {
      for (String x : xs) if (x.equals("a")) xs.remove(x);
      System.out.println("no exception " + xs);
    } catch (ConcurrentModificationException e) {
      System.out.println("CME");
    }
  }
}
