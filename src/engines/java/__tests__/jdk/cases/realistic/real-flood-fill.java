public class Main {
  static int fill(char[][] g, int r, int c) {
    if (r < 0 || c < 0 || r >= g.length || c >= g[0].length) return 0;
    if (g[r][c] != '.') return 0;
    g[r][c] = '#';
    return 1 + fill(g, r + 1, c) + fill(g, r - 1, c) + fill(g, r, c + 1) + fill(g, r, c - 1);
  }
  public static void main(String[] args) {
    char[][] grid = {
      "..X.".toCharArray(),
      ".XX.".toCharArray(),
      "....".toCharArray()
    };
    System.out.println(fill(grid, 0, 0));
    for (char[] row : grid) System.out.println(new String(row));
  }
}
