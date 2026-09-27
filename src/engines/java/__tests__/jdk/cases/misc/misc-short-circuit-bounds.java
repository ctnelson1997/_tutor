public class Main {
  public static void main(String[] args) {
    int[] a = {3, 8, 1};
    int i = 0;
    while (i < a.length && a[i] != 1) i++;
    System.out.println(i);
  }
}
