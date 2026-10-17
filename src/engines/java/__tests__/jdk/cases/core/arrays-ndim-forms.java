import java.util.Arrays;

public class Main {
  static int sizeCalls = 0;
  static int size() { sizeCalls++; return 2; }

  public static void main(String[] args) {
    int[][][] cube = new int[2][3][4];
    cube[1][2][3] = 9;
    System.out.println(cube.length + " " + cube[1].length + " " + cube[1][2].length + " " + cube[1][2][3]);

    // a jagged array: rows are created later
    int[][] tri = new int[3][];
    System.out.println(tri[0] == null);
    for (int r = 0; r < tri.length; r++) {
      tri[r] = new int[r + 1];
      tri[r][r] = r;
    }
    System.out.println(Arrays.deepToString(tri));

    String[][] names = new String[2][2];
    System.out.println(names[1][0]);
    boolean[] flags = new boolean[2];
    char[] letters = new char[2];
    System.out.println(flags[0] + " " + (int) letters[1]);

    // each dimension expression runs once
    int[][] grid = new int[size()][size()];
    System.out.println(grid.length + "x" + grid[0].length + " calls " + sizeCalls);

    // initializers convert their elements, and nested initializers make rows
    double[] ds = {1, 2};
    System.out.println(ds[0] + ds[1]);
    long[] ls = {3, 4};
    System.out.println(ls[0] * ls[1]);
    int[][] square = new int[][] {{1, 2}, {3, 4}};
    System.out.println(square[1][0] + square[0][1]);

    try {
      int[] bad = new int[size() - 3];
      System.out.println("not reached " + bad.length);
    } catch (NegativeArraySizeException e) {
      System.out.println("negative size " + e.getMessage());
    }

    int a[] = {1, 2, 3}, b = 4;
    System.out.println(a.length + b);
  }
}
