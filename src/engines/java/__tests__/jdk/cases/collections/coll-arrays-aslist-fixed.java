import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<Integer> xs = Arrays.asList(3, 1, 2);
    Collections.sort(xs);
    System.out.println(xs);
    try {
      xs.add(4);
    } catch (UnsupportedOperationException e) {
      System.out.println("UOE");
    }
  }
}
