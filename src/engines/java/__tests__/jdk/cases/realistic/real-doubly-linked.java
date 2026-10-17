public class Main {
  static class DNode {
    String val; DNode prev, next;
    DNode(String v) { val = v; }
  }
  public static void main(String[] args) {
    DNode head = new DNode("a");
    DNode mid = new DNode("b");
    DNode tail = new DNode("c");
    head.next = mid; mid.prev = head;
    mid.next = tail; tail.prev = mid;
    head.next.next.prev = head;
    for (DNode n = tail; n != null; n = n.prev) System.out.print(n.val);
    System.out.println();
  }
}
