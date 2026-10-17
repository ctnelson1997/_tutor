import java.util.*;
public class Main {
  public static void main(String[] args) {
    Map<String, Integer> m = new HashMap<>();
    m.put("banana", 3);
    m.put("apple", 1);
    m.put("cherry", 7);
    m.put("date", 2);
    System.out.println(m);
    for (String k : m.keySet()) System.out.print(k + " ");
    System.out.println();
  }
}
