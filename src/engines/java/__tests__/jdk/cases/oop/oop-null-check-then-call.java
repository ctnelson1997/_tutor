public class Main {
  static class Node { int v; Node next; Node(int v) { this.v = v; } }
  static int length(Node n) {
    int count = 0;
    while (n != null) { count++; n = n.next; }
    return count;
  }
  public static void main(String[] args) {
    Node a = new Node(1); a.next = new Node(2); a.next.next = new Node(3);
    System.out.println(length(a));
  }
}
