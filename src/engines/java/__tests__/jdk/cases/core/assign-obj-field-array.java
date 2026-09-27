public class Main {
  static class Stack { int[] data = new int[4]; int top = 0; }
  public static void main(String[] args) {
    Stack s = new Stack();
    s.data[0] = 42;
    s.top = 1;
    System.out.println(s.data[0] + " " + s.top);
  }
}
