import java.util.*;
public class Main {
  public static void main(String[] args) {
    String[] names = {"bob", "Amy", "carl"};
    Arrays.sort(names);
    System.out.println(Arrays.toString(names));
    int[][] g = {{1, 2}, {3, 4}};
    System.out.println(Arrays.deepToString(g));
  }
}
