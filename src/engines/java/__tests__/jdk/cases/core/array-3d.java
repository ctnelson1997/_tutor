public class Main {
  public static void main(String[] args) {
    int[][][] cube = new int[2][3][4];
    cube[1][2][3] = 7;
    System.out.println(cube.length + " " + cube[0].length + " " + cube[0][0].length + " " + cube[1][2][3]);
  }
}
