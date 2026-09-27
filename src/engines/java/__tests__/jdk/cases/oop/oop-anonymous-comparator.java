import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<String> words = new ArrayList<>(Arrays.asList("pear", "fig", "banana"));
    Collections.sort(words, new Comparator<String>() {
      public int compare(String a, String b) { return a.length() - b.length(); }
    });
    System.out.println(words);
  }
}
