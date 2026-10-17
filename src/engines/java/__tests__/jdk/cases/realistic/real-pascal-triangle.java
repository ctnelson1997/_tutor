public class Main {
  public static void main(String[] args) {
    int rows = 6;
    int[][] tri = new int[rows][];
    for (int i = 0; i < rows; i++) {
      tri[i] = new int[i + 1];
      tri[i][0] = 1;
      tri[i][i] = 1;
      for (int j = 1; j < i; j++) {
        tri[i][j] = tri[i - 1][j - 1] + tri[i - 1][j];
      }
    }
    for (int[] row : tri) {
      StringBuilder sb = new StringBuilder();
      for (int v : row) sb.append(v).append(' ');
      System.out.println(sb.toString().trim());
    }
  }
}
