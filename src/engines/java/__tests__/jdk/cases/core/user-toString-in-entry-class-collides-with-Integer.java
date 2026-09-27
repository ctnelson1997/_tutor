public class Main {
  int v = 3;
  public String toString() { return "Main(" + v + ")"; }
  public static void main(String[] args) {
    System.out.println(Integer.toString(42));
    System.out.println(new Main());
  }
}
