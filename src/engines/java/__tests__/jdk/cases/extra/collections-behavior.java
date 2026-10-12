import java.util.*;

// Collections as java.util has them (#21): iteration order, views, iterators,
// immutability, navigation, and the exceptions with their messages.
public class Main {
  static class Point {
    final int x, y;
    Point(int x, int y) { this.x = x; this.y = y; }
    @Override public boolean equals(Object o) {
      if (!(o instanceof Point)) return false;
      Point p = (Point) o;
      return x == p.x && y == p.y;
    }
    @Override public int hashCode() { return 31 * x + y; }
    @Override public String toString() { return "(" + x + "," + y + ")"; }
  }

  static void report(String label, RuntimeException e) {
    System.out.println(label + ": " + e);
  }

  public static void main(String[] args) {
    // HashMap / HashSet order, including a resize past 12 entries and negative hashes
    Map<String, Integer> ages = new HashMap<>();
    String[] names = {"zoe", "adam", "mia", "liam", "noah", "emma", "olivia", "ava", "lucas", "ella", "leo", "ivy", "max", "sam"};
    for (int i = 0; i < names.length; i++) ages.put(names[i], i);
    System.out.println(ages);
    Set<Integer> nums = new HashSet<>(List.of(-5, 100, 17, 33, 1, 64, -1));
    System.out.println(nums);
    Set<Character> letters = new HashSet<>();
    for (char c : "hello world".toCharArray()) letters.add(c);
    System.out.println(letters);
    Map<Point, String> grid = new HashMap<>();
    grid.put(new Point(1, 2), "a");
    grid.put(new Point(0, 5), "b");
    grid.put(new Point(1, 2), "c");
    System.out.println(grid + " " + grid.get(new Point(0, 5)) + " " + grid.containsKey(new Point(9, 9)));
    Map<Long, Boolean> flags = new HashMap<>();
    flags.put(5000000000L, true);
    flags.put(3L, false);
    System.out.println(flags + " " + flags.get(3L));
    Map<Character, Integer> counts = new HashMap<>();
    counts.put('a', 1);
    System.out.println(counts.get('a') + " " + counts.containsKey((char) 97));

    // LinkedHashMap with access order
    LinkedHashMap<String, Integer> lru = new LinkedHashMap<>(16, 0.75f, true);
    lru.put("a", 1); lru.put("b", 2); lru.put("c", 3);
    lru.get("a");
    lru.put("b", 20);
    System.out.println(lru);

    // PriorityQueue keeps a binary heap
    PriorityQueue<Integer> pq = new PriorityQueue<>();
    for (int n : new int[] {7, 3, 9, 1, 8, 2}) pq.offer(n);
    System.out.println(pq + " peek=" + pq.peek());
    pq.remove(3);
    System.out.println(pq + " poll=" + pq.poll() + " " + pq);
    PriorityQueue<String> words = new PriorityQueue<>(Collections.reverseOrder());
    words.addAll(List.of("pear", "fig", "apple", "kiwi"));
    System.out.println(words);
    System.out.println(new PriorityQueue<>(List.of(5, 1, 4, 2, 3)));

    // Iterator.remove, and for-each loops that change their collection
    List<Integer> xs = new ArrayList<>(List.of(1, 2, 3, 4, 5, 6));
    Iterator<Integer> it = xs.iterator();
    while (it.hasNext()) if (it.next() % 2 == 0) it.remove();
    System.out.println(xs);
    try {
      Iterator<Integer> i2 = xs.iterator();
      i2.next();
      i2.remove();
      i2.remove();
    } catch (IllegalStateException e) { report("remove twice", e); }
    Set<String> fruit = new HashSet<>(List.of("apple", "banana", "cherry", "date"));
    Iterator<String> fi = fruit.iterator();
    while (fi.hasNext()) if (fi.next().contains("a")) fi.remove();
    System.out.println(fruit);
    List<String> ys = new ArrayList<>(List.of("a", "b", "c", "d"));
    for (String y : ys) if (y.equals("c")) ys.remove(y);
    System.out.println("second-to-last removed: " + ys);
    try {
      for (String y : ys) if (y.equals("a")) ys.remove(y);
    } catch (ConcurrentModificationException e) { report("remove in for-each", e); }
    try {
      for (String y : ys) ys.add("z");
    } catch (ConcurrentModificationException e) { report("add in for-each", e); }
    Map<String, Integer> stock = new HashMap<>(Map.of("x", 1, "y", 2, "z", 3));
    try {
      for (String k : stock.keySet()) stock.put(k + k, 0);
    } catch (ConcurrentModificationException e) { report("put in keySet loop", e); }
    Map<String, Integer> prices = new HashMap<>(Map.of("x", 1, "y", 2));
    for (String k : prices.keySet()) prices.put(k, prices.get(k) + 1);
    System.out.println("replacing values in the loop: " + prices);

    // Views: keySet, values, entrySet write through to the map
    Map<String, Integer> scores = new TreeMap<>(Map.of("ann", 90, "bob", 72, "cy", 85, "dee", 60));
    Set<String> keys = scores.keySet();
    Collection<Integer> vals = scores.values();
    scores.put("eve", 99);
    System.out.println(keys + " " + vals);
    keys.remove("bob");
    vals.remove(60);
    System.out.println(scores);
    for (Map.Entry<String, Integer> e : scores.entrySet()) e.setValue(e.getValue() + 1);
    System.out.println(scores);
    Iterator<Map.Entry<String, Integer>> ei = scores.entrySet().iterator();
    while (ei.hasNext()) if (ei.next().getValue() > 95) ei.remove();
    System.out.println(scores + " " + keys.size());
    try {
      keys.add("zed");
    } catch (UnsupportedOperationException e) { report("keySet add", e); }

    // subList is a view of its list
    List<Integer> base = new ArrayList<>(List.of(10, 20, 30, 40, 50, 60));
    List<Integer> mid = base.subList(1, 4);
    mid.set(0, 21);
    mid.add(35);
    System.out.println(base + " " + mid + " " + mid.size());
    base.subList(0, 2).clear();
    System.out.println(base);
    try {
      mid.get(0);
    } catch (ConcurrentModificationException e) { report("stale subList", e); }
    try {
      base.subList(2, 1);
    } catch (IllegalArgumentException e) { report("subList bounds", e); }

    // Arrays.asList writes through to its array; List.of and unmodifiable views refuse changes
    String[] arr = {"c", "a", "b"};
    List<String> fixed = Arrays.asList(arr);
    Collections.sort(fixed);
    fixed.set(0, "A");
    System.out.println(Arrays.toString(arr) + " " + fixed);
    arr[2] = "Z";
    System.out.println(fixed);
    try {
      fixed.add("d");
    } catch (UnsupportedOperationException e) { report("asList add", e); }
    try {
      fixed.remove("A");
    } catch (UnsupportedOperationException e) { report("asList remove", e); }
    System.out.println("asList remove missing: " + fixed.remove("q"));
    try {
      List.of(1, 2).set(0, 5);
    } catch (UnsupportedOperationException e) { report("List.of set", e); }
    try {
      List.of(1, null);
    } catch (NullPointerException e) { report("List.of null", e); }
    try {
      Set.of("a", "a");
    } catch (IllegalArgumentException e) { report("Set.of duplicate", e); }
    try {
      Map.of("k", 1, "k", 2);
    } catch (IllegalArgumentException e) { report("Map.of duplicate", e); }
    List<String> backing = new ArrayList<>(List.of("p", "q"));
    List<String> readOnly = Collections.unmodifiableList(backing);
    backing.add("r");
    System.out.println(readOnly + " " + readOnly.size() + " " + readOnly.contains("r"));
    try {
      readOnly.add("s");
    } catch (UnsupportedOperationException e) { report("unmodifiable add", e); }
    try {
      Iterator<String> ri = readOnly.iterator();
      ri.next();
      ri.remove();
    } catch (UnsupportedOperationException e) { report("unmodifiable iterator remove", e); }
    try {
      Collections.nCopies(3, "x").add("y");
    } catch (UnsupportedOperationException e) { report("nCopies add", e); }

    // TreeMap and TreeSet navigation
    TreeMap<Integer, String> tm = new TreeMap<>();
    for (int k : new int[] {50, 20, 80, 10, 30}) tm.put(k, "v" + k);
    System.out.println(tm.floorKey(25) + " " + tm.ceilingKey(25) + " " + tm.higherKey(30) + " " + tm.lowerKey(10));
    System.out.println(tm.firstEntry() + " " + tm.lastEntry() + " " + tm.floorEntry(79) + " " + tm.ceilingEntry(81));
    System.out.println(tm.headMap(30) + " " + tm.tailMap(30) + " " + tm.subMap(20, 80) + " " + tm.headMap(30, true));
    System.out.println(tm.descendingMap() + " " + tm.descendingKeySet() + " " + tm.navigableKeySet().floor(55));
    System.out.println(tm.pollFirstEntry() + " " + tm.pollLastEntry() + " " + tm);
    try {
      tm.firstEntry().setValue("no");
    } catch (UnsupportedOperationException e) { report("firstEntry setValue", e); }
    TreeSet<String> ts = new TreeSet<>(List.of("kiwi", "apple", "mango", "fig"));
    System.out.println(ts.first() + " " + ts.last() + " " + ts.floor("grape") + " " + ts.ceiling("grape") + " " + ts.higher("mango") + " " + ts.lower("apple"));
    System.out.println(ts.headSet("kiwi") + " " + ts.tailSet("kiwi") + " " + ts.subSet("b", "l") + " " + ts.descendingSet());
    Iterator<String> di = ts.descendingIterator();
    StringBuilder sb = new StringBuilder();
    while (di.hasNext()) sb.append(di.next()).append(' ');
    System.out.println(sb.toString().trim() + " | " + ts.pollFirst() + " " + ts.pollLast() + " " + ts);
    try {
      new TreeSet<Integer>().first();
    } catch (NoSuchElementException e) { report("TreeSet first of empty", e); }
    try {
      new TreeMap<String, Integer>().get(null);
    } catch (NullPointerException e) { System.out.println("TreeMap null key: NullPointerException"); }

    // equals, hashCode, toString
    System.out.println(List.of(1, 2, 3).equals(new LinkedList<>(List.of(1, 2, 3))) + " " + new HashSet<>(List.of(1, 2)).equals(new TreeSet<>(List.of(2, 1))));
    System.out.println(new HashMap<>(Map.of("a", 1)).equals(new TreeMap<>(Map.of("a", 1))) + " " + List.of(1, 2).equals(Set.of(1, 2)));
    System.out.println(List.of("a", "b").hashCode() + " " + Set.of(1, 2, 3).hashCode() + " " + Map.of("k", "v").hashCode() + " " + Arrays.hashCode(new int[] {1, 2}));
    List<Point> pts = new ArrayList<>(List.of(new Point(1, 1), new Point(2, 3)));
    System.out.println(pts + " " + pts.contains(new Point(2, 3)) + " " + pts.indexOf(new Point(9, 9)) + " " + Arrays.toString(pts.toArray()));
    List<Object> self = new ArrayList<>();
    self.add("me");
    self.add(self);
    System.out.println(self);
    Set<List<Integer>> setOfLists = new HashSet<>();
    setOfLists.add(List.of(1, 2));
    System.out.println(setOfLists.contains(new ArrayList<>(List.of(1, 2))));

    // Stack, Deque, Queue
    Stack<String> st = new Stack<>();
    st.push("a"); st.push("b"); st.push("c");
    System.out.println(st + " " + st.search("a") + " " + st.search("c") + " " + st.search("q") + " " + st.empty());
    try {
      new Stack<Integer>().pop();
    } catch (EmptyStackException e) { report("empty pop", e); }
    Deque<Integer> dq = new ArrayDeque<>();
    dq.offerFirst(2); dq.offerLast(3); dq.push(1); dq.addLast(4);
    System.out.println(dq + " " + dq.peekFirst() + " " + dq.peekLast() + " " + dq.pollLast() + " " + dq.pop() + " " + dq);
    try {
      new ArrayDeque<String>().add(null);
    } catch (NullPointerException e) { System.out.println("deque null: NullPointerException"); }
    try {
      new ArrayDeque<Integer>().remove();
    } catch (NoSuchElementException e) { report("empty remove", e); }
    try {
      new LinkedList<Integer>().element();
    } catch (NoSuchElementException e) { report("empty element", e); }
    Queue<String> q = new LinkedList<>(List.of("x", "y"));
    System.out.println(q.remove() + " " + q.element() + " " + q.poll() + " " + q.poll());

    // Index errors, with each class's message
    List<String> al = new ArrayList<>(List.of("a", "b"));
    try { al.get(2); } catch (IndexOutOfBoundsException e) { report("ArrayList.get", e); }
    try { al.set(5, "z"); } catch (IndexOutOfBoundsException e) { report("ArrayList.set", e); }
    try { al.add(3, "z"); } catch (IndexOutOfBoundsException e) { report("ArrayList.add", e); }
    try { new LinkedList<>(al).get(4); } catch (IndexOutOfBoundsException e) { report("LinkedList.get", e); }
    try { new Vector<>(al).get(2); } catch (IndexOutOfBoundsException e) { report("Vector.get", e); }
    try { Arrays.asList(1, 2).get(3); } catch (IndexOutOfBoundsException e) { report("asList.get", e); }

    // Collections helpers, toArray, bulk operations
    List<Integer> cs = new ArrayList<>(List.of(1, 2, 3, 4, 5));
    Collections.rotate(cs, 2);
    Collections.swap(cs, 0, 4);
    System.out.println(cs + " " + Collections.frequency(List.of(1, 2, 1), 1) + " " + Collections.disjoint(List.of(1), List.of(2)));
    Collections.sort(cs);
    System.out.println(Collections.binarySearch(cs, 4) + " " + Collections.binarySearch(cs, 9));
    String[] out = new ArrayList<>(List.of("q", "r")).toArray(new String[0]);
    System.out.println(out.length + " " + out[1] + " " + Arrays.toString(out));
    List<Integer> keep = new ArrayList<>(List.of(1, 2, 3, 4, 5, 6));
    keep.removeAll(List.of(2, 4));
    keep.retainAll(Set.of(1, 3, 6, 7));
    System.out.println(keep + " " + keep.containsAll(List.of(1, 6)) + " " + new HashSet<>(keep).containsAll(List.of(1, 2)));
    List<Integer> ins = new ArrayList<>(List.of(1, 5));
    ins.addAll(1, List.of(2, 3, 4));
    System.out.println(ins + " " + ins.remove(0) + " " + ins);
  }
}
