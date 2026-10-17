import java.util.*;
public class Main {
  public static void main(String[] args) {
    Stack<String> st = new Stack<>();
    st.push("x"); st.push("y");
    System.out.println(st + " " + st.peek() + " " + st.isEmpty());
  }
}
