public class Main {
  public static void main(String[] args) {
    int[] a = new int[50];
    for (int i = 0; i < a.length; i++) a[i] = (i * 37) % 50;
    for (int i = 0; i < a.length; i++)
      for (int j = 0; j + 1 < a.length - i; j++)
        if (a[j] > a[j + 1]) { int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; }
    System.out.println(a[0] + " " + a[49]);
  }
}
