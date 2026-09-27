public class Main {
  static int[] arr = new int[3];
  static StringBuilder log = new StringBuilder();
  static int[] a() { log.append("a "); return arr; }
  static int i() { log.append("i "); return 1; }
  static int e() { log.append("e "); return 7; }
  static int rhs() { log.append("rhs "); return 1; }
  static class Node { int v; }
  public static void main(String[] args) {
    a()[i()] = e();
    System.out.println(log + "| " + arr[1]);
    log.setLength(0);
    a()[i()] += e();
    System.out.println(log + "| " + arr[1]);
    log.setLength(0);
    try { arr[5] = rhs(); } catch (ArrayIndexOutOfBoundsException ex) { log.append("AIOOBE"); }
    System.out.println(log);
    log.setLength(0);
    try { arr[5] += rhs(); } catch (ArrayIndexOutOfBoundsException ex) { log.append("AIOOBE"); }
    System.out.println(log);
    Node n = null;
    log.setLength(0);
    try { n.v = rhs(); } catch (NullPointerException ex) { log.append("NPE"); }
    System.out.println(log);
    log.setLength(0);
    try { n.v += rhs(); } catch (NullPointerException ex) { log.append("NPE"); }
    System.out.println(log);
  }
}
