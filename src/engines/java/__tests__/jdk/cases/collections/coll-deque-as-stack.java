import java.util.*;
public class Main {
  public static void main(String[] args) {
    Deque<Integer> d = new ArrayDeque<>();
    d.push(1); d.push(2); d.push(3);
    System.out.println(d + " " + d.peek() + " " + d.pop());
  }
}
