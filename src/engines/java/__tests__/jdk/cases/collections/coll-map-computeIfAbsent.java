import java.util.*;
public class Main {
  public static void main(String[] args) {
    Map<Integer, List<String>> byLen = new TreeMap<>();
    for (String w : new String[]{"hi", "yo", "hey"}) {
      byLen.computeIfAbsent(w.length(), k -> new ArrayList<>()).add(w);
    }
    System.out.println(byLen);
  }
}
