public class Main {
  static class ArrayStack {
    private int[] items;
    private int top;
    public ArrayStack(int capacity) {
      items = new int[capacity];
      top = -1;
    }
    public void push(int x) {
      if (top == items.length - 1) {
        throw new IllegalStateException("Stack full");
      }
      items[++top] = x;
    }
    public int pop() {
      if (isEmpty()) {
        throw new IllegalStateException("Stack empty");
      }
      return items[top--];
    }
    public int peek() { return items[top]; }
    public boolean isEmpty() { return top == -1; }
  }
  public static void main(String[] args) {
    ArrayStack s = new ArrayStack(3);
    s.push(1);
    s.push(2);
    s.push(3);
    try {
      s.push(4);
    } catch (IllegalStateException e) {
      System.out.println("Caught: " + e.getMessage());
    }
    while (!s.isEmpty()) {
      System.out.println(s.pop());
    }
  }
}
