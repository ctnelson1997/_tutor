public class Main {
  public static void main(String[] args) {
    int n = 0;
    while (true) {
      int sq = n * n;
      if (sq > 50) break;
      n++;
    }
    System.out.println(n);
  }
}
