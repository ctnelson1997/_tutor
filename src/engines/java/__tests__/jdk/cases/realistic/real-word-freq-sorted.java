import java.util.*;
public class Main {
  public static void main(String[] args) {
    String text = "to be or not to be that is the question";
    Map<String, Integer> freq = new HashMap<>();
    for (String w : text.split(" ")) {
      if (freq.containsKey(w)) freq.put(w, freq.get(w) + 1);
      else freq.put(w, 1);
    }
    List<String> keys = new ArrayList<>(freq.keySet());
    Collections.sort(keys);
    for (String k : keys) System.out.println(k + ": " + freq.get(k));
  }
}
