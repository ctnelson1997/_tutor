public class Main {
  public static void main(String[] args) {
    int[][] m = {{1, 2, 3}, {4, 5, 6}};
    int[][] t = new int[m[0].length][m.length];
    for (int i = 0; i < m.length; i++)
      for (int j = 0; j < m[i].length; j++)
        t[j][i] = m[i][j];
    for (int[] row : t) {
      for (int v : row) System.out.printf("%-3d", v);
      System.out.println();
    }
  }
}
