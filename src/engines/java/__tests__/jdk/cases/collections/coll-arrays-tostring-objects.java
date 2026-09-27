import java.util.*;
public class Main {
  static class P { int v; P(int v) { this.v = v; } public String toString() { return "P" + v; } }
  public static void main(String[] args) {
    P[] ps = { new P(1), new P(2) };
    System.out.println(Arrays.toString(ps));
    double[] ds = {1.0, 2.5};
    System.out.println(Arrays.toString(ds));
    String[] ss = {"x", null};
    System.out.println(Arrays.toString(ss));
  }
}
