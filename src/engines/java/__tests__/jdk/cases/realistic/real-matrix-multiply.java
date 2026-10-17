public class Main {
  public static int[][] multiply(int[][] a, int[][] b) {
    int n = a.length, m = b[0].length, k = b.length;
    int[][] c = new int[n][m];
    for (int i = 0; i < n; i++)
      for (int j = 0; j < m; j++)
        for (int x = 0; x < k; x++)
          c[i][j] += a[i][x] * b[x][j];
    return c;
  }
  public static void main(String[] args) {
    int[][] a = {{1, 2}, {3, 4}};
    int[][] b = {{5, 6}, {7, 8}};
    int[][] c = multiply(a, b);
    for (int[] row : c) {
      for (int v : row) System.out.printf("%4d", v);
      System.out.println();
    }
  }
}
