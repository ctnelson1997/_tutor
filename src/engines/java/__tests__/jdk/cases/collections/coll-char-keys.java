import java.util.*;
public class Main {
  public static void main(String[] args) {
    Map<Character, Integer> freq = new HashMap<>();
    for (char c : "mississippi".toCharArray()) {
      freq.put(c, freq.getOrDefault(c, 0) + 1);
    }
    System.out.println(freq);
  }
}
