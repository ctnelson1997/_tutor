public class Main {
  static class Grid {
    int size = 3;
    int[][] cells = new int[size][size];
    int area = size * size;
  }
  public static void main(String[] args) {
    Grid g = new Grid();
    System.out.println(g.cells.length + " " + g.area);
  }
}
