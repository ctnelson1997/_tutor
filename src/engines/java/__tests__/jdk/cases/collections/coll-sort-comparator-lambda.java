import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<String> words = new ArrayList<>(List.of("pear", "fig", "banana"));
    words.sort((a, b) -> a.length() - b.length());
    System.out.println(words);
    Collections.sort(words, Collections.reverseOrder());
    System.out.println(words);
  }
}
