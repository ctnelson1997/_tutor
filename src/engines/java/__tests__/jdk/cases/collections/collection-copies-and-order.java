import java.util.*;

public class Main {
  static class Point {
    int x;
    Point(int x) { this.x = x; }
  }

  public static void main(String[] args) {
    Map<String, Integer> scores = new LinkedHashMap<>();
    scores.put("amy", 3);
    scores.put("bob", 1);
    Map<String, Integer> copy = new LinkedHashMap<>(scores);
    copy.put("cat", 2);
    System.out.println(scores + " " + copy);
    Map<String, Integer> sorted = new TreeMap<>(copy);
    System.out.println(sorted);

    List<Integer> nums = new ArrayList<>(List.of(3, 1, 2));
    Set<Integer> set = new TreeSet<>(nums);
    System.out.println(set);
    PriorityQueue<Integer> pq = new PriorityQueue<>(nums);
    System.out.println(pq.poll());

    // Points have no natural order: Java refuses to sort them.
    Point[] points = { new Point(2), new Point(1) };
    try {
      Arrays.sort(points);
      System.out.println("sorted");
    } catch (ClassCastException e) {
      System.out.println("CCE: Point is not Comparable");
    }
  }
}
