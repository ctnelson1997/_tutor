import java.util.*;
public class Main {
  public static void main(String[] args) {
    Scanner in = new Scanner(System.in);
    int sum = 0, count = 0;
    while (in.hasNextInt()) {
      sum += in.nextInt();
      count++;
    }
    System.out.println("avg=" + (double) sum / count);
  }
}
