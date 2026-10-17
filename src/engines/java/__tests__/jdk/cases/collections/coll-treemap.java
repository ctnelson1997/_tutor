import java.util.*;
public class Main {
  public static void main(String[] args) {
    TreeMap<String, Integer> t = new TreeMap<>();
    t.put("m", 1); t.put("c", 2); t.put("x", 3);
    System.out.println(t + " " + t.firstKey() + " " + t.lastKey());
    System.out.println(t.floorKey("n") + " " + t.ceilingKey("d"));
  }
}
