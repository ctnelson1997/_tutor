import java.util.*;
import java.util.stream.*;
// #68: HashMap merge/compute/computeIfAbsent and groupingBy put keys as the JDK does,
// a seeded shuffle draws from its Random, thenComparingInt orders by its key, and
// replaceAll leaves an access-ordered LinkedHashMap's order alone.
public class Main {
  record S(String name, int id, double gpa, long big) {}
  public static void main(String[] args) {
    Map<String, Integer> counts = new HashMap<>();
    for (String w : "Aa BB Aa".split(" ")) counts.merge(w, 1, Integer::sum);
    System.out.println(counts);
    String text = "the best of times it was the worst of times it was the age of wisdom it was the age of foolishness worst best epoch belief incredulity season light darkness spring hope winter despair we had everything before us nothing";
    Map<String, Integer> wc = new HashMap<>();
    for (String w : text.split(" ")) wc.merge(w, 1, Integer::sum);
    System.out.println(wc);
    Map<String, Integer> wcPut = new HashMap<>();
    for (String w : text.split(" ")) wcPut.put(w, wcPut.getOrDefault(w, 0) + 1);
    System.out.println(wcPut);
    Map<String, List<Integer>> pos = new HashMap<>();
    String[] ws = text.split(" ");
    for (int i = 0; i < ws.length; i++) pos.computeIfAbsent(ws[i], k -> new ArrayList<>()).add(i);
    System.out.println(pos.keySet());
    Map<String, Integer> comp = new HashMap<>();
    for (String w : ws) comp.compute(w, (k, v) -> v == null ? 1 : v + 1);
    System.out.println(comp.keySet());
    System.out.println(Arrays.stream(ws).collect(Collectors.groupingBy(s -> s, Collectors.counting())));
    System.out.println(Arrays.stream(ws).collect(Collectors.groupingBy(String::length)).keySet());
    Map<Integer, Integer> nums = new HashMap<>();
    for (int i = 0; i < 40; i++) nums.merge(i * 7 % 50, i, Integer::sum);
    System.out.println(nums);
    Map<String, Integer> coll = new HashMap<>();
    for (String w : new String[] {"Aa", "BB", "AaAa", "BBBB", "AaBB", "BBAa", "C"}) coll.merge(w, w.length(), Integer::sum);
    System.out.println(coll);
    for (int n : new int[] {10, 52}) {
      List<Integer> list = new ArrayList<>();
      for (int i = 1; i <= n; i++) list.add(i);
      Random rnd = new Random(42);
      Collections.shuffle(list, rnd);
      System.out.println(list + " next=" + rnd.nextInt(100));
    }
    List<S> people = new ArrayList<>(List.of(new S("bo", 3, 3.5, 30L), new S("al", 2, 3.9, 10L), new S("bo", 1, 2.0, 20L), new S("al", 1, 3.9, 5L)));
    people.sort(Comparator.comparing((S s) -> s.name()).thenComparingInt(s -> s.id()));
    System.out.println(people);
    people.sort(Comparator.comparingDouble((S s) -> s.gpa()).thenComparingLong(s -> s.big()));
    System.out.println(people);
    people.sort(Comparator.comparing(S::name).thenComparingDouble(S::gpa).reversed());
    System.out.println(people);
    Map<String, Integer> lru = new LinkedHashMap<>(16, 0.75f, true);
    lru.put("a", 1); lru.put("b", 2); lru.put("c", 3);
    lru.get("a");
    lru.replaceAll((k, v) -> v * 10);
    System.out.println(lru);
    lru.merge("b", 5, Integer::sum);
    System.out.println(lru);
    lru.computeIfAbsent("d", k -> 4);
    System.out.println(lru);
    Map<String, Integer> plain = new HashMap<>(Map.of("x", 1, "y", 2));
    plain.replaceAll((k, v) -> v + 100);
    System.out.println(plain);
    try { plain.replaceAll((k, v) -> { plain.put("z", 0); return v; }); } catch (ConcurrentModificationException e) { System.out.println("CME"); }
    Map<String, Integer> tree = new TreeMap<>();
    for (String w : "b a c a".split(" ")) tree.merge(w, 1, Integer::sum);
    System.out.println(tree);
    Map<String, Integer> rm = new HashMap<>(Map.of("k", 1));
    rm.merge("k", 1, (a, b) -> null);
    rm.compute("q", (k, v) -> null);
    System.out.println(rm + " " + rm.size());
  }
}
