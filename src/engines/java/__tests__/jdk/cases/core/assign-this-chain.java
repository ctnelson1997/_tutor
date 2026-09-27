public class Main {
  static class Node {
    int val; Node next;
    Node(int v) { val = v; }
  }
  static class List {
    Node head;
    void addTwo(int a, int b) {
      this.head = new Node(a);
      this.head.next = new Node(b);
    }
  }
  public static void main(String[] args) {
    List l = new List();
    l.addTwo(1, 2);
    System.out.println(l.head.val + " " + l.head.next.val);
  }
}
