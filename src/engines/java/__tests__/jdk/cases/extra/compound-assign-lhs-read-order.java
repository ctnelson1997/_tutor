public class Main {
  public static void main(String[] args) {
    int x = 1;
    x += (x = 5);
    System.out.println(x);
  }
}
