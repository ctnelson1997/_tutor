import java.util.*;
public class Main {
  public static void main(String[] args) {
    PriorityQueue<Integer> pq = new PriorityQueue<>((a, b) -> b - a);
    pq.add(5); pq.add(1); pq.add(9);
    System.out.println(pq.poll());
  }
}
