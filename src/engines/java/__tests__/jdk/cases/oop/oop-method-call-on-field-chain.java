public class Main {
  static class Node {
    int val; Node next;
    Node(int v) { val = v; }
    int getVal() { return val; }
  }
  public static void main(String[] args) {
    Node head = new Node(1);
    head.next = new Node(2);
    System.out.println(head.next.getVal());
  }
}
