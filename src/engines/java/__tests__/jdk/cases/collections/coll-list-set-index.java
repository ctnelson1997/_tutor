import java.util.*;
public class Main {
  public static void main(String[] args) {
    ArrayList<String> xs = new ArrayList<>();
    xs.add("a"); xs.add("b");
    try {
      xs.set(5, "z");
      System.out.println("no error");
    } catch (IndexOutOfBoundsException e) {
      System.out.println("IOOBE");
    }
  }
}
