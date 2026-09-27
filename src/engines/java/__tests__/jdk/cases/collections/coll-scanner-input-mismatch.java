import java.util.*;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    try {
      int x = sc.nextInt();
      System.out.println("got " + x);
    } catch (InputMismatchException e) {
      System.out.println("bad input");
    }
  }
}
