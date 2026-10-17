import java.util.*;
public class Main {
  static void permute(String prefix, String rest, List<String> out) {
    if (rest.isEmpty()) {
      out.add(prefix);
      return;
    }
    for (int i = 0; i < rest.length(); i++) {
      permute(prefix + rest.charAt(i), rest.substring(0, i) + rest.substring(i + 1), out);
    }
  }
  public static void main(String[] args) {
    List<String> perms = new ArrayList<>();
    permute("", "abc", perms);
    System.out.println(perms);
  }
}
