import java.util.*;
public class Main {
  public static void main(String[] args) {
    LinkedList<Integer> ll = new LinkedList<>();
    ll.add(2); ll.addFirst(1); ll.addLast(3);
    System.out.println(ll + " " + ll.getFirst() + " " + ll.getLast());
    ll.removeFirst();
    System.out.println(ll);
  }
}
