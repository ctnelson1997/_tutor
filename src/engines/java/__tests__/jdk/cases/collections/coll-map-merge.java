import java.util.*;
public class Main {
  public static void main(String[] args) {
    Map<Character, Integer> freq = new TreeMap<>();
    for (char c : "hello".toCharArray()) freq.merge(c, 1, Integer::sum);
    System.out.println(freq);
  }
}
