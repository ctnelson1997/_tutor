public class Main {
  static java.util.List<String> make() {
    java.util.List<String> list = new java.util.ArrayList<>();
    list.add("b");
    list.add("a");
    return list;
  }

  public static void main(String[] args) {
    java.util.List<String> list = make();
    java.util.Collections.sort(list);
    System.out.println(list);

    java.util.Map<String, Integer> counts = new java.util.TreeMap<>();
    for (String s : new String[] {"x", "y", "x"}) counts.put(s, counts.getOrDefault(s, 0) + 1);
    System.out.println(counts);

    int[] nums = {3, 1, 2};
    java.util.Arrays.sort(nums);
    System.out.println(java.util.Arrays.toString(nums));

    try {
      int zero = 0;
      System.out.println(1 / zero);
    } catch (java.lang.ArithmeticException e) {
      System.out.println("caught " + e.getMessage());
    }

    Object o = "fq";
    System.out.println(o instanceof java.lang.String);
    java.lang.StringBuilder sb = new java.lang.StringBuilder("ab");
    System.out.println(sb.reverse());
    var set = new java.util.HashSet<Integer>();
    set.add(1);
    System.out.println(set.size());
  }
}
