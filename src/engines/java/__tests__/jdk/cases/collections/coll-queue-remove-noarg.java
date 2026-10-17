import java.util.*;
public class Main {
  public static void main(String[] args) {
    Queue<String> q = new LinkedList<>();
    q.add("a"); q.add("b"); q.offer("c");
    String first = q.remove();
    System.out.println(first + " " + q.peek() + " " + q.size());
  }
}
