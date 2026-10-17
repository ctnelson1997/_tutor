import java.util.*;

public class Main {
  static class ByLength implements Comparator<String> {
    public int compare(String a, String b) { return a.length() - b.length(); }
  }

  static class Task {
    String name;
    int priority;
    Task(String name, int priority) { this.name = name; this.priority = priority; }
    public String toString() { return name + "(" + priority + ")"; }
  }

  static class ByPriority implements Comparator<Task> {
    public int compare(Task a, Task b) { return Integer.compare(a.priority, b.priority); }
  }

  public static void main(String[] args) {
    List<String> words = new ArrayList<>(List.of("pear", "fig", "banana", "kiwi"));
    Collections.sort(words, new ByLength());
    System.out.println(words);
    words.sort(Collections.reverseOrder());
    System.out.println(words);
    words.sort(null);
    System.out.println(words);

    String[] arr = {"bb", "a", "ccc"};
    Arrays.sort(arr, new ByLength());
    System.out.println(Arrays.toString(arr));
    Arrays.sort(arr, Comparator.reverseOrder());
    System.out.println(Arrays.toString(arr));

    PriorityQueue<Task> queue = new PriorityQueue<>(new ByPriority());
    queue.add(new Task("write", 3));
    queue.add(new Task("test", 1));
    queue.add(new Task("ship", 2));
    StringBuilder order = new StringBuilder();
    while (!queue.isEmpty()) order.append(queue.poll()).append(' ');
    System.out.println(order.toString().trim());

    PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
    for (int x : new int[] {4, 9, 1}) maxHeap.offer(x);
    System.out.println(maxHeap.poll() + " " + maxHeap.poll());

    TreeSet<String> byLen = new TreeSet<>(new ByLength());
    byLen.add("aa");
    byLen.add("b");
    byLen.add("cc");   // same length as "aa": the comparator calls it equal, so it isn't added
    System.out.println(byLen + " " + byLen.contains("zz"));

    TreeMap<String, Integer> ci = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
    ci.put("b", 1);
    ci.put("A", 2);
    ci.put("B", 3);
    System.out.println(ci);

    Comparator<String> desc = Comparator.<String>naturalOrder().reversed();
    List<String> letters = new ArrayList<>(List.of("x", "z", "y"));
    letters.sort(desc);
    System.out.println(letters);

    System.out.println(Collections.max(words, new ByLength()) + " " + Collections.min(words, new ByLength()));
    System.out.println(new ByLength().compare("abc", "a"));
    try {
      Collections.max(new ArrayList<String>());
    } catch (NoSuchElementException e) {
      System.out.println("empty max");
    }
  }
}
