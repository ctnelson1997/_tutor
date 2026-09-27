public class Main {
  static int[] squares = new int[5];
  static {
    for (int i = 0; i < 5; i++) squares[i] = i * i;
  }
  public static void main(String[] args) {
    System.out.println(squares[4]);
  }
}
