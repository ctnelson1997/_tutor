public class Main {
  static double avg(int[] a) {
    int s = 0;
    for (int x : a) s += x;
    return s / a.length;
  }
  public static void main(String[] args) {
    System.out.println(avg(new int[]{1, 2}));
    System.out.println(avg(new int[0]));
  }
}
