public class Main {
  static class Node {
    int v; Node parent;
    Node(int v) { this.v = v; }
    Node child(int cv) { Node c = new Node(cv); c.parent = this; return c; }
  }
  public static void main(String[] args) {
    Node root = new Node(1);
    Node kid = root.child(2);
    System.out.println(kid.parent.v + " " + (kid.parent == root));
  }
}
