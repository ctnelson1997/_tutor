public class Main {
  public static void main(String[] args) {
    int[] a = {-2, 1, -3, 4, -1, 2, 1, -5, 4};
    int best = a[0], cur = a[0];
    for (int i = 1; i < a.length; i++) {
      cur = Math.max(a[i], cur + a[i]);
      best = Math.max(best, cur);
    }
    System.out.println(best);
  }
}
