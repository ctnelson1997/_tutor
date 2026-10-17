import java.util.*;
public class Main {
  public static void main(String[] args) {
    Map<String, Integer> ages = new TreeMap<>();
    ages.put("Zed", 30); ages.put("Amy", 25);
    for (Map.Entry<String, Integer> e : ages.entrySet()) {
      System.out.println(e.getKey() + " -> " + e.getValue());
    }
  }
}
