public class Main {
  static class Node {
    int val; Node next;
    Node(int v) { val = v; }
  }
  public static void main(String[] args) {
    Node a = new Node(1);
    a.next = new Node(2);
    a.next.next = new Node(3);
    System.out.println(a.val + " " + a.next.val + " " + a.next.next.val);
  }
}
