import java.util.*;
public class Main {
  static class Box { int v() { return 1; } }
  public static void main(String[] args) {
    String s = null;
    try { s.length(); } catch (NullPointerException e) { System.out.println("NPE caught"); }
    Box[] arr = new Box[1];
    try { arr[0].v(); } catch (NullPointerException e) { System.out.println("NPE 2"); }
    Object o = null;
    try { o.toString(); } catch (RuntimeException e) { System.out.println("RTE"); }
    try { Integer.parseInt("12abc"); } catch (NumberFormatException e) { System.out.println(e); }
    try { new Scanner("abc").nextInt(); } catch (InputMismatchException e) { System.out.println(e); }
    System.out.println(new IllegalStateException("bad state"));
    System.out.println("out1");
    System.err.println("err1");
    System.out.println("out2");
    try {
      throw new IllegalArgumentException("boom");
    } catch (IllegalArgumentException e) {
      e.printStackTrace();
    }
    System.out.println("done");
  }
}
