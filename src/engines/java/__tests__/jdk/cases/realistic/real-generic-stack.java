import java.util.ArrayList;
public class Main {
  static class MyStack<T> {
    private ArrayList<T> items = new ArrayList<>();
    public void push(T item) { items.add(item); }
    public T pop() {
      if (items.isEmpty()) throw new RuntimeException("empty");
      return items.remove(items.size() - 1);
    }
    public T peek() { return items.get(items.size() - 1); }
    public boolean isEmpty() { return items.isEmpty(); }
    public int size() { return items.size(); }
  }
  public static boolean balanced(String s) {
    MyStack<Character> st = new MyStack<>();
    for (char c : s.toCharArray()) {
      if (c == '(' || c == '[') st.push(c);
      else if (c == ')' || c == ']') {
        if (st.isEmpty()) return false;
        char open = st.pop();
        if ((c == ')' && open != '(') || (c == ']' && open != '[')) return false;
      }
    }
    return st.isEmpty();
  }
  public static void main(String[] args) {
    System.out.println(balanced("([()])") + " " + balanced("([)]") + " " + balanced("(("));
  }
}
