import java.util.*;
import java.util.function.*;
import java.util.stream.*;
// #70: valid programs the binder used to reject: yield of a variable, a diamond
// with Comparator.comparingInt, Map.Entry.comparingByValue() as an argument, a
// pattern variable after while (!(o instanceof T t)), and java.lang.Void.
public class Main {
  static class Node { String name; int dist; Node(String n, int d) { name = n; dist = d; } }
  public static void main(String[] args) {
    for (int n = 1; n <= 3; n++) {
      String size = switch (n) {
        case 1 -> "one";
        case 2 -> { String t = "few"; yield t; }
        default -> { int k = n * 2; yield k > 4 ? "many" : "some"; }
      };
      System.out.println(size);
    }
    int code = switch ("b") { case "a": yield 1; case "b": { int v = 2; yield v; } default: yield 0; };
    System.out.println(code);
    PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[1]));
    pq.add(new int[] {1, 5}); pq.add(new int[] {2, 1}); pq.add(new int[] {3, 3});
    System.out.println(pq.poll()[0] + " " + pq.poll()[0]);
    PriorityQueue<Node> nodes = new PriorityQueue<>(Comparator.comparingInt(nd -> nd.dist));
    nodes.add(new Node("a", 4)); nodes.add(new Node("b", 2));
    System.out.println(nodes.peek().name);
    PriorityQueue<Node> byName = new PriorityQueue<>((p, q) -> p.name.compareTo(q.name));
    byName.add(new Node("z", 1)); byName.add(new Node("m", 1));
    System.out.println(byName.peek().name);
    Map<String, Integer> freq = new HashMap<>(Map.of("a", 3, "b", 1, "c", 2));
    List<Map.Entry<String, Integer>> entries = new ArrayList<>(freq.entrySet());
    entries.sort(Map.Entry.comparingByValue());
    System.out.println(entries);
    System.out.println(freq.entrySet().stream().sorted(Map.Entry.comparingByValue()).map(Map.Entry::getKey).collect(Collectors.toList()));
    System.out.println(Collections.max(freq.entrySet(), Map.Entry.comparingByValue()).getKey());
    System.out.println(Collections.max(freq.entrySet(), Map.Entry.comparingByKey()).getKey());
    Object o = "start";
    int steps = 0;
    while (!(o instanceof Integer i)) {
      o = steps++ == 0 ? (Object) 2.5 : (Object) 21;
    }
    System.out.println(i * 2);
    Function<String, Void> f = s -> { System.out.println("got " + s); return null; };
    f.apply("x");
    Void nothing = null;
    System.out.println(nothing);
  }
}
