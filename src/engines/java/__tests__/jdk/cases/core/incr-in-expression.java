public class Main {
  public static void main(String[] args) {
    int x = 5;
    int y = x++ + ++x;
    System.out.println(x + " " + y);
    int i = 0;
    i = i++;
    System.out.println(i);
  }
}
