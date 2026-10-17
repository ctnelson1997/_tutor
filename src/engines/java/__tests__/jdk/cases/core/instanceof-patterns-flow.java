import java.util.*;

public class Main {
  static String describe(Object o) {
    if (!(o instanceof String s)) {
      return "not a string";
    }
    // s is in scope here because the if above can't complete normally
    return "string " + s.toUpperCase();
  }

  static int lengthIfLong(Object o) {
    if (o instanceof String s && s.length() > 3) return s.length();
    return -1;
  }

  public static void main(String[] args) {
    System.out.println(describe(42));
    System.out.println(describe("hi"));
    System.out.println(lengthIfLong("hello") + " " + lengthIfLong("hey") + " " + lengthIfLong(7));

    Object n = 12;
    if (n instanceof Integer i) System.out.println("int " + (i + 1));
    Object d = 2.5;
    System.out.println(d instanceof Double ? "double" : "not double");
    System.out.println(d instanceof Number);
    System.out.println(n instanceof Comparable);
    Object str = "text";
    System.out.println(str instanceof CharSequence cs ? "chars " + cs.length() : "no");

    List<Integer> list = new ArrayList<>();
    Object asObject = list;
    System.out.println(asObject instanceof List);
    System.out.println(asObject instanceof Collection);
    System.out.println(asObject instanceof Set);
    Map<String, Integer> map = new TreeMap<>();
    System.out.println(map instanceof Map);
    System.out.println(map instanceof SortedMap);

    int[] nums = {1, 2};
    Object arr = nums;
    System.out.println(arr instanceof int[]);
    System.out.println(arr instanceof Object[]);
    String[] words = {"a"};
    Object wordArr = words;
    System.out.println(wordArr instanceof Object[]);
    System.out.println(wordArr instanceof String[] w ? "words " + w.length : "no");

    Object nothing = null;
    System.out.println(nothing instanceof String);

    Object value = "abc";
    String result = value instanceof String v ? v + v : "?";
    System.out.println(result);
  }
}
