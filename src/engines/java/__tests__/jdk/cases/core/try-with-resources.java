import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    try (Scanner sc = new Scanner("5 7")) {
      int a = sc.nextInt();
      int b = sc.nextInt();
      System.out.println(a + b);
    }
  }
}
