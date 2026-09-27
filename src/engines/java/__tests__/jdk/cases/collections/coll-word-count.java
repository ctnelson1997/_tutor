import java.util.*;
public class Main {
  public static void main(String[] args) {
    String text = "the cat and the hat and the bat";
    Map<String, Integer> counts = new HashMap<>();
    for (String w : text.split(" ")) {
      counts.put(w, counts.getOrDefault(w, 0) + 1);
    }
    System.out.println(counts);
  }
}
