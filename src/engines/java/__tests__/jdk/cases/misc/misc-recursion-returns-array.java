public class Main {
  static int[] range(int n) {
    if (n == 0) return new int[0];
    int[] prev = range(n - 1);
    int[] cur = new int[n];
    for (int i = 0; i < prev.length; i++) cur[i] = prev[i];
    cur[n - 1] = n;
    return cur;
  }
  public static void main(String[] args) {
    int[] r = range(4);
    System.out.println(r.length + " " + r[3]);
  }
}
