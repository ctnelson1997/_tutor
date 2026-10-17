public class Main {
  static int[] table = build();

  static int[] build() {
    System.out.println("building");
    int[] t = new int[3];
    t[3] = 1;
    return t;
  }

  public static void main(String[] args) {
    System.out.println("main never runs");
  }
}
