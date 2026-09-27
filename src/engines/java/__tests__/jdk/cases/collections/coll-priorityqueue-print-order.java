import java.util.*;
public class Main {
  public static void main(String[] args) {
    PriorityQueue<Integer> pq = new PriorityQueue<>();
    pq.add(5); pq.add(1); pq.add(4); pq.add(2); pq.add(3);
    System.out.println(pq);
    System.out.println(pq.poll() + " " + pq.poll());
  }
}
