public class Main {
  static class Node { int val; Node next; }
  public static void main(String[] args) {
    Node n = new Node();
    try {
      System.out.println(n.next.val);
    } catch (NullPointerException e) {
      System.out.println("NPE");
    }
  }
}
