import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<String> xs = List.of("a", "b");
    try {
      xs.add("c");
      System.out.println("added");
    } catch (UnsupportedOperationException e) {
      System.out.println("UOE");
    }
  }
}
