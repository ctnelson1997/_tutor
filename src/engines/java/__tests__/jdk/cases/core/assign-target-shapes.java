public class Main {
  static int s = 1, calls = 0;
  static Node shared = new Node();
  static class Counter { static int n = 1; }
  static class Node {
    int v = 1;
    int[] arr = {1, 1, 1};
    Node next;
    int[] getArr() { calls++; return arr; }
    void run() {
      this.v = 5; this.v += 3; ++this.v; this.v--;
      System.out.println("this.v " + this.v);
      v *= 2; v++;
      System.out.println("v " + v);
      next = new Node();
      this.next.v += 10; this.next.v++;
      System.out.println("this.next.v " + this.next.v + " v " + v);
    }
  }
  static Node pick() { calls++; return shared; }
  static int index() { calls++; return 1; }
  public static void main(String[] args) {
    int x = 1; x = 5; x += 3; ++x; x--;
    System.out.println("x " + x);
    s += 2; Main.s *= 3; ++Main.s; s--;
    System.out.println("s " + s);
    Counter.n += 4; Counter.n++;
    System.out.println("Counter.n " + Counter.n + " s " + s);
    Node o = new Node();
    o.v = 5; o.v += 3; ++o.v; o.v--;
    System.out.println("o.v " + o.v);
    o.run();
    int[] a = {1, 1, 1};
    a[1] = 5; a[1] += 3; ++a[1]; a[1]--;
    System.out.println("a " + a[0] + " " + a[1] + " " + a[2]);
    int[][] m = {{1, 1}, {1, 1}};
    m[1][0] = 5; m[1][0] += 3; ++m[1][0]; m[1][0]--;
    System.out.println("m " + m[0][0] + " " + m[1][0] + " " + m[1][1]);
    o.arr[2] = 5; o.arr[2] += 3; ++o.arr[2]; o.arr[2]--;
    System.out.println("o.arr " + o.arr[0] + " " + o.arr[2]);
    Node[] nodes = {new Node(), new Node()};
    nodes[1].v = 5; nodes[1].v += 3; ++nodes[1].v; nodes[1].v--;
    System.out.println("nodes " + nodes[0].v + " " + nodes[1].v);
    Node head = new Node(); head.next = new Node(); head.next.next = new Node();
    head.next.next.v = 5; head.next.next.v += 3; ++head.next.next.v; head.next.next.v--;
    System.out.println("chain " + head.v + " " + head.next.v + " " + head.next.next.v);
    Main.shared.v = 5; Main.shared.v += 3;
    pick().v++; ++pick().v; pick().v--;
    System.out.println("shared " + shared.v + " calls " + calls);
    o.getArr()[0] += 10; o.getArr()[0]++;
    a[index()] += 100; a[index()]--;
    System.out.println("o.arr[0] " + o.arr[0] + " a[1] " + a[1] + " calls " + calls);
  }
}
