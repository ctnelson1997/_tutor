import java.util.*;
public class Main {
  public static void main(String[] args) {
    Map<String, List<String>> groups = new TreeMap<>();
    String[] names = {"ann", "bob", "amy", "ben", "cal"};
    for (String n : names) {
      String key = n.substring(0, 1);
      if (!groups.containsKey(key)) groups.put(key, new ArrayList<>());
      groups.get(key).add(n);
    }
    System.out.println(groups);
  }
}
