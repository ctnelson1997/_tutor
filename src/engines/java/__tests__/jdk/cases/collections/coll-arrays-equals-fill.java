import java.util.*;
public class Main {
  public static void main(String[] args) {
    int[] a = new int[4];
    Arrays.fill(a, 7);
    int[] b = {7, 7, 7, 7};
    System.out.println(Arrays.equals(a, b) + " " + (a == b));
  }
}
