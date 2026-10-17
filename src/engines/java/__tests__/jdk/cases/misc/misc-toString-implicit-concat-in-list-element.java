import java.util.*;
public class Main {
  static class T { int n; T(int n) { this.n = n; } public String toString() { return "T" + n; } }
  public static void main(String[] args) {
    List<T> ts = new ArrayList<>();
    ts.add(new T(1));
    String s = "items: " + ts;
    System.out.println(s);
    StringBuilder sb = new StringBuilder();
    sb.append(ts.get(0));
    System.out.println(sb);
  }
}
