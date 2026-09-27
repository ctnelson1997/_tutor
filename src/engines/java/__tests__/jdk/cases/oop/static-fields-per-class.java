public class Main {
  static int count = 1000;

  static class A {
    static int count = 1;
    static int bump() { return ++count; }
  }

  static class B {
    static int count = 50;
    int read() { return count; }
    static int outer() { return Main.count; }
  }

  static class Node {
    int value;
    Node(int value) { this.value = value; total += value; } // Main.total: a nested class sees its outer class's statics
  }

  static int total = 0;

  public static void main(String[] args) {
    System.out.println(A.bump() + " " + A.count);
    System.out.println(new B().read() + " " + B.outer());
    B.count += 5;
    System.out.println(B.count + " " + count);
    new Node(3);
    new Node(4);
    System.out.println(total);
  }
}
