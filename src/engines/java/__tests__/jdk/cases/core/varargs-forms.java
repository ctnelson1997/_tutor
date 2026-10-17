public class Main {
  static int sum(int... nums) {
    int total = 0;
    for (int n : nums) total += n;
    return total;
  }

  static String join(String sep, String... parts) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < parts.length; i++) {
      if (i > 0) sb.append(sep);
      sb.append(parts[i]);
    }
    return sb.toString();
  }

  static double average(double... xs) {
    if (xs.length == 0) return 0;
    double total = 0;
    for (double x : xs) total += x;
    return total / xs.length;
  }

  static String which(int a) { return "one int"; }
  static String which(int... a) { return "varargs of " + a.length; }

  public static void main(String[] args) {
    System.out.println(sum());
    System.out.println(sum(5));
    System.out.println(sum(1, 2, 3, 4));
    int[] arr = {10, 20};
    System.out.println(sum(arr));
    System.out.println(join("-", "a", "b", "c"));
    System.out.println("[" + join("-") + "]");
    System.out.println(average(1, 2));
    System.out.println(which(1) + ", " + which() + ", " + which(1, 2));
  }
}
