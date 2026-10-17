import java.util.*;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int n = sc.nextInt();
    sc.nextLine();
    int total = 0;
    for (int i = 0; i < n; i++) {
      String line = sc.nextLine();
      String[] parts = line.split(" ");
      total += Integer.parseInt(parts[1]);
      System.out.println(parts[0] + " scored " + parts[1]);
    }
    System.out.println("Total: " + total);
  }
}
